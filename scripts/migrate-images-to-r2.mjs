#!/usr/bin/env node
/**
 * migrate-images-to-r2.mjs
 *
 * Veritabanındaki tüm ürün görsellerini (image tablosu + product.thumbnail)
 * Cloudflare R2'ye taşır. Dış URL'lerden ve kayıp yerel dosyalardan görselleri
 * indirir, webp-s3 provider mantığıyla R2'ye yükler, DB'yi günceller.
 *
 * Kullanım (backend container içinde):
 *   node scripts/migrate-images-to-r2.mjs
 *
 * Ortam değişkenleri (.env'den gelir):
 *   S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_ENDPOINT,
 *   S3_FILE_URL, S3_REGION, DATABASE_URL
 */

import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import sharp from "sharp";
import pg from "pg";
import path from "path";
import https from "https";
import http from "http";

const { Client } = pg;

// ── Config ───────────────────────────────────────────────────────
const S3_BUCKET = process.env.S3_BUCKET;
const S3_ACCESS_KEY_ID = process.env.S3_ACCESS_KEY_ID;
const S3_SECRET_ACCESS_KEY = process.env.S3_SECRET_ACCESS_KEY;
const S3_ENDPOINT = process.env.S3_ENDPOINT;
const S3_FILE_URL = (process.env.S3_FILE_URL || "").replace(/\/+$/, "");
const S3_REGION = process.env.S3_REGION || "auto";
const DATABASE_URL = process.env.DATABASE_URL;

if (!S3_BUCKET || !S3_ACCESS_KEY_ID || !S3_SECRET_ACCESS_KEY || !S3_FILE_URL) {
  console.error("❌ S3 env vars eksik (S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_FILE_URL)");
  process.exit(1);
}
if (!DATABASE_URL) {
  console.error("❌ DATABASE_URL eksik");
  process.exit(1);
}

const s3 = new S3Client({
  region: S3_REGION,
  credentials: {
    accessKeyId: S3_ACCESS_KEY_ID,
    secretAccessKey: S3_SECRET_ACCESS_KEY,
  },
  ...(S3_ENDPOINT ? { endpoint: S3_ENDPOINT, forcePathStyle: true } : {}),
});

// ── Helpers ──────────────────────────────────────────────────────

/** URL'den buffer indir */
function downloadUrl(url, maxRedirects = 5) {
  return new Promise((resolve, reject) => {
    if (maxRedirects <= 0) return reject(new Error("Too many redirects"));
    const lib = url.startsWith("https") ? https : http;
    lib.get(url, { headers: { "User-Agent": "MigrationBot/1.0" } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(downloadUrl(res.headers.location, maxRedirects - 1));
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve(Buffer.concat(chunks)));
      res.on("error", reject);
    }).on("error", reject);
  });
}

/** Buffer'ı WebP'e çevir (zaten webp/svg ise atla) */
async function toWebp(buffer, filename) {
  const isSvg = /\.svg$/i.test(filename);
  const isWebp = /\.webp$/i.test(filename);
  if (isSvg) return { buffer, ext: ".svg", contentType: "image/svg+xml" };
  if (isWebp) return { buffer, ext: ".webp", contentType: "image/webp" };
  try {
    const webpBuf = await sharp(buffer).webp({ quality: 85 }).toBuffer();
    return { buffer: webpBuf, ext: ".webp", contentType: "image/webp" };
  } catch {
    // sharp başarısız olursa orijinali yükle
    const ext = path.extname(filename) || ".bin";
    return { buffer, ext, contentType: "application/octet-stream" };
  }
}

/** R2'ye yükle, public URL döndür */
async function uploadToR2(buffer, originalFilename) {
  const { buffer: finalBuf, ext, contentType } = await toWebp(buffer, originalFilename);
  const parsed = path.parse(originalFilename);
  const safeName = parsed.name.replace(/[^a-zA-Z0-9-_]/g, "-").slice(0, 80);
  const key = `${safeName}-${Date.now()}-${finalBuf.length % 100000}${ext}`;

  await s3.send(
    new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
      Body: finalBuf,
      ContentType: contentType,
    })
  );

  return `${S3_FILE_URL}/${key}`;
}

/** Tek bir URL'yi R2'ye taşı. Zaten R2 URL'siyse atla. */
async function migrateUrl(url) {
  // Zaten R2'deyse atla
  if (url.includes(S3_FILE_URL) || url.includes("r2.dev")) {
    console.log(`  ⏭  Zaten R2'de: ${url.slice(0, 80)}...`);
    return null;
  }

  console.log(`  ⬇  İndiriliyor: ${url.slice(0, 100)}...`);
  const buffer = await downloadUrl(url);
  const filename = path.basename(new URL(url).pathname);
  console.log(`  ⬆  R2'ye yükleniyor (${(buffer.length / 1024).toFixed(1)} KB)...`);
  const newUrl = await uploadToR2(buffer, filename);
  console.log(`  ✅ Yeni URL: ${newUrl}`);
  return newUrl;
}

// ── Main ─────────────────────────────────────────────────────────
async function main() {
  const db = new Client({ connectionString: DATABASE_URL });
  await db.connect();
  console.log("🔗 Veritabanına bağlandı\n");

  // 1) image tablosundaki tüm URL'leri taşı
  const { rows: images } = await db.query("SELECT id, url FROM image WHERE deleted_at IS NULL ORDER BY id");
  console.log(`📸 ${images.length} görsel bulundu (image tablosu)\n`);

  let successCount = 0;
  let failCount = 0;

  for (const img of images) {
    console.log(`[${img.id}]`);
    try {
      const newUrl = await migrateUrl(img.url);
      if (newUrl) {
        await db.query("UPDATE image SET url = $1, updated_at = NOW() WHERE id = $2", [newUrl, img.id]);
        console.log(`  📝 DB güncellendi\n`);
        successCount++;
      }
    } catch (err) {
      console.error(`  ❌ HATA: ${err.message}\n`);
      failCount++;
    }
  }

  // 2) product.thumbnail alanlarını taşı
  const { rows: products } = await db.query(
    "SELECT id, title, thumbnail FROM product WHERE thumbnail IS NOT NULL AND deleted_at IS NULL ORDER BY id"
  );
  console.log(`\n🏷  ${products.length} ürün thumbnail'i bulundu\n`);

  for (const prod of products) {
    console.log(`[${prod.id}] ${prod.title}`);
    try {
      const newUrl = await migrateUrl(prod.thumbnail);
      if (newUrl) {
        await db.query("UPDATE product SET thumbnail = $1, updated_at = NOW() WHERE id = $2", [newUrl, prod.id]);
        console.log(`  📝 Thumbnail güncellendi\n`);
        successCount++;
      }
    } catch (err) {
      console.error(`  ❌ HATA: ${err.message}\n`);
      failCount++;
    }
  }

  await db.end();
  console.log(`\n${"═".repeat(50)}`);
  console.log(`✅ Başarılı: ${successCount}`);
  console.log(`❌ Başarısız: ${failCount}`);
  console.log(`${"═".repeat(50)}`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});

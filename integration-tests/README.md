# Entegrasyon (E2E) Testleri

Pazaryeri kritik akışlarını gerçek HTTP uçları + gerçek DB ile uçtan uca sınar.
`medusaIntegrationTestRunner` her koşuda **ayrı bir test veritabanı** oluşturur,
migration'ları çalıştırır ve sonunda temizler (dev/prod DB'ye DOKUNMAZ).

## Çalıştırma

```bash
npm run test:integration:http   # E2E (HTTP) testleri
npm run test:unit               # birim testleri
```

### Yerel ortam (.env.test)
Test runner DB'yi `DB_HOST/DB_PORT/DB_USERNAME/DB_PASSWORD` ile kurar (DATABASE_URL
değil). Yerelde `.env.test` (git'te DEĞİL, secret içerir) gerekir:

```
DATABASE_URL=postgresql://postgres:<pw>@localhost:5435/medusa
JWT_SECRET=...
COOKIE_SECRET=...
DB_HOST=localhost
DB_PORT=5435            # docker postgres portu
DB_USERNAME=postgres
DB_PASSWORD=<pw>
REDIS_URL=              # BOŞ → testlerde in-memory event bus/workflow/cache
NODE_ENV=test
```

> `REDIS_URL` boş bırakılmalı: `medusa-config` Redis modüllerini yalnızca `REDIS_URL`
> doluysa yükler; testlerde in-memory kullanılır (BullMQ/Redis bağlantısı gerekmez).

## Kapsam (`http/marketplace-e2e.spec.ts`)
- **Satıcı ürün CRUD regresyonu** — bu akışlarda canlıda 500 veren 3 bug bir daha geçmesin:
  oluştur → liste → stats → **fiyat düzenle** → **sil + liste/stats hâlâ 200** (link temizliği).
- **Yasal sözleşme + hukuki delil** — 4 sözleşme kurulumu, onaysız satıcının kapısı kapalı
  (403), onayda **IP + user-agent + içerik hash'i + kimlik snapshot'ı** kaydı, idempotent kapı.

## CI kapısı
`.github/workflows/deploy.yml` → `deploy` job'u `needs: test`. Birim + entegrasyon
testleri geçmeden **canlıya deploy yapılmaz**. (postgres service + in-memory Redis.)

## Yeni test eklemek
`http/marketplace-e2e.spec.ts` içindeki tek `medusaIntegrationTestRunner` çağrısına
`describe`/`it` ekle. Satıcı token'ı için `_helpers.ts → createSellerWithToken`.
Tek dosya/tek harness boot tercih edilir (`disableAutoTeardown: true` → veri testler
arası korunur; çoklu spec dosyası runInBand'de lifecycle çakışması yapar).

# syntax=docker/dockerfile:1
# Medusa v2 backend — üretim imajı.
# `medusa build` kaynak kodu .medusa/server altında bağımsız bir sunucuya derler;
# çalıştırma o dizinden yapılır.

# ---- 1) Derleme aşaması -------------------------------------------------------
FROM node:20-slim AS builder
WORKDIR /app

# sharp/native bağımlılıklar için temel araçlar (prebuilt binary'ler glibc'de çalışır)
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
# İlk kurulum tüm tarball'ları katman-içi npm cache'ine (/root/.npm) indirir; bu katman
# package*.json değişmedikçe ÖNBELLEKLENİR (tekrar deploy'larda anında geçer).
RUN npm ci --no-audit --no-fund

COPY . .
RUN npm run build            # → .medusa/server
# Bağımsız sunucunun üretim bağımlılıklarını BURADA kur. KRİTİK: `npm install` burada
# ~23 dk sürüyordu (tüm bağımlılık ağacını yeniden ÇÖZÜMLÜYOR). `medusa build`,
# .medusa/server için package.json İLE BİRLİKTE package-lock.json üretir → `npm ci`
# çözümlemeyi atlayıp lockfile'dan deterministik+çok daha hızlı kurar. `--prefer-offline`
# yukarıdaki `npm ci`'nin /root/.npm'e indirdiği tarball'ları yeniden indirmeden kullanır
# (legacy builder uyumlu, futex riski yok). Lockfile uyuşmazsa build net hata verir (sessiz
# bozulma yok) → güvenli.
RUN cd .medusa/server && npm ci --omit=dev --prefer-offline --no-audit --no-fund

# ---- 2) Çalışma aşaması -------------------------------------------------------
FROM node:20-slim AS runner
ENV NODE_ENV=production
WORKDIR /server

# Derlenmiş bağımsız sunucu (node_modules dahil) — runner'da npm install gerekmez
COPY --from=builder /app/.medusa/server ./

# Yüklenen görseller bu dizine yazılır (compose'da kalıcı volume bağlanır)
RUN mkdir -p /server/static

EXPOSE 9000

# Önce DB migrasyonlarını çalıştır, sonra sunucuyu başlat.
# (Tek instance için güvenli; çok instance'a geçersen migrate'i ayrı bir adım yap.)
CMD ["sh", "-c", "npx medusa db:migrate && npm run start"]

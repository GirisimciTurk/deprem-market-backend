// Jest setup (test ortamı).
//
// TESTLER ASLA GERÇEK SMTP'YE BAĞLANMAMALI.
// jest.config.js `loadEnv("test", cwd)` çağırır; Medusa'nın loadEnv'i `.env.test`
// YANINDA `.env`'i de yükler. `.env` üretim SMTP kimliklerini taşıdığı için testler
// gerçek mail sağlayıcısına bağlanmaya çalışıyordu: sağlayıcı ~200 bağlantıdan sonra
// SYN'leri düşürüyor (kötüye kullanım koruması), nodemailer'ın 120sn bağlantı
// zaman aşımı × 3 deneme birikiyor ve mail gönderen her test 300sn'lik jest
// zaman aşımına takılıp KIRMIZI oluyordu. Paket aslında ~55 saniyeliktir;
// geri kalanı giden mail beklemekle geçiyordu.
//
// Buraya konuldu, `.env.test`e DEĞİL: `.env.test` .gitignore'da, yani orada
// yapılan bir düzeltme başka makinede/CI'da geçerli olmaz.
//
// SMTP_HOST/USER/PASS boş olunca mailer.ts:getTransporter() null döner ve tüm
// mail yolları "önizleme yaz" dalına kısa devre yapar. Hiçbir test gerçek
// gönderime bakmaz.
process.env.SMTP_HOST = ""
process.env.SMTP_USER = ""
process.env.SMTP_PASS = ""

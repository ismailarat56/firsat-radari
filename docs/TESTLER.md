[← README'ye dön](../README.tr.md)

# Testler ve doğrulama

Test komutları ve çalıştırma koşulları. Son kayıtlı sonuçlar [TEST-REPORT.md](TEST-REPORT.md) içindedir.

## Doğrulama

```bash
npm run typecheck
npm run lint
npm test
npm run test:integration
npm run build
npm run bench
npm run test:e2e
npm run licenses
```

`npm test` domain ve React arayüz testlerini, entegrasyon komutu gerçek Express/SQLite sınırlarını çalıştırır. Bu geliştirme ortamında socket oluşturma engellendiği için API testleri süreç içinde HTTP istek/yanıt nesneleriyle çalıştırıldı. İzinli ortamda gerçek Supertest taşımasını ayrıca `FR_REAL_HTTP=1 npm run test:integration` ile çalıştırın.

Playwright, 4329 ve 4330 portlarında ayrı geçici SQLite veritabanlarıyla normal ve etiketli demo sunucularını açar. Sistem Chrome/Chromium'u algılar; yoksa `npx playwright install chromium` gerekir. `PLAYWRIGHT_CHROMIUM_EXECUTABLE` ile yol verilebilir. Son arayüz yenilemesinde 26 birim/UI, 64 entegrasyon ve 9 gerçek Chromium testi geçti. 1440/1280/768/390 px'te taşma, kontrast, odak, reduced-motion ve temel kullanıcı yolculuğu doğrulandı; görüntüler `artifacts/frontend-redesign` altında. Önceki audit denemesi registry DNS engeline takılmıştı; bu teslimde yeni audit yapılmadı. Ayrıntılar [test raporunda](TEST-REPORT.md).

## Teslim durumu

Kaynak kodu, yeni arayüz ve yerel temel akış uygulanmış; kontrollü verilerle gerçek tarayıcı kabulü geçmiştir. Canlı kurum kaynakları ve kullanıcı pilotu kabul kapıları açıktır. Fixture sonuçları canlı kaynak başarısı değildir; ürünün tüm v1 kabulü bu doğrulamalar tamamlanmadan ilan edilmemiştir. Başlangıçtaki plan [PLAN.md](PLAN.md) olarak korunmuştur; ürün belgesi bu depoda yer almaz.

[← README'ye dön](../README.tr.md)

# Yapılandırma ve sınırlar

Production derlemesi, veri dizini, ortam değişkenleri ve izleme sınırları.

## Production derlemesi

```bash
npm run build
npm start
```

Arayüz ve API aynı origin üzerinden **http://127.0.0.1:4318** adresinde sunulur. Derlenmiş demo için `npm run start:demo` kullanın. Uygulama yalnız `127.0.0.1` üzerinde dinler; LAN veya internet yayını yapılandırılmamıştır. Komutları proje kökünden çalıştırın; `dist/web` bu dizine göre bulunur.

## Veri ve yapılandırma

| Ayar               | Varsayılan / davranış                                                             |
| ------------------ | --------------------------------------------------------------------------------- |
| `FR_DATA_DIR`      | Normal modda `$XDG_DATA_HOME/firsat-radari`, yoksa `~/.local/share/firsat-radari` |
| `FR_DEMO=1`        | Varsayılan veri dizini `.local/demo`; açık örnek veri modu                        |
| `FR_PORT`          | `4318`; production API/arayüz portu                                               |
| Veritabanı         | `radar.sqlite`; WAL, foreign key, migration, 5 saniye busy timeout                |
| İzinler            | Veri/yedek dizinleri `0700`, veritabanı/yedek dosyaları `0600`                    |
| Çalışma tercihleri | SQLite ayar tablosunda; arayüzden saat dilimi ve yeni kaynakların kontrol aralığı |

[.env.example](../.env.example) değişkenleri belgeler. Dosya otomatik yüklenmez. Örneğin `FR_DATA_DIR=/size/ait/yerel/dizin npm run dev` kullanın. Production için Node'un `--env-file` seçeneğiyle de başlatabilirsiniz:

```bash
NODE_ENV=production node --env-file=.env dist/server/index.js
```

Geliştirmede Vite proxy varsayılan `4318` API portuna bağlıdır; port değiştirecekseniz `apps/web/vite.config.ts` proxy hedefini de uyarlayın. Aynı veritabanını aynı anda birden fazla uygulama süreciyle çalıştırmayın.

Oturumlar güçlü rastgele kimliklerle oluşturulur ve sunucuda hash olarak tutulur; HttpOnly/SameSite cookie, Origin/Host kontrolü, CSRF ve eşleştirme hız sınırı uygulanır. Oturum anahtarı localStorage'a yazılmaz. Çıkış ve geri yükleme yeni terminal kodu üretir. SQLite verisi **şifreli değildir**.

## İzleme sınırları

- En fazla 50 aktif listelenen kaynak; varsayılan 6 saat, minimum 30 dakika kontrol aralığı.
- Host başına aynı anda 1 istek, istekler arasında en az 10 saniye. Robots, crawl-delay ve Retry-After daha uzun bekleme gerektirebilir. Önizleme ve manuel kontrol de bu bütçeye dahildir.
- Yalnız HTTP/HTTPS ve standart 80/443 portları. Özel, loopback, link-local, metadata ve özel IPv6 adresleri engellenir; tüm DNS yanıtları kontrol edilir, gerçek bağlantı doğrulanan IP'ye sabitlenir. Redirect hedefleri yeniden denetlenir.
- En çok 5 redirect; 5 saniye bağlantı, 30 saniye gerçek ağ süresi; 5 MiB sıkıştırılmış / 10 MiB açılmış gövde. Kuyruk beklemesi ağ zaman aşımından ayrıdır.
- Kaynak başına 30 görüntü / 90 gün; önce aşılan sınır uygulanır. Karar kanıtı ayrı 100 MiB kotada korunur. Bu kota toplam SQLite dosya boyutu değildir; kanonik kanıt dokümanlarının boyutudur. Kota dolarsa koruma gerektiren yeni işlem açık hatayla durur.
- Kaynakta artık görünmeyen duyuru, başvurunun kapandığı anlamına gelmez. Kaynak seçicisi veya normalizasyon değişince yeni başlangıç onayı gerekir.
- Uygulama veya bilgisayar kapalıyken izleme sürmez. Açılışta gözlem boşluğu gösterilir; aradaki bilinmeyen değişiklikler uydurulmaz.

JavaScript ile oluşan içerik, giriş/CAPTCHA/ücret duvarı aşma, otomatik başvuru, e-posta, çok kullanıcılı bulut ve uzak analitik v1 kapsamı dışındadır. Uzak font, AI anahtarı, Redis veya Docker gerekmez. Kaynak toplama internet ister; mevcut kayıtları incelemek yereldir. HTML güvenli metne dönüştürülür, çalıştırılmaz. Tarih çıkarımı desteklenen açık biçimlerle sınırlıdır; genel Türkçe doğal dil anlama iddiası yoktur.

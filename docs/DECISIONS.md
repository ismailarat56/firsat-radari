# Mimari ve tasarım kararları

- 2026-10-15: Kullanıcının [planını](PLAN.md) ve ürün belgesini uygulama talimatı kabul ediyoruz. Yeni bir onay döngüsü yerine mevcut kapsam uygulanıyor.
- Proje boş, `.git` korumalı ve gerçek Git deposu değil. Kullanıcının belirttiği klasörde çalışılır; depo oluşturma/commit kapsamı bu ortamda yoktur.
- React/TypeScript/Vite, Express, SQLite/Drizzle modüler monolit. Yerel sunucu 127.0.0.1:4318, Vite 127.0.0.1:5173. İnternete yayın yoktur.
- Görsel yön: kırık beyaz tuval, petrol yeşili navigasyon ve vurgu, okunaklı yerel fontlar. Öncelik kanıt → karar → onaylı tarih akışıdır. Fotoğraf yerine ürüne özgü radar ve veri görselleştirmeleri kullanılır.
- Demo ayrı veritabanı ve belirgin örnek veri etiketi kullanır; gerçek kurulum boş başlar ve terminal eşleştirmesi gerektirir.
- Ağ politikası: 80/443, en çok 5 redirect, 5 saniye bağlantı / 30 saniye kümülatif gerçek ağ süresi, 5 MiB wire / 10 MiB decoded. Nezaket ve kuyruk beklemesi bu süreye dahil değildir. Her bağlantı doğrulanmış IP'ye sabitlenir; DNS adres kümesinin tamamı denetlenir, orijinal Host/TLS adı korunur. İçerik redirect'lerinin her hedefinde robots uygulanır. Bu eşikler plan varsayımlarının uygulanmış değerleridir.
- Karar kanıtı kotası 100 MiB. Kaynak başına 30 görüntü / 90 gün, önce aşılan uygulanır. Korunan kanıt sessiz silinmez.
- Node 24.19.0 / Ubuntu 26.04.1 üzerinde geliştirme; desteklenen minimum Node 22.12. Paketler lockfile ile sabitlenir.

Resmî uyumluluk kaynakları: [Vite](https://vite.dev/guide/), [Express 5](https://expressjs.com/en/guide/migrating-5.html), [Drizzle SQLite](https://orm.drizzle.team/docs/get-started/sqlite-new), [SQLite backup](https://sqlite.org/backup.html).

## Modül sınırları

| Alan | Karar |
| --- | --- |
| İstemci | React + TanStack Query; bileşenler API sonuçlarını gösterir. Oturum ve CSRF bilgisi kalıcı istemci deposunda tutulmaz. Kaynak ekleme → önizleme → başlangıç onayı ayrı adımlardır. |
| API | Express uygulama fabrikası socket açmaz; `index.ts` tek başlangıç noktasıdır. İş kuralları servislerde, giriş doğrulama Zod şemalarındadır. |
| Kalıcılık | SQLite WAL + FK + unique/index; Drizzle schema ve sürümlü migration. Alanların bir kısmı JSON doküman, kimlik/ilişki/tekillik gerektiren alanlar ilişkisel sütundur. |
| Toplama | Tek güvenli fetch adaptörü. Testte resolver/transport/fetcher enjekte edilebilir; production varsayılanı güvenli/polite adaptördür. Test adaptörü production HTTP ucu değildir. |
| İşler | Aynı süreçte SQLite kalıcı kuyruk; kaynak başına tek etkin iş, host bütçesi, lease ve heartbeat. Redis veya ayrı worker gerekmiyor. |
| Saf domain | Kanonikleştirme, diff ve tarih adayları `packages/shared`; HTTP ve UI bağımlılığından ayrı. |
| Saklama | Son geçerli kıyaslama görüntüsü, başarılı değişmeyen/304 gözlemde tazelenen değişmez kanıtla sürer. Sıradan tarihçe budanabilir; karara bağlanan görüntüler ayrı kota ile korunur. |
| Geri yükleme | SQLite online backup; 512 MiB üst sınır, geçici kopyada exact schema/bütünlük/FK/veri modu kontrolü, otomatik güvenlik yedeği, transaction, session iptali ve gözlem generation bariyeri. |

## Kimlik ve tarih sözleşmesi

RSS öğesi GUID, sonra kanonik bağlantı, son çare başlık/metin hash'i ile tanınır. HTML öğesinde `data-id`/`id`, sonra bağlantı, sonra hash kullanılır. Bağlantısız ve kimliksiz metin değiştiğinde fallback aynı öğe olduğunu kanıtlayamaz; kaldırılan/yeni öğe olarak görünebilir. Kaynaklar arası benzer öğeler otomatik birleştirilmez.

Normalizasyon sürümlüdür; metin boşlukları ve açıkça oynak seçilmiş öğeler temizlenir, tarihler ve başvuru bağlantıları korunur. Seçici/kaynak yapısı veya normalizasyon sürümü değişince eskiyle doğrudan kıyas yapılmaz; yeni başlangıç gerekir. Giriş/CAPTCHA tanıma belirli işaretlere dayanır; her özel SSO ekranını tanıdığı iddia edilmez. RSS veya açıkça seçilmiş anlamlı statik bölge tercih edilmesi bu nedenle önemlidir.

Olay anları UTC, yalnız tarihli son günler `YYYY-MM-DD` olarak saklanır. Tarih adayı alıntı/URL/gözlem zamanı taşır. Kullanıcı yıl veya saat dilimi eklerse `userSuppliedFields` ile ayrılır. Onay sürümü çakışmaya karşı kontrol edilir. Kaynakta yeni tarih çıktığında eski onay korunur ve yeniden inceleme gerekir. Takvim günü o günün tamamını kapsar; UI saat dilimi değişikliği tarih-only alanını kaydırmaz. Kesin zaman girişinde UTC açıkça istenir; gösterimde kullanıcı tercihi uygulanır.

## Durum ve ölçüm

İncelenmiş öğe yeni anlamlı değişiklikte tekrar okunmamış olur. Kaydedilmiş, ilgisiz ve arşivlenmiş kararlar değişiklikte korunur. Anahtar kelimeler önceliği ve yeni uyarı oluşumunu etkiler; kaydedilmiş fırsatın yeni değişikliği filtreyle kaybedilmez. Kaynak arşivi yalnız yeni toplamayı durdurur; geçmiş fırsatlar, kararlar, onaylı tarihler ve hatırlatmalar kendi durumlarına göre erişilebilir kalır. Fırsatı arşivlemek ayrı kullanıcı kararıdır.

Aktivasyon üç geçerli başlangıç ve bir kararın birleşimidir. Kurulumun tamamlanması bu iki koşulun oluştuğu sıradan bağımsız olarak kalıcı kaydedilir. Yerel olaylarda içerik gövdesi bulunmaz; uzaktaki analitik servisine gönderim yoktur. Pilot tanımı [PRODUCT.md](PRODUCT.md) içindedir.

## Ortam nedeniyle açık kalanlar

Socket/Chromium erişimi ortam tarafından reddedildi. Bu nedenle gerçek Express middleware, servis ve SQLite testleri süreç içinde HTTP nesneleri üzerinden çalıştırıldı; tarayıcı veya TCP başarısı olarak sunulmaz. `FR_REAL_HTTP=1` mevcut entegrasyon testlerini izinli ortamda Supertest ile çalıştırır. Production kodunda bu kısıtı aşan bir dinleme veya kimlik doğrulama alternatifi eklenmedi.

Benchmark production sunucu bundle'ını kullanır; dış ağ ve browser zamanı hariçtir. İstekler arası event-loop yield, test taşımasının stream temizliğini yapabilmesi içindir ve ölçülen istek süresinin dışındadır. CPU/bellek, benchmark Node sürecini kapsar. Canlı kaynaklar, gerçek tarayıcı, uzun süreli çalışma ve güncel registry audit'i ayrıca doğrulanmalıdır.

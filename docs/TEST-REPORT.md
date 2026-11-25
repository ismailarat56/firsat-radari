# Doğrulama raporu

15 Ekim 2026, arayüz yenilemesi sonrası güncellendi. Gerçek Chromium, Express ve geçici SQLite ile kontrollü kullanıcı yolculuğu geçti. Canlı kurum siteleri ve kullanıcı pilotu bu sonuçlara dahil değildir. Tasarım ve ekran görüntüleri [arayüz yenileme raporundadır](FRONTEND-REDESIGN.md).

## Sonuçlar

| Komut                              | Sonuç                                                                                   | Kanıt                                                                           |
| ---------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `npm run typecheck`                | Geçti; tanı yok                                                                         | Log depoya alınmadı                   |
| `npm run lint`                     | Geçti; hata/uyarı yok                                                                   | Log depoya alınmadı                             |
| `npm test`                         | 5 dosyada 26 test geçti: 16 domain/başlangıç/tarih + 10 UI senaryosu                    | Log depoya alınmadı           |
| `npm run test:integration`         | 10 dosyada 64 test geçti                                                                | Log depoya alınmadı   |
| `npm run build`                    | Playwright sunucusu başlamadan Vite istemci + esbuild sunucu derlemesi geçti            | Log depoya alınmadı                 |
| `npm run format:check`             | Geçti                                                                                   | Log depoya alınmadı             |
| `npm run test:e2e`                 | Gerçek Chromium'da 3 dosya, 9 test geçti                                                | Log depoya alınmadı                   |
| İlk kurulumdaki `npm run bench`    | 50 kaynak / 1.000 öğe; 400 ölçülen istek, 0 hata; bu yenilemede tekrarlanmadı           | [benchmark.json](../artifacts/benchmark.json), [PERFORMANCE.md](PERFORMANCE.md) |
| İlk kurulumdaki `npm audit --json` | npm registry DNS `EAI_AGAIN`; bu yenilemede tekrarlanmadı                               | [npm-audit.json](../artifacts/npm-audit.json)                                   |
| İlk kurulumdaki `npm run licenses` | 505 lockfile kaydı; 137 kurulu çalışma bağımlılığı bildirimi; yeni bağımlılık eklenmedi | [LICENSES.md](LICENSES.md), [licenses.json](../artifacts/licenses.json)         |

Son çalıştırmalarda toplam **99 geçen test**, 0 başarısız test. E2E dahildir. Audit hatası “0 güvenlik açığı” sonucu anlamına gelmez. İlk kurulumdaki port engeli son standart `npm run test:e2e` çalıştırmasında oluşmadı; tarihsel engel logları depoya alınmadı.

## Test taşıması ve gerçek sınırlar

API testleri gerçek Express route/middleware/servislerini ve geçici dizinlerde gerçek SQLite dosyalarını kullanır. `tests/integration/http.ts`, `IncomingMessage`/`ServerResponse` nesneleriyle süreç içinde istek yürütür. Sunucu cevabı, header/cookie, Origin/CSRF, kalıcılık, transaction ve migration gerçektir; bu entegrasyon testlerinin taşıması TCP değildir. Taşımanın `finish`/socket temizliği için ayrıca regresyon testi vardır. `FR_REAL_HTTP=1` aynı entegrasyon dosyalarını Supertest ile çalıştırır; bu mod ayrıca çalıştırılmadı. E2E testleri ise gerçek yerel TCP sunucularına bağlanır.

UI testleri React bileşenlerini jsdom'da render eder; fetch çağrıları bu gerçek API'ye aktarılır. Ana yolculuk terminal eşleştirmesi → üç kaynak → önizleme → başlangıç → kalıcı kuyruk → kontrollü değişiklik → klavyeyle fark açma → kaydet → tarih onayı → kalıcılık şeklindedir. Hatalı tarih/yıl/saat dilimi provenance ve oturum iptalinden eşleştirmeye dönüş de sınanır. Kaynak veri aktarımında gerçek dış ağ yerine kontrollü fixture kullanılır.

## Kapsanan riskler

- Yetkisiz erişim, kötü Host/Origin, CSRF, tek kullanımlık/süreli kod, beş denemeden sonra eşleştirme hız sınırı, oturum iptali, normal modda demo bypass olmaması.
- 50 kaynak limiti, 30 dakika alt sınırı, tekrar açılışta kalıcılık, kaynak düzenleme ve yeni başlangıç, duraklat/devam zamanlaması.
- Özel/metadata/IPv6/mapped IP, karma DNS, public→private redirect, gerçek bağlantı lookup sabitlemesi, boyut sınırı, charset, XML entity yasağı, robots redirect ve uzun crawl-delay.
- İlk görüntüde sıfır bildirim; aynı kimlikte yeni sürüm; oynak banner; tarih ve göreli bağlantı korunması; 304/CAPTCHA/boş bölge/hata sonrası geçerli görüntü; eski kaynak ayarının uçuşta dönen sonucunun reddi.
- Host tek eşzamanlılığı, istek aralığı, kalıcı idempotency, Retry-After, lease süresi dolunca toparlanma ve tekrar yürütmede tek bildirim. Çökme durumu süre/lease ile simüle edilir; gerçek işletim sistemi süreci öldürme deneyi olarak raporlanmaz.
- Belirsiz/eksik tarih, yalnız takvim gününün kapsayıcılığı, kullanıcı bilgisi kaydı, onay sürüm çakışması, yeni tarih geldiğinde önceki onayın korunması, seçilen saat dilimi ve gün sınırı.
- 31. görüntü / 91 gün temizliği, karara bağlı kanıtın korunması, tutarlı yedek, bozuk/path traversal yedek reddi, transaction geri dönüşü, geri yükleme sırasında bekleyen önizlemenin yazamaması. Dolu disk testi SQLite page budget üzerinden `SQLITE_FULL` üretir; gerçek diski doldurma deneyi değildir.
- Demo/normal dizin varsayılanı, mevcut boş gerçek veriyi demoda açamama, demo verisini gerçek modda açamama ve modlar arası yedek reddi.
- Kaynak takipten kaldırıldıktan sonra kaydedilen fırsat, onaylı tarih, yeni üretilen hatırlatma ve fark kanıtının erişilebilir kalması.
- İlk kurulumun üç başlangıç ve bir kararla, bu işlemlerin sırasından bağımsız tamamlanması.

## Erişilebilirlik ve görsel sınır

jsdom + axe kontrolünde kaynak diyalogunun yapısal ihlali bulunmadı. Renk/kontrast kuralı jsdom gerçek layout hesaplamadığı için bu testte devre dışıdır; yeni tarayıcı testlerinde **kontrast dahil** axe WCAG 2 A/AA ve 2.1 AA kuralları çalıştırıldı ve kontrol edilen görünümlerde ihlal çıkmadı. Bu sonuç tam WCAG uyumluluğu veya manuel ekran okuyucu testi değildir.

Playwright 1440, 1280, 768 ve 390 px'te ana ekran, okuyucu, filtreler ve tamamlayıcı ekranları kontrol etti. Taşma, görünür odak, modal odak tuzağı/dönüşü, arama kısayolu, reduced-motion ve mobil menü kontrolleri geçti. Dolu/boş/yükleniyor durumları, uzun Türkçe başlık, ağ/önizleme hatası, kaldırılmış içerik, eski tarih onayı, URL ve kaydırma dönüşü kapsandı. Kaynak önizleme → fark → kaydetme → tarih onayı → takvimden geri dönüş → kalıcılık gerçek tarayıcıda geçti. [Önce/sonra görüntüleri](../artifacts/frontend-redesign/index.html) izole demo/test verileriyle üretildi.

## Bağımsız kod incelemesi

İlk kapsamlı inceleme altı önemli bulgu verdi: kaynak devam zamanlaması, değişmeyen kaynağın 91 günlük baseline kaybı, nezaket beklemesinin ağ zaman aşımını tüketmesi, redirect robots politikası, geri yükleme/önizleme yarışı ve eksik yıl/saat diliminin UI onayı. Her biri regresyonla düzeltildi; kapsamlı yeniden çalıştırma ve ayrı sınırlı inceleme ile kapatıldı.

Son teslim değişiklikleri incelemesinde kaynak takibini kaldırmanın kaydedilenler/takvim/hatırlatmaları gizlediği bulundu. Gerçek API testi önce başarısız oldu; kaynak arşivi ile fırsat arşivi ayrılarak düzeltildi. Yeniden incelemede iki kaynak yaşam döngüsü testi geçti ve bu bulgu kapandı. Son sınırlı incelemede kalan Critical/Important bulgu bildirilmedi; bu ifade tüm ürünün güvenlik veya browser sertifikası değildir.

## Açık kabul adımları

1. İstenirse entegrasyon testlerinin Supertest taşımasını ayrıca `FR_REAL_HTTP=1 npm run test:integration` ile çalıştırın. Standart gerçek tarayıcı testleri ve dört genişlik doğrulaması tamamlandı.
2. Hedef kullanıcının bilgisayarında `npm run demo` ve production başlangıcını kontrol edin. Testte gerçek eşleştirme ve yeniden yükleme kalıcılığı doğrulandı; işletim sistemi kapat/aç pilotu yapılmadı.
3. Kısıtlamalara uygun üç gerçek kamu kaynağında RSS/Atom ve statik HTML toplamasını deneyin. URL, zaman, robots/erişim sonucu ve çıktı türünü kaydedin. Bu oturumda hiçbir gerçek kurum kaynağı başarıyla test edilmiş sayılmamıştır.
4. Registry erişimi olan ortamda güncel `npm audit` çıktısını alın ve uygulanabilir bulguları giderin. Mevcut DNS hatasını temiz rapor olarak kullanmayın.
5. Ürün pilotunu ancak bu teknik kapılardan sonra [PRODUCT.md](PRODUCT.md) pay/payda tanımlarıyla değerlendirin. Pilot henüz yürütülmedi.

Arayüz yenilemesi sonrası bağımsız incelemede arama sırasında odak kaybı ve tamamlayıcı okuyucuda etkisiz genişletme kontrolü bulundu. İkisi düzeltildi; arama hatası önce başarısız UI testiyle üretildi, ardından UI ve gerçek tarayıcı regresyonları geçti. Dar kapsamlı son incelemede kalan Critical/Important bulgu bildirilmedi.

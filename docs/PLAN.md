[← README'ye dön](../README.md)

# Fırsat Radarı Implementation Plan

**Goal:** Kamuya açık duyurulardaki anlamlı değişiklikleri kanıtıyla gösteren ve kullanıcının başvuru kararını takip eden yerel bir uygulama geliştirmek.

**Architecture:** Bu klasör bağımsız bir ürünün köküdür. React istemci ve Express API, SQLite üzerinde modüler monolit olarak çalışır; saf normalizasyon/karşılaştırma kuralları ile güvenli ağ adaptörü ayrılır. Kalıcı tarama işleri aynı uygulamanın sınırlı zamanlayıcısıyla yürütülür.

**Tech Stack:** React, TypeScript, Vite, Tailwind CSS, Radix/shadcn, TanStack Query; Node.js, Express, Zod, SQLite, Drizzle; Vitest, API entegrasyon testleri, Playwright.

**Spec:** özgün ürün istemi (bu depoda yer almıyor), A–D bölümleri.

**Güncel durum (15 Ekim 2026):** Uygulama ve test altyapısı bu plana göre oluşturuldu. Paket sürümleri seçildi, lockfile ve migration eklendi. Aşağıdaki özgün adımlar plan kaydı olarak korunuyor; tamamlanan işler ve gerçek kontrol sonuçları [docs/PROGRESS.md](PROGRESS.md) ve [docs/TEST-REPORT.md](TEST-REPORT.md) içinde izleniyor. Socket/tarayıcı kısıtı nedeniyle gerçek browser kabulü, canlı kaynak doğrulaması ve kullanıcı pilotu henüz tamamlanmış sayılmıyor.

## Global Constraints

- Linux, Türkçe arayüz/README, İngilizce kod adları; önerilen saat dilimi `Europe/Istanbul`. Anlık olaylar UTC, yalnız tarih içeren son tarihler ayrı takvim günü olarak saklanır.
- Varsayılan dinleme adresi `127.0.0.1`; geliştirmede Vite proxy, üretimde aynı origin. Terminalden kısa ömürlü, tek kullanımlık eşleştirme; hash saklanan oturum, HttpOnly/SameSite cookie, uygun Secure ayarı, süre sonu/iptal, Host/Origin, CSRF ve giriş hız sınırı gerekir. Token localStorage'a konmaz.
- Her ürünün kendi `apps/web`, `apps/server`, `packages/shared` yapısı, veritabanı ve yapılandırması vardır. Docker, Redis, Kubernetes, SaaS, uzak font, analitik veya ücretli AI zorunluluğu yoktur.
- Veriler XDG veri dizininde, yapılandırma kullanıcı dizininde sınırlı izinlerle tutulur. Drizzle migration, foreign key, indeks, WAL, busy timeout ve kısa transaction gerekir. SQLite kullanımı şifreleme anlamına gelmez.
- En fazla **50 kaynak**; varsayılan tarama **altı saat**, en kısa aralık **30 dakika**. Host başına eşzamanlılık **bir**, istekler arası bekleme **en az 10 saniye**; robots ve Retry-After daha sıkıysa onlar geçerlidir. Manuel kontrol de aynı bütçeyi kullanır.
- Kaynak başına **en fazla 30 görüntü ve 90 gün**; önce aşılan sınır uygulanır. Karara bağlı kanıt ayrı ve görünür bir kotada korunur.
- RSS/Atom önceliklidir; HTML yalnız seçilen statik bölgeyle izlenir. Giriş, CAPTCHA, ücretli içerik, JavaScript render, otomatik başvuru ve e-posta v1 dışıdır. Uygulama kapalıyken takip sürmez.
- İnternet metni güvenilmeyen veridir. Ham HTML çalıştırılmaz; kaynağın yazmadığı tarih/yıl/saat dilimi uydurulmaz. Örnek veri yalnız açık demo/test ortamındadır.
- P0 doğruluk/güvenlik/ana akış, P1 v1 kullanılabilirliği, P2 gelecek sürümdür. P0 ve P1 bitmeden v1 tamamlanmış sayılmaz.

## Review Focus

1. DNS kontrolünden sonra özel IP'ye yönelme veya rebinding: gerçek bağlantı doğrulanan IP'ye sabitlenmelidir → FR-02.
2. CAPTCHA, 200 giriş sayfası ve boş seçici: son geçerli görüntü korunmalı, içerik silinmiş sayılmamalıdır → FR-03.
3. Aynı hosttaki kaynaklar, manuel istekler ve çökme sonrası tekrar: limit aşımı ve çift bildirim oluşmamalıdır → FR-04.
4. Eksik yıl/saat dilimi ve yalnız tarihli kapanış: otomatik kesin tarih veya gün başında kapanma üretilmemelidir → FR-05.
5. Saklama kotası veya seçici/normalizasyon sürümü değişikliği: karar kanıtı sessiz kaybolmamalı, sahte fark oluşmamalıdır → FR-03, FR-07.

## Ürün, ekranlar ve kapsam

Hedef kullanıcı öğrenciler, yeni mezunlar ve kariyer danışmanlarıdır. İlk değer: üç kaynak → geçerli başlangıç görüntüsü → sonraki anlamlı fark → İncele/Kaydet/İlgisiz/Arşivle → kullanıcı tarafından onaylanan son tarih.

Ekranlar: ilk üç kaynak kurulumu; kaynak/kategori listesi; öncelikli gelen kutusu; iki sütunlu fark; gözlem geçmişi; karar ve tarih paneli; bildirim/özet; saklama ve çalışma ayarları. Görsel dil kırık beyaz, koyu mürekkep ve petrol yeşilidir.

V1.1/P2: yalıtılmış JavaScript sayfa adaptörü, açıkça yapılandırılan resmî API adaptörleri, katılımlı e-posta. Bunlar için v1'de çalışmayan butonlar oluşturulmaz.

## Dosya ve veri sınırları

| Oluşturulacak alan | Sorumluluk |
| --- | --- |
| `apps/web/src/features/{onboarding,sources,inbox,diffs,decisions,settings}/` | Kullanıcı akışı ve erişilebilir ekranlar |
| `apps/server/src/modules/{sources,observations,items,decisions,notifications}/` | Komutlar, sorgular, kayıt işlemleri |
| `apps/server/src/network/safe-fetch.ts` | Tek ağ çıkışı; URL, DNS, redirect ve boyut sınırları |
| `apps/server/src/jobs/scheduler.ts` | Kalıcı işler, lease, host bütçesi ve toparlanma |
| `packages/shared/src/{contracts,canonicalize,diff,deadlines}.ts` | Şemalar ve saf domain kuralları |
| `apps/server/src/db/schema.ts`, `apps/server/drizzle/` | İlişkiler, benzersizlik ve migration |
| `tests/{unit,integration,e2e,fixtures,bench}/` | Gerçek sınırları sınayan kanıtlar |

Veri modeli: Source, SourceConfigVersion, ObservationAttempt, Snapshot, Item, ItemVersion, Diff, Rule, Decision, DeadlineCandidate, ConfirmedDeadline, Notification, Job, Session. Görüntüler değişmezdir. Öğenin kimliği ile içerik sürümü ayrı tutulur; kaynaklar arası benzerlik otomatik birleştirme değildir.

## Uygulama işleri

### FR-01 — Kalıcı kaynak ve oturum temeli · P0

**Amaç/kapsam:** Eşleştirilmiş oturumla kaynak ekleyip yeniden açınca aynı kaydı görmek. **Bağımlılık:** Yok.

**Dosyalar:** `package.json`, `apps/server/src/auth/session.ts`, `apps/server/src/db/schema.ts`, `apps/server/drizzle/0001_init.sql`, `apps/server/src/modules/sources/service.ts`, `packages/shared/src/contracts.ts`, `apps/web/src/features/sources/SourceForm.tsx`, `tests/integration/sources.test.ts`.

**Arayüzler:** `POST /api/pair`, `POST /api/logout`; `POST /api/sources {name,url,category,keywords,intervalMinutes}` → `{id,configVersion,baselineRequired}`; `GET /api/sources`. Kaynak ekleme tek başına tarama/onay sayılmaz.

- [ ] Linux/Node ve mevcut talimatları incele; desteklenen paket sürümlerini resmî belgelerden doğrula, lockfile ile `dev`, `start`, `typecheck`, `lint`, `test`, `test:integration`, `test:e2e`, `build`, `bench` scriptlerini oluştur.
- [ ] `sources.test.ts`: oturumsuz ekleme 401; tekrar kullanılan eşleştirme kodu reddedilir; 51. kaynak 422; 29 dakikalık aralık 422; 30 dakika kabul; yeniden açılışta kaynak korunur testlerini yaz.
- [ ] `npx vitest run tests/integration/sources.test.ts` çalıştır; ilgili davranışlar eksik olduğu için başarısızlığı gözle.
- [ ] Oturum korumalarını, XDG depolamayı, migration ve kaynak CRUD doğrulamasını uygula; formu gerçek API'ye bağla.
- [ ] Aynı testi geçir; üç farklı kaynağı oluşturup yeniden başlatma sonrası listeyi doğrula.

### FR-02 — Güvenli toplama sınırı · P0

**Amaç/kapsam:** İzinli RSS/Atom veya statik HTML'yi tek denetimli ağ yolundan almak. **Bağımlılık:** FR-01.

**Dosyalar:** `apps/server/src/network/{safe-fetch,url-policy,robots-policy}.ts`, `apps/server/src/modules/sources/preview.ts`, `packages/shared/src/contracts.ts`, `tests/integration/safe-fetch.test.ts`.

**Arayüz:** `safeFetch(request: FetchRequest): Promise<FetchResult>`; şemalar `contracts.ts` içinde. Request URL ve önceki ETag/Last-Modified taşır; sonuç doğrulanmış gövde veya 304/metaveri ya da tipli hata döndürür. `POST /api/sources/:id/preview`, `POST /api/sources/:id/baseline` önizleme/onayı ayırır.

- [ ] Testlere IPv4/IPv6, IPv4 eşlemeli IPv6, özel/link-local/metadata IP, alternatif IP yazımı, URL kimlik bilgisi, mixed public/private DNS, public→private redirect ve rebinding ekle; hiçbirinde engellenmiş IP'ye bağlantı kurulmamalı.
- [ ] `npx vitest run tests/integration/safe-fetch.test.ts` ile eksik korumaların başarısızlığını doğrula.
- [ ] HTTP/HTTPS izin listesi, tüm A/AAAA denetimi, IP'ye bağlantı sabitleme ve doğru Host/TLS doğrulamasını kur; her redirect'te politikayı yeniden uygula. Varsayılan öneri: 80/443 portları, en çok 5 redirect, 5 sn bağlantı/30 sn toplam süre, 5 MiB sıkıştırılmış/10 MiB açılmış gövde; bu değerleri karar kaydında açıkça plan varsayımı olarak sakla.
- [ ] Robots ve erişim kısıtlarını, XML dış varlık yasağını, charset çözümünü ve güvenli metin önizlemesini uygula; tüm yardımcı ağ istekleri aynı güvenli adaptörden geçsin.
- [ ] Testi geçir; büyük sıkıştırılmış yanıt, bozuk XML ve yasak içerik için ayrı hata kodlarını doğrula. Fixture sonucunu gerçek site erişim sonucu diye raporlama.

### FR-03 — Başlangıç, sürümleme ve anlamlı fark · P0

**Amaç/kapsam:** Geçerli değişikliği tespit ederken ağ hatasını veya banner hareketini değişiklik saymamak. **Bağımlılık:** FR-01, FR-02.

**Dosyalar:** `packages/shared/src/{canonicalize,diff}.ts`, `apps/server/src/modules/observations/service.ts`, `apps/server/src/modules/items/identity.ts`, `tests/unit/canonicalize.test.ts`, `tests/integration/observations.test.ts`.

**Arayüzler:** `canonicalize(input: CanonicalInput): CanonicalDocument`; `compareSnapshots(previous: CanonicalDocument, next: CanonicalDocument): ItemDiff[]`. Tipler aynı modüllerden dışa açılır. `GET /api/sources/:id/observations`, `GET /api/items/:id/diff` görüntü ve normalizasyon sürümlerini döndürür.

- [ ] Testlerde ilk geçerli görüntü→0 bildirim; aynı GUID/değişen içerik→aynı Item/yeni ItemVersion; oynak banner→0 fark; son tarih değişikliği→fark; 304→son gövde; CAPTCHA/giriş sayfası/boş seçici/fetch hatası→önceki geçerli görüntü korunur beklentilerini yaz.
- [ ] `npx vitest run tests/unit/canonicalize.test.ts tests/integration/observations.test.ts` çalıştırıp eksik davranışları doğrula.
- [ ] GUID/kanonik bağlantı/kararlı HTML anahtarı ve belgelenmiş hash geri dönüşünü kur; normalizasyon deterministik ve sürümlü olsun. Tarihleri/genel bağlantıları silen regex kullanma.
- [ ] Seçici veya normalizasyon sürümü değişince yeni başlangıç iste; eski/yeni yapıyı doğrudan karşılaştırma. Gerçek kaldırmayı yalnız “kaynakta artık görünmüyor” olarak kaydet.
- [ ] Testleri geçir; bildirimin tekilliğini veritabanı unique kısıtlarıyla koru ve farkı iki değişmez görüntüye bağla.

### FR-04 — Kalıcı tarama ve toparlanma · P0

**Amaç/kapsam:** Zamanlama, host nezaketi ve çökmeden sonra tek sonuç üretimi. **Bağımlılık:** FR-02, FR-03.

**Dosyalar:** `apps/server/src/jobs/{scheduler,lease,host-budget}.ts`, `apps/server/src/modules/notifications/service.ts`, `tests/integration/scheduler.test.ts`.

**Arayüz:** `POST /api/sources/:id/check` + `Idempotency-Key` → `{jobId,status,nextAttemptAt,delayReason}`; otomatik ve manuel kontroller aynı kuyruğu kullanır. `GET /api/jobs/:id` çalışma ve gecikme durumunu verir.

- [ ] Sabit saatli testte aynı hostta en çok 1 etkin istek, en az 10 saniye ara; aynı kaynakta tek tarama; lease sonu/çökme/tekrar işleme sonrası tek bildirim; Retry-After'ın korunması beklentilerini yaz.
- [ ] `npx vitest run tests/integration/scheduler.test.ts` ile başarısızlığı doğrula.
- [ ] SQLite lease, deneme sayısı, üstel backoff+jitter ve kontrollü yeniden başlatmayı uygula; ağ beklerken transaction açık tutma, sonuç/bildirim yazımını atomik yap.
- [ ] Uykudan dönüşte gözlem boşluğunu ve gerçek sonraki deneme zamanını göster; kaçırılan aralıkta hangi değişikliklerin olduğunu iddia etme.
- [ ] Testi geçir ve çalışan işi kesip yeniden başlatarak toparlanmayı ayrıca gözle.

### FR-05 — Kanıtlı karar ve son tarih · P0

**Amaç/kapsam:** Farktan kullanıcı kararına ve açık tarih onayına ulaşmak. **Bağımlılık:** FR-03, FR-04.

**Dosyalar:** `packages/shared/src/deadlines.ts`, `apps/server/src/modules/decisions/service.ts`, `apps/web/src/features/decisions/DecisionPanel.tsx`, `tests/unit/deadlines.test.ts`, `tests/integration/decisions.test.ts`.

**Arayüzler:** `POST /api/items/:id/decisions {action,reason}`; `POST /api/items/:id/deadline-confirmations {candidateId,dateOnly,instantUtc,timezone,userSuppliedFields,expectedVersion}`. Şema tarih veya an biçimini ayırır. Aday alıntı, URL ve gözlem zamanını taşır.

- [ ] Eksik yıl, “bu cuma”, birden çok tarih ve eksik saat diliminin onaysız hatırlatma oluşturmadığını; date-only son tarihin o günün başlangıcında kapanmadığını; yeni kaynak tarihinin eski onayı değiştirmediğini test et.
- [ ] `npx vitest run tests/unit/deadlines.test.ts tests/integration/decisions.test.ts` ile başarısızlığı doğrula.
- [ ] Aday/teyit ayrımını, kapsayıcı takvim gününü ve açık gün sonu politikasını uygula; kullanıcının eklediği alanları kaynak kanıtından ayır.
- [ ] İncele/Kaydet/İlgisiz/Arşivle, yeniden tarih inceleme, uygulama içi uyarı ve günlük özeti bağla; “İlgisiz” için gerekçe al.
- [ ] Testleri geçir; hiçbir onaysız adayın kapanış/hatırlatma üretmediğini API üzerinden doğrula.

### FR-06 — Kullanılabilir kaynak masası · P1

**Amaç/kapsam:** İlk üç kaynak ve karar akışını erişilebilir arayüzle tamamlamak. **Bağımlılık:** FR-01–FR-05.

**Dosyalar:** `apps/web/src/styles/tokens.css`, `apps/web/src/features/{onboarding,inbox,diffs,settings}/`, `tests/e2e/opportunity-flow.spec.ts`.

**Arayüz:** Önceki işlerin API'leri; liste filtreleri URL'ye, mutasyon durumları gerçek sunucu sonucuna bağlıdır. Olaylar: `source_added`, `baseline_validated`, `change_detected`, `item_reviewed`, `item_saved`, `deadline_confirmed`, `alert_dismissed`.

- [ ] Playwright senaryosunda üç kaynak ekle, başlangıcı doğrula, kontrollü kaynak değişikliğini göster, farkı klavyeyle incele, kararı kaydet ve tarihi onayla; yenileme sonrası aynı kayıtları bekle.
- [ ] `npx playwright test tests/e2e/opportunity-flow.spec.ts` çalıştırıp akış eksiklerini gör.
- [ ] Tasarım değişkenlerini, iki sütunlu etiketli farkı, gözlem boşluğu/çevrimdışı/engellendi durumlarını uygula; ham HTML'yi çalıştırma.
- [ ] 1440, 1280, 768 ve 390 px'de görünür odak, ekran okuyucu adları, kontrast, reduced-motion, uzun Türkçe içerik ve kaybolmayan hata girdilerini kontrol et.
- [ ] E2E testini geçir; içerik gövdelerini dış analitiğe göndermeyen yerel olay özetini doğrula.

### FR-07 — Saklama, yedek ve pilot kapısı · P0 + P1

**Amaç/kapsam:** Kanıtı koruyarak v1'i ölçülebilir ve geri yüklenebilir teslim etmek. **Bağımlılık:** FR-01–FR-06.

**Dosyalar:** `apps/server/src/storage/{retention,backup}.ts`, `tests/integration/retention-backup.test.ts`, `tests/bench/opportunities.ts`, `README.md`, `docs/{DECISIONS,TEST-REPORT,PERFORMANCE,PROGRESS}.md`.

**Arayüz:** `POST /api/backups`, `POST /api/restore/preview`, `POST /api/restore`; geri yükleme öncesi yedek ve doğrulama. Karar kanıt kotası yapılandırmada zorunlu/görünürdür; uygulamada önerilen başlangıç 100 MiB olarak belgelenip kullanıcıya gösterilir.

- [ ] 31. görüntü, 91 günlük görüntü, bağlı karar kanıtı, dolu disk ve bozuk geri yükleme testlerini yaz; hata mevcut kanıtı veya veritabanını kısmen değiştirmemeli.
- [ ] `npx vitest run tests/integration/retention-backup.test.ts` ile başarısızlığı doğrula.
- [ ] Saklama temizliğini, kota uyarısını, SQLite backup yöntemini ve geçici dizinde doğrulanmış geri yüklemeyi uygula; bağlı kanıtı ayrı kota politikasıyla yönet.
- [ ] Tüm kontrolleri çalıştır; 50 kaynak fikstüründe filtreleme/fark açma için p95 300 ms hedefini ölç. Ağ süresi, tarama çevrimi ve kuyruk beklemesini API gecikmesinden ayrı raporla.
- [ ] Kaynak güveni → değişiklik kalitesi → karar akışı → pilot kararı kapılarını kanıtlarıyla kaydet. Aktivasyon = üç kaynak + bir karar; hedef ≥%60. Yanlış pozitif hedefi <%20, payda değerlendirilen tüm uyarılar; gerekçe kullanıcıyla doğrulanmalı. Bunları gerçekleşmiş başarı diye yazma.

## Teslim ve sorumluluk kontrolü

- [ ] **Ürün:** A bölümündeki hedef kitle, pilot ölçüm tanımı, örneklem ve devam/daralt/durdur kararı kaydedildi; gelir veya başarı garantisi verilmedi.
- [ ] **UX:** Kaynak hatası ile içerik değişikliği ayrıldı; klavye, dört ekran genişliği, boş/yüklenen/kısmi hata/kaydedilmemiş değişiklik durumları kontrol edildi.
- [ ] **Mühendislik:** P0/P1 işleri, migration, lockfile, örnek yapılandırma, lisans envanteri, güvenlik ve tutarlı yedek tamamlandı.
- [ ] **QA:** `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:integration`, `npm run test:e2e`, `npm run build`, `npm run bench` gerçek çıktıları kaydedildi. Donanım/OS, veri sayısı, ısınma, tekrar, p50/p95, başarısızlık ve ölçülen süreçler belirtildi.
- [ ] Türkçe README'de geliştirme/production/test, sınırlar, sorun giderme ve geri yükleme anlatıldı. `docs/PROGRESS.md` yalnız tamamlanan işleri, çalıştırılan kontrolleri ve sıradaki somut adımı içeriyor. Test edilmemiş dış kaynaklar ayrıca belirtildi.

Her iş testleri geçtikten sonra bağımsız proje deposunda küçük bir commit ile kaydedilebilir. Bu plan hazırlanırken kod testi veya pilot çalıştırılmadı.

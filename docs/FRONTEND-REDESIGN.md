# Fırsat Radarı — arayüz yenilemesi

15 Ekim 2026. Arayüz yenileme briefi (bu depoda yer almıyor) çalışan React uygulamasına uygulandı. [Önce/sonra karşılaştırmasını aç](../artifacts/frontend-redesign/index.html).

## Görünüm ve davranış

- Büyük karşılama ve sayaç kartları kaldırıldı. Açık renk 200 px kaynak/kategori navigasyonu, 64 px araç çubuğu, gelişme satırları ve 480 px bağlamsal kanıt okuyucusu ana düzeni oluşturuyor. Özet sayıları gerçek API verisinden geliyor.
- Tek yerel font DM Sans; Türkçe karakterler Latin Extended dosyasından sunuluyor. Mevcut paket OFL-1.1 lisanslı. Yeni bağımlılık veya uzak font eklenmedi. Semantik renk, boşluk, tipografi, köşe ve hareket değişkenleri kullanıldı; eski CSS yerini yeni düzenin kurallarına bıraktı.
- Satırlar kaynak, iki satırlık başlık, gerçek özet, değişiklik türü, okunmamış etiketi, gözlem zamanı ve onaylı tarih/aday ayrımını gösteriyor. Kaynak, kategori, tür, karar durumu, sıralama ve seçili kayıt URL'de; geri/ileri, liste kaydırması ve klavye odağı korunuyor.
- Mevcut `/api/items` tüm koleksiyonu getiriyor. Filtreleme ve sıralama bu tam koleksiyonda uygulanıyor; sunucu sayfalaması veya yeni API desteği varsayılmadı.
- Okuyucuda kaynak bağlantısı, önceki/yeni gözlem tarihleri, +/− işaretli fark, tam genişlik seçeneği ve erişilebilir karar barı var. Genişletme, tamamlanmamış tarih formunu koruyor. Kaynak hatası, boş sürüm ve kaldırılmış içerik ayrı açıklanıyor.
- Tarih adayları takvime kendiliğinden girmiyor. Yeniden inceleme gerektiğinde önceki onay görünür; mevcut onay, karar ve kanıt saklama sözleşmeleri kullanılıyor.
- Kaynaklar son başarılı ve planlanan kontrolü gösteriyor. Takvim varsayılan olarak yaklaşan onaylı tarihler ajandasıyla açılıyor; ay görünümü ve seçili gün korunuyor. Kaydedilenler, bildirimler, ayarlar/yedekleme, eşleştirme ve yardım aynı görsel dilde.
- 1280 px ve daha darda okuyucu bağımsız görünüm; 768 px'te kaynak navigasyonu diyalogda, 390 px'te filtre alt çekmecede. Arama `Ctrl/⌘ K`, açma/geri dönüş, Escape, odak tuzağı ve reduced-motion davranışları mevcut.

## Değişen uygulama dosyaları

| Alan                             | Dosyalar                                                                                                                                 |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Yerleşim, gezinme, diyalog odağı | `apps/web/src/App.tsx`, `components/Layout.tsx`, `components/ui.tsx`, `lib/navigation.ts`                                                |
| Gelişme listesi ve küçük özet    | `features/inbox/OpportunityList.tsx`, `features/inbox/Dashboard.tsx`                                                                     |
| Kanıt ve tarih onayı             | `features/diffs/DiffDetail.tsx`                                                                                                          |
| Tamamlayıcı ekranlar             | `features/sources/Sources.tsx`, `features/decisions/Calendar.tsx`, `features/inbox/Notifications.tsx`, `features/onboarding/Pairing.tsx` |
| Font ve görsel sistem            | `main.tsx`, `styles/tokens.css`, `styles/app.css`                                                                                        |

Tablodaki kısaltılmış yollar `apps/web/src` altındadır. `tests/ui/workspace.test.tsx` ve tarayıcı testleri güncellendi; iki yeni e2e dosyası ve ayrı geçici demo test sunucusu eklendi. README, ilerleme ve doğrulama raporu güncellendi. Backend uygulaması, veri şeması, domain modülleri ve bağımlılık dosyaları değiştirilmedi.

## Çalıştırılan kontroller

| Kontrol                    | Sonuç / kanıt                                                          |
| -------------------------- | ---------------------------------------------------------------------- |
| `npm run typecheck`        | Geçti |
| `npm run lint`             | Geçti |
| `npm run format:check`     | Geçti |
| `npm test`                 | 26/26 |
| `npm run test:integration` | 64/64 |
| `npm run build`            | Playwright sunucusu başlamadan Vite ve esbuild derlemeleri geçti       |
| `npm run test:e2e`         | Chromium ile 9/9 |

Toplam **99 test geçti**. Tarayıcı testinde terminal eşleştirmesi → üç kaynak ekleme/önizleme → başlangıç onayı → kontrollü değişiklik → gerçek kuyruk → fark → kaydetme → tarih onayı → takvimden kanıta gidip seçili ay/güne dönme → yeniden yükleme sonrası kalıcılık doğrulandı. Bu akış gerçek Express API ve geçici SQLite kullanır; dış kaynak içeriği kontrollü fixture'dır.

1440, 1280, 768 ve 390 px'te dolu/boş/yükleniyor durumları ve tamamlayıcı ekranlar kontrol edildi. Filtre/URL/geri-ileri, masaüstü ve mobil kaydırma dönüşü, uzun Türkçe başlık, önceki onay, kaldırılmış içerik, bağlantı/önizleme hatası ve form korunması sınandı. Tarayıcıdaki axe WCAG 2 A/AA ve 2.1 AA kontrollerinde, **renk kontrastı dahil**, kontrol edilen ekranlarda ihlal çıkmadı. Görünür odak, modal odak dönüşü ve reduced-motion da geçti; bu sonuç manuel ekran okuyucu denetimi veya tam WCAG sertifikası değildir.

Bağımsız kod incelemesindeki arama odağı kaybı, önce hatayı yeniden üreten UI testiyle doğrulandı ve düzeltildi. Tıklayarak veya `Ctrl+K` ile aramaya geçince yazma kesilmiyor. Tam genişlikteki takvim/bildirim okuyucusunda etkisiz genişletme düğmesi kaldırıldı.

## Görsel kanıt ve sınırlar

Önce/sonra görüntüleri [karşılaştırma sayfasında](../artifacts/frontend-redesign/index.html); ek hata, mobil filtre, uzun metin ve yeniden inceleme görüntüleri `artifacts/frontend-redesign/after` altında. Görüntüler izole demo/test verisiyle alındı; gerçek kullanıcı verisi kullanılmadı.

Canlı kurum kaynakları ve kullanıcı pilotu bu görsel yenilemede değerlendirilmedi. Önceki audit çalışmasının registry DNS engeli bu teslimde yeniden değerlendirilmedi; güncel güvenlik taraması yapıldığı iddia edilmiyor. Yayınlama veya gerçek kaynaklara toplu işlem yapılmadı. Git metaverisi bulunmadığından commit/PR oluşturulmadı.

Yerel önizleme: proje kökünde `npm run demo`, ardından `http://127.0.0.1:5173`. Ayrıntılı kurulum [README](../README.tr.md) içinde.

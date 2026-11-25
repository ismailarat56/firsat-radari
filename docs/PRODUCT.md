# Ürün, pilot ve aşamalı backlog

## Ürün kararı

Hedef kullanıcı aynı anda birçok kamuya açık kurum duyurusunu takip eden öğrenci, yeni mezun ve kariyer danışmanıdır. İlk değer, üç kaynağın geçerli başlangıcı üzerinden anlamlı bir değişikliği görüp bir karar verebilmektir. Ayırt edici davranış her kararı kaynak metni, önceki/yeni görüntü ve gözlem zamanı ile ilişkilendirmektir.

V1 tek kullanıcılı yerel Linux uygulamasıdır. Ana ekran, gelen kutusu, kaydedilenler, onaylı takvim, kaynak masası, bildirimler ve ayarlar uygulanmıştır. İlk görüntü bildirim yaratmaz. İncele/Kaydet/İlgisiz/Arşivle kararları ve onaylı son tarihler kalıcıdır. Eksik yıl/saat dilimi kaynak bilgisi olarak uydurulmaz.

Görsel dil sakin ve okunaklı bir çalışma alanına dayanır: petrol yeşili kenar çubuğu, kırık beyaz yüzey, ince sınırlar, ölçülü renk kodları, yerel fontlar. Artı/eksi etiketli fark ve metin durumları yalnız renge bağımlılığı azaltır. Animasyon azaltma tercihi CSS ile desteklenir; dört genişlikte gerçek tarayıcı doğrulaması beklemektedir.

## Kabul kapıları

| Kapı | Elde edilen kanıt | Açık doğrulama |
| --- | --- | --- |
| Kaynak güveni | URL/DNS/IP sabitleme, redirect/robots, bozuk/giriş/boş içerik ve boyut sınırı fixture testleri | İzinli ortamda üç gerçek kamu kaynağında başlangıç, yeniden kontrol ve hata davranışı |
| Değişiklik kalitesi | Kimlik/sürüm, değişmez görüntü, tarih korunması, tek bildirim, 304 ve 91 günlük saklama regresyonları | Gerçek uyarı örnekleminde kullanıcı tarafından değerlendirilen gürültü |
| Karar akışı | Gerçek React → Express → SQLite testinde üç kaynak, fark, klavyeyle açma, kaydetme, tarih ve kalıcılık | Gerçek tarayıcı, görünür odak/kontrast, dört genişlik ve ekran okuyucu değerlendirmesi |
| Pilot kararı | Ölçüm ve örneklem aşağıda tanımlı | Kullanıcı alınmadı; oran veya gelir başarısı ölçülmedi |

Bu tablo bir pilot başarı raporu değildir. Mevcut karar: teknik uygulamayı teslim et, açık kabul kontrollerinden sonra kullanıcı pilotunu değerlendir. Kullanıcı daveti, mesaj gönderme veya hesap açma yapılmadı.

## Pilot tasarımı — uygulanmadı

İlk keşif örneklemi için **10–15 gönüllü kullanıcı** ve değerlendirilen en az **50 uyarı** önerilir. Bu sayılar istatistiksel güç hesabı değildir; küçük örneklemin belirsizliğiyle birlikte raporlanacak başlangıç varsayımıdır. Kullanıcı bazında dağılım da gösterilmeli, birkaç yoğun kullanıcının tüm örneklemi temsil etmesi önlenmelidir. Süre, işe alım ve gözlem yoğunluğuna göre belirlenir; takvim veya tamamlanma tarihi uydurulmaz.

| Ölçü | Pay / payda | Hipotez |
| --- | --- | --- |
| Aktivasyon | Üç geçerli kaynak başlangıcı + en az bir incele/kaydet/ilgisiz/arşivle kararı veren katılımcı / kuruluma başlayan katılımcı | ≥ %60 |
| Yanlış pozitif | Gerekçesi kısa görüşmeyle doğrulanan anlamsız/hatalı uyarı / kullanıcıların değerlendirdiği tüm uyarılar | < %20 |
| Tekrar kullanım | Ayrı günlerde geri dönüp gerçek kararı güncelleyen kullanıcı; görüşmeyle bağlam | Keşif ölçümü, önceden başarı oranı yok |
| Başvuruya katkı | Kullanıcının ürün sayesinde izlediğini doğruladığı başvurular | Keşif ölçümü; otomatik başvuru iddiası yok |

“İlgisiz” tek başına yanlış pozitif etiketi değildir. Başvuru koşullarının uygun olmaması gerçek bir duyuruyu yanlış yapmaz. Kaynak yapısı, filtre/anahtar kelime ve kişisel uygunluk sorunlarını gerekçeyle ayırın. Olay tablosu içerik gövdeleri olmadan yerel ad/kimlik/zaman kaydeder (`source_added`, `baseline_validated`, `change_detected`, `item_reviewed`, `item_saved`, `deadline_confirmed`, `alert_dismissed`); dış analitik gönderimi yoktur. Pilot raporu yalnız açık katılımla hazırlanmalıdır.

**Devam:** teknik kabul kapıları açık, kullanım ve doğrulanan kalite hipotezleri olumlu, görüşmeler tekrar kullanım ihtiyacını destekliyor. **Daralt:** belirli kaynak türünde güvenilirlik düşük veya kurulumda kayıp yüksek; desteklenen kaynakları ve kurulum akışını daraltıp yeniden ölç. **Durdur:** kanıt güvenilirliği sağlanamıyor veya tekrar kullanım ihtiyacı desteklenmiyor. Küçük örneklemde eşik geçildi diye ticari başarı sonucu çıkarılmaz.

## Backlog

| Öncelik | Durum / iş | Tamamlanma kanıtı |
| --- | --- | --- |
| P0 | Uygulandı: oturum, kalıcılık, güvenli toplama, başlangıç/fark, kuyruk, karar/tarih, saklama/geri yükleme | Test raporu; bağımsız incelemenin altı önemli bulgusu düzeltildi |
| P1 | Uygulandı: premium ekranlar, gerçek API durumları, URL filtreleri, kaynak geçmişi, takvim, yedek arayüzü, açık demo | React/API entegrasyon testleri; browser görsel kabulü bekliyor |
| P0/P1 kabul | Açık: socket/production başlangıcı, gerçek HTTP testleri, Playwright + dört genişlik/kontrast, güncel audit | İzinli Linux ortamında README komutları ve TEST-REPORT adımları |
| P1 kaynak kabul | Açık: üç gerçek kurum kaynağı; RSS/Atom + statik HTML davranışı, kurum erişim kuralları | URL, zaman, yöntem, gerçek çıktı ve başarısızlık kaydı |
| Pilot | Açık: gönüllü örneklem, uyarı gerekçeleri, aktivasyon/yanlış pozitif ve devam/daralt/durdur | Yukarıdaki pay/payda ile rapor; henüz yapılmadı |
| P2 / v1.1 | Yalıtılmış JavaScript sayfa adaptörü | Ayrı süreç, kaynak kotaları ve aynı ağ güvenlik politikası tasarlanmadan eklenmez |
| P2 / v1.1 | Açıkça yapılandırılan resmî API adaptörleri | Kurum izinleri, kota ve sürüm sözleşmesiyle kaynak bazlı |
| P2 / sonrası | Katılımlı e-posta, ortak kaynak paketleri ve gelir modeli araştırması | Kullanıcı onayı ve pilot ihtiyacı; v1'de işlevsiz buton yok |

Bireysel abonelik veya danışman paketi bir araştırma yönüdür. Ödeme isteği ve tekrar kullanım ölçülmedi; fiyat, gelir ve pazar başarısı vaadi verilmez.

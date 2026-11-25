# Performans raporu

Ölçüm: 2026-10-15T02:21:48.180Z. Kaynak: [benchmark.json](../artifacts/benchmark.json); komut: `npm run build`, ardından `npm run bench`. Son ölçüm çıktısı raporlanır; önceki denemelerden en iyi değer seçilmez.

## Ortam ve yöntem

- Ubuntu 26.04.1 / linux 7.0.0-38-generic; v24.19.0.
- Intel(R) Core(TM) i7-10750H CPU @ 2.60GHz; 12 mantıksal CPU; 14.95 GiB RAM.
- 50 kaynak, kaynak başına 20 duyuru: 1000 kalıcı öğe ve 100 görüntü. Her kaynakta başlangıç ve kontrollü güncelleme var.
- İşlem başına 20 ısınma, 200 ölçüm; 400 ölçülen çağrı, 40 ısınma çağrısı.
- Production esbuild sunucu bundle’ı, gerçek Express ve SQLite kullanıldı. Filtreli liste 500 öğe döndürür; fark çağrısı bir öğenin önceki/yeni kanıtını açar.
- Ölçüm, süreç içi API gidiş/dönüşünü; middleware, SQLite, JSON üretimi ve test taşımasının JSON çözümünü içerir. TCP, tarayıcı render, kaynakların DNS/ağ gecikmesi ve indirme süresi dahil değildir.
- Enjekte taşımanın stream/nextTick temizliği için istekler arasında event-loop yield yapılır; bu bekleme ölçülen çağrı süresine dahil edilmez. Manuel GC zorlanmadı. Ortak geliştirme makinesinde bir ölçümdür; yalıtılmış laboratuvar veya hizmet seviyesi garantisi değildir.

## Sonuç

| İşlem | p50 | p95 | En uzun |
| --- | ---: | ---: | ---: |
| Kategori + Türkçe aramayla liste | 28.497 ms | 31.73 ms | 42.188 ms |
| Fark / kanıt açma | 0.793 ms | 1.458 ms | 3.092 ms |

Başarısız ölçülen çağrı: **0**. Bu koşullarda iki işlem de p95 < 300 ms hedefinin altında. Sonuç, browser veya gerçek HTTP gecikmesinin kabulü yerine geçmez.

## Kaynak kullanımı

Ölçülen süreç yalnız benchmark Node sürecidir; Express, SQLite, import edilen bağımlılıklar ve test taşıması dahildir. Son RSS **363.18 MiB**, JS heap kullanımı **39.31 MiB**, süreç tepe RSS **455.18 MiB**. CPU kullanıcı süresi **7079.094 ms**, sistem süresi **353.689 ms**; bu değerler ısınma + ölçüm bölümünün kümülatif CPU zamanıdır, yüzde değildir. RSS/tepe değerleri veri hazırlama ve geçici tahsislerden de etkilenir.

Bu yoğun kısa test uzun süreli bellek kararlılığını ölçmez. Browser belleği, bütün makine CPU kullanımı, gerçek kaynak toplayıcıları ve kullanıcı cihazının günlük çalışma yükü için sonuç üretilmedi.

## Toplama ve kuyruk ayrı ölçülür

Bu benchmark dış kaynağa çıkmaz; toplama çevrimi veya kuyruk gecikmesi için gerçek site ölçümü yoktur. Host başına bir eşzamanlı istek ve en az 10 saniye ara kod/test politikasıdır; hızlı API yanıtı bu süreyi ortadan kaldırmaz. Robots/crawl-delay/Retry-After daha uzun bekletebilir. Ağ zaman aşımı, kuyruk beklemesi ve 50 kaynağın toplam turu API p95 ile birleştirilmemelidir.

Bir sonraki performans kabulü: aynı 50 kaynak fixture’ıyla socket tabanlı API ve gerçek browser ölçümü; ardından izinli gerçek kaynaklarda DNS/indirme, host beklemesi ve tur tamamlanmasını ayrı kayıtlarla ölçmek. Henüz yapılmadı.

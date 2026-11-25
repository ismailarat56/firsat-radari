[← README'ye dön](../README.tr.md)

# Kullanım

Hızlı başlangıç, ilk akış, yedekleme ve sorun giderme ayrıntıları. Kısa kurulum özeti [README](../README.tr.md#kurulum-ve-çalıştırma) içindedir.

## Arayüz

Açık kaynak navigasyonu, gelişme listesi ve bağlamsal kanıt okuyucusu bir inceleme masasında birleşir. Yerel DM Sans fontu, genişletilebilir önce/sonra farkı, onaylı tarih ajandası ve klavye ile kullanılabilen Radix diyalogları içerir. Ekranlar gerçek Express API ve SQLite verisine bağlıdır. [Önce/sonra görüntüleri](../artifacts/frontend-redesign/index.html) ve [arayüz yenileme raporu](FRONTEND-REDESIGN.md) teslim ayrıntılarını gösterir.

## Hızlı başlangıç

Node.js **22.12 veya üstü** gerekir; geliştirme Node 24.19.0 / npm 11.17.0 / Ubuntu 26.04.1 üzerinde yapıldı. Komutları bu proje klasöründe çalıştırın.

```bash
npm ci
npm run demo
```

Tarayıcıda **http://127.0.0.1:5173** adresini açın. Demo, ayrı `.local/demo` dizininde 8 örnek kaynak ve 12 fırsat oluşturur. Etiketli örnek içerikler gerçek kurum duyurusu değildir. Demo içinde yaptığınız kararlar kalıcıdır; normal veritabanına karışmaz. Hazır demo kaynaklarının elle kontrolleri kontrollü örnek değişiklik üretir. Demo otomatik tarama yapmaz; ayrıca gerçek bir URL eklerseniz önizleme normal ağ adaptörünü kullanır.

Kendi kaynaklarınızla boş bir çalışma alanı açmak için demo sürecini `Ctrl+C` ile kapatıp:

```bash
npm run dev
```

Aynı adresi açın ve terminaldeki **10 dakika geçerli, tek kullanımlık eşleştirme kodunu** girin. Saat diliminizi seçin. Demo ve normal mod aynı veri dizinini kullanamaz; yanlış modla açılış ve modlar arası geri yükleme reddedilir.

## İlk gerçek akış

1. **Kaynak ekle:** kurumun kamuya açık RSS/Atom URL'sini girin. HTML kullanıyorsanız izlenecek statik içerik için açık bir CSS seçicisi belirtin; tüm sayfa otomatik seçilmez.
2. **Kaydet ve önizle:** içerik, öğe sayısı ve kaynak sınırını kontrol edin. Önizleme başarısız olursa form korunur; hata bir içerik silinmesi olarak kaydedilmez.
3. **Başlangıç görüntüsünü onayla:** ilk görüntü bildirim üretmez. İlk üç kaynak için kurulum ilerlemesi görünür.
4. **Radarı yenile:** elle veya zamanlanmış kontroller aynı kuyruğu kullanır. İşin durumu ve bekleme nedeni gösterilir.
5. **Kanıtı incele:** önceki/yeni metni, kaynak bağlantısını ve gözlem zamanını karşılaştırın. İnceledim / Kaydet / İlgisiz / Arşivle kararını verin.
6. **Tarihi onayla:** kaynakta olmayan yıl veya saat dilimi sizin eklediğiniz bilgi olarak kaydedilir. Onaysız tarih adayları takvim ve hatırlatma üretmez.

Kaynak takibini duraklatabilir, devam ettirebilir ve takipten kaldırabilirsiniz. Takipten kaldırılan kaynak kaynak listesinden çıkar; daha önce gözlenen fırsatları, kararları, onaylı tarihleri ve hatırlatmaları erişilebilir kalır. Bir fırsatı listelerden kaldırmak için fırsatın kendi Arşivle kararını kullanın. Arama, kaynak, kategori, değişiklik türü, karar durumu, sıralama ve açık kanıt URL'de korunur. Ayrıntıdan dönüşte liste kaydırması ve odak geri gelir. Kaydedilenler, takvim, bildirimler ve ayarlar ayrı görünümlerdir. Aramaya `Ctrl/⌘ K`, okuyucudan listeye `Escape` ile geçilebilir; yazı alanındayken kısayollar tetiklenmez.

## Yedekleme ve geri yükleme

**Ayarlar → Yedek oluştur** çalışan SQLite üzerinden tutarlı online yedek alır. Listeden indirebilir veya mevcut yedeği geri yükleyebilirsiniz. Yedekler veri dizininin `backups/` altındaki UUID adlı `.sqlite` ve eşlik eden `.json` dosyalarıdır.

Geri yüklemede dosya önce geçici dizine alınır; bütünlük, foreign key, şema, sürüm, veri modu ve boyut denetlenir. Uygulama mevcut durumun güvenlik yedeğini alır; ardından geri yüklemeyi tek transaction ile yapar. Oturumlar kapatılır ve yeni kod terminalde gösterilir. Onay için **GERİ YÜKLE** yazılması gerekir. Eski önizleme/tarama sonuçları geri yüklenen duruma yazamaz.

Başka diskte saklamak için uygulamanın oluşturduğu `.sqlite` ile aynı UUID'li `.json` dosyasını birlikte koruyun. Bir kurulumda yeniden listelemek için uygulama kapalıyken bu çifti aynı moddaki veri dizininin `backups/` klasörüne koyun; açınca arayüzden doğrulayıp geri yükleyin. İndirme bağlantısının verdiği okunaklı dosya adı iç UUID adı yerine kullanılamaz. V1'de tarayıcıdan keyfi dosya yükleme yoktur. Çalışan `radar.sqlite` dosyasını tek başına kopyalamayın. Yedekler şifrelenmez ve otomatik silinmez; disk alanını takip edin. Geri yükleme sınırı 512 MiB'dır.

## Sorun giderme

| Belirti                          | Çözüm                                                                                                                                                                            |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Arayüz API'ye bağlanamıyor       | API terminalini, 4318 portunu ve Vite proxy hedefini kontrol edin; `localhost` ile `127.0.0.1` arasında oturum taşınmaz.                                                         |
| Kod reddediliyor / süresi doldu  | Terminaldeki en yeni kodu kullanın; çıkış sonrası kod yenilenir. Gerekirse sunucuyu yeniden başlatın.                                                                            |
| `DATA_MODE_MISMATCH`             | Demo ve normal modu ayrı dizinlerle açın; mevcut veri dizinini silmek gerekmez.                                                                                                  |
| `EPERM` / `EADDRINUSE`           | İşletim ortamı port açmayı engelliyor veya port dolu. Port erişimine izin veren yerel terminalde çalıştırın; kullanılan portu değiştirmek production'da `FR_PORT` ile mümkündür. |
| Boş seçici / JavaScript sayfası  | Kurumun RSS/Atom beslemesini bulun veya gerçek HTML yanıtında bulunan açık bir bölgeyi seçin. Başlangıç görüntüsünü yeniden doğrulayın.                                          |
| Robots/429/erişim kısıtı         | Kuyruktaki nedeni ve sonraki denemeyi inceleyin. Kısıtı aşmak için daha sık istek gönderilmez.                                                                                   |
| Kanıt kotası / disk dolu         | Ayarlardaki kullanım ve disk alanını inceleyin, güvenli yedek alın. Korunan kanıt sessiz silinmez.                                                                               |
| Native SQLite kurulumu başarısız | Desteklenen Node/Linux mimarisini kullanın; ilgili platformda hazır binary yoksa C++ derleme araçları ve Python gerekir.                                                         |

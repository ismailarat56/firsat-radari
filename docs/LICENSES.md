# Bağımlılık ve varlık envanteri

Bu dosya `npm run licenses` ile lockfile ve kurulu paketlerin kendi metaverisinden oluşturulur. Tam geçişli envanter [artifacts/licenses.json](../artifacts/licenses.json) içindedir (505 paket kaydı; platforma bağlı isteğe bağlı paketler dahil). Kurulu çalışma bağımlılıklarının lisans/bildirim dosyaları [THIRD-PARTY-NOTICES.txt](THIRD-PARTY-NOTICES.txt) içinde korunur. Paket güncellemesinden sonra ikisini yeniden üretin.

| Doğrudan bağımlılık | Sürüm | Bildirilen lisans | Kullanım |
| --- | --- | --- | --- |
| @eslint/js | 10.0.1 | MIT | Geliştirme/test |
| @fontsource-variable/dm-sans | 5.3.0 | OFL-1.1 | Çalışma/dağıtım |
| @fontsource-variable/manrope | 5.3.0 | OFL-1.1 | Çalışma/dağıtım |
| @playwright/test | 1.64.1 | Apache-2.0 | Geliştirme/test |
| @radix-ui/react-dialog | 1.3.1 | MIT | Çalışma/dağıtım |
| @tailwindcss/vite | 4.3.3 | MIT | Geliştirme/test |
| @tanstack/react-query | 5.104.2 | MIT | Çalışma/dağıtım |
| @testing-library/jest-dom | 7.0.1 | MIT | Geliştirme/test |
| @testing-library/react | 16.3.3 | MIT | Geliştirme/test |
| @testing-library/user-event | 14.6.8 | MIT | Geliştirme/test |
| @types/better-sqlite3 | 9.6.0 | MIT | Çalışma/dağıtım |
| @types/express | 5.0.6 | MIT | Geliştirme/test |
| @types/node | 26.6.5 | MIT | Çalışma/dağıtım |
| @types/react | 19.3.0 | MIT | Çalışma/dağıtım |
| @types/react-dom | 19.3.0 | MIT | Çalışma/dağıtım |
| @types/supertest | 7.2.1 | MIT | Geliştirme/test |
| @vitejs/plugin-react | 6.1.2 | MIT | Geliştirme/test |
| axe-core | 4.14.0 | MPL-2.0 | Geliştirme/test |
| better-sqlite3 | 13.0.3 | MIT | Çalışma/dağıtım |
| cheerio | 1.2.0 | MIT | Çalışma/dağıtım |
| concurrently | 10.0.6 | MIT | Geliştirme/test |
| drizzle-orm | 0.45.4 | Apache-2.0 | Çalışma/dağıtım |
| esbuild | 0.28.2 | MIT | Geliştirme/test |
| eslint | 10.12.0 | MIT | Geliştirme/test |
| eslint-plugin-react-hooks | 7.1.1 | MIT | Geliştirme/test |
| express | 5.3.0 | MIT | Çalışma/dağıtım |
| fast-xml-parser | 5.11.2 | MIT | Çalışma/dağıtım |
| iconv-lite | 0.7.3 | MIT | Çalışma/dağıtım |
| ipaddr.js | 2.5.0 | MIT | Çalışma/dağıtım |
| jsdom | 30.1.2 | MIT | Geliştirme/test |
| lucide-react | 1.57.0 | ISC | Çalışma/dağıtım |
| prettier | 3.9.10 | MIT | Geliştirme/test |
| react | 19.3.1 | MIT | Çalışma/dağıtım |
| react-dom | 19.3.1 | MIT | Çalışma/dağıtım |
| robots-parser | 3.0.1 | MIT | Çalışma/dağıtım |
| supertest | 7.3.1 | MIT | Geliştirme/test |
| tailwindcss | 4.3.3 | MIT | Geliştirme/test |
| tsx | 4.23.15 | MIT | Geliştirme/test |
| typescript | 6.0.3 | Apache-2.0 | Geliştirme/test |
| typescript-eslint | 8.71.2 | MIT | Geliştirme/test |
| vite | 8.3.4 | MIT | Geliştirme/test |
| vitest | 5.0.4 | MIT | Geliştirme/test |
| zod | 4.6.7 | MIT | Çalışma/dağıtım |

Manrope ve DM Sans fontları paket içinden yerel sunulur; SIL OFL metinleri bildirim dosyasına dahildir. Lucide ikonları paketin ISC lisansını taşır. Radar işareti ve dekoratif görseller uygulamanın SVG/CSS kodudur. Harici fotoğraf, model ağırlığı, ücretli AI servisi ve medya codec'i eklenmedi. SQLite'ın paketlenmiş kaynağındaki kendi bildirimleri de dağıtılacak native paketle birlikte korunmalıdır.

Kök proje MIT lisansıyla sunulur. Üçüncü taraf metinleri uygulama için bir lisans seçimi yerine geçmez. Dağıtımda kullanılan paketlerin orijinal lisans ve bildirim dosyalarını koruyun; bu envanter hukuki uygunluk onayı değildir.

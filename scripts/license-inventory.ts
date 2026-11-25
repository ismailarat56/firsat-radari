import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

type Metadata = {
  name?: string;
  version?: string;
  license?: string | { type: string };
  dev?: boolean;
  optional?: boolean;
};
const root = JSON.parse(readFileSync('package.json', 'utf8'));
const lock = JSON.parse(readFileSync('package-lock.json', 'utf8')) as {
  packages: Record<string, Metadata>;
};
const direct = new Set([...Object.keys(root.dependencies), ...Object.keys(root.devDependencies)]);
const inventory = Object.entries(lock.packages)
  .filter(([path]) => path)
  .map(([path, locked]) => {
    const packageFile = join(path, 'package.json');
    const installed = existsSync(packageFile);
    const metadata = installed
      ? (JSON.parse(readFileSync(packageFile, 'utf8')) as Metadata)
      : locked;
    const name = metadata.name ?? path.slice(path.lastIndexOf('node_modules/') + 13);
    const declared = metadata.license ?? locked.license;
    const license = typeof declared === 'string' ? declared : (declared?.type ?? 'UNDECLARED');
    const notices = installed
      ? readdirSync(path)
          .filter((file) => /^(licen[sc]e|copying|notice|ofl)(\.|$)/i.test(file))
          .map((file) => join(path, file))
      : [];
    return {
      name,
      version: locked.version,
      license,
      developmentOnly: Boolean(locked.dev),
      optional: Boolean(locked.optional),
      direct: direct.has(name) && path === `node_modules/${name}`,
      installed,
      path,
      notices,
    };
  })
  .sort((a, b) => a.name.localeCompare(b.name) || a.path.localeCompare(b.path));
mkdirSync('artifacts', { recursive: true });
mkdirSync('docs', { recursive: true });
writeFileSync(
  'artifacts/licenses.json',
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      source: 'package-lock.json and installed package metadata; not a legal review',
      packages: inventory,
    },
    null,
    2,
  ) + '\n',
);
const notices = inventory
  .filter((item) => item.installed && !item.developmentOnly)
  .flatMap((item) =>
    item.notices.map((file) => {
      try {
        return `\n${'='.repeat(72)}\n${item.name}@${item.version} — ${file}\n${'='.repeat(72)}\n${readFileSync(file, 'utf8')}\n`;
      } catch {
        return '';
      }
    }),
  );
writeFileSync('docs/THIRD-PARTY-NOTICES.txt', notices.join(''));
const rows = inventory
  .filter((item) => item.direct)
  .map(
    (item) =>
      `| ${item.name} | ${item.version} | ${item.license} | ${item.developmentOnly ? 'Geliştirme/test' : 'Çalışma/dağıtım'} |`,
  )
  .join('\n');
writeFileSync(
  'docs/LICENSES.md',
  `# Bağımlılık ve varlık envanteri\n\nBu dosya \`npm run licenses\` ile lockfile ve kurulu paketlerin kendi metaverisinden oluşturulur. Tam geçişli envanter [artifacts/licenses.json](../artifacts/licenses.json) içindedir (${inventory.length} paket kaydı; platforma bağlı isteğe bağlı paketler dahil). Kurulu çalışma bağımlılıklarının lisans/bildirim dosyaları [THIRD-PARTY-NOTICES.txt](THIRD-PARTY-NOTICES.txt) içinde korunur. Paket güncellemesinden sonra ikisini yeniden üretin.\n\n| Doğrudan bağımlılık | Sürüm | Bildirilen lisans | Kullanım |\n| --- | --- | --- | --- |\n${rows}\n\nManrope ve DM Sans fontları paket içinden yerel sunulur; SIL OFL metinleri bildirim dosyasına dahildir. Lucide ikonları paketin ISC lisansını taşır. Radar işareti ve dekoratif görseller uygulamanın SVG/CSS kodudur. Harici fotoğraf, model ağırlığı, ücretli AI servisi ve medya codec'i eklenmedi. SQLite'ın paketlenmiş kaynağındaki kendi bildirimleri de dağıtılacak native paketle birlikte korunmalıdır.\n\nKök proje MIT lisansıyla sunulur. Üçüncü taraf metinleri uygulama için bir lisans seçimi yerine geçmez. Dağıtımda kullanılan paketlerin orijinal lisans ve bildirim dosyalarını koruyun; bu envanter hukuki uygunluk onayı değildir.\n`,
);
console.log(
  `${inventory.length} lockfile entries; ${notices.length} installed runtime notice files. Inventory written.`,
);

import { randomUUID } from 'node:crypto';
import type { DB } from './database';
import { setting, setSetting, putJson } from './database';
import { saveSource } from '../modules/sources/service';
import { canonicalize, type CanonicalDocument } from '../../../../packages/shared/src/canonicalize';
import { observationService, latestSnapshot } from '../modules/observations/service';
import { decide, confirmDeadline } from '../modules/decisions/service';
import { addNotification } from '../modules/notifications/service';
import type { Fetcher, FetchResult } from '../network/safe-fetch';
import type { Category, Source, Observation } from '../../../../packages/shared/src/contracts';
const escape = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const dateText = (date: Date) =>
  date.toLocaleDateString('tr-TR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Europe/Istanbul',
  });
function xml(items: { identity: string; title: string; content: string; url: string }[]) {
  return `<rss version="2.0"><channel><title>Fırsat Radarı · örnek kaynak</title>${items.map((i) => `<item><guid>${escape(i.identity.replace(/^guid:/, ''))}</guid><title>${escape(i.title)}</title><link>${escape(i.url)}</link><description>${escape(i.content)}</description></item>`).join('')}</channel></rss>`;
}
function html(items: { identity: string; title: string; content: string; url: string }[]) {
  return `<html><head><title>Örnek duyurular</title></head><body><main id="announcements">${items.map((i) => `<article data-id="${escape(i.identity.replace(/^html:/, ''))}"><h2><a href="${escape(i.url)}">${escape(i.title)}</a></h2><p>${escape(i.content)}</p></article>`).join('')}</main></body></html>`;
}
export function createDemoFetcher(db: DB, now: () => Date, fallback: Fetcher): Fetcher {
  return async (request) => {
    const url = new URL(request.url);
    if (url.hostname !== 'example.org' || !url.pathname.startsWith('/demo/'))
      return fallback(request);
    const row = db
      .prepare("SELECT id,data FROM sources WHERE json_extract(data,'$.url')=?")
      .get(request.url) as { id: string; data: string } | undefined;
    const source = row ? (JSON.parse(row.data) as Source) : undefined;
    const snapshot = row ? latestSnapshot(db, row.id) : undefined;
    const doc = snapshot ? (JSON.parse(snapshot.document) as CanonicalDocument) : undefined;
    const count = setting(db, `demoChecks:${request.url}`, 0) + 1;
    setSetting(db, `demoChecks:${request.url}`, count);
    const items = doc?.items.map((item, index) => ({
      ...item,
      content:
        index === 0
          ? item.content.replace(/\nÖrnek kontrol #\d+.*$/, '') +
            `\nÖrnek kontrol #${count}: demo içeriği güncellendi.`
          : item.content,
    })) || [
      {
        identity: 'guid:demo-new',
        title: 'Örnek araştırma duyurusu',
        content: 'Bu içerik yalnız demo akışını göstermek için üretilmiştir.',
        url: new URL('/demo/opportunity', url).href,
      },
    ];
    return {
      status: 200,
      body: source?.kind === 'html' ? html(items) : xml(items),
      url: request.url,
      contentType: source?.kind === 'html' ? 'text/html' : 'application/rss+xml',
      etag: `"demo-${count}"`,
      lastModified: now().toUTCString(),
    };
  };
}
export function seedDemo(
  db: DB,
  observations: ReturnType<typeof observationService>,
  now: () => Date,
) {
  if (setting(db, 'demoSeeded', false) || db.prepare('SELECT 1 FROM sources LIMIT 1').get()) return;
  const current = now();
  const addDays = (days: number) => new Date(current.getTime() + days * 86400_000);
  const day = (days: number) => addDays(days).toISOString().slice(0, 10);
  const definitions: {
    name: string;
    category: Category;
    kind: 'rss' | 'html';
    keywords: string[];
  }[] = [
    { name: 'Ufuk Vakfı', category: 'burs', kind: 'rss', keywords: ['burs', 'araştırma'] },
    {
      name: 'Pusula Üniversitesi',
      category: 'akademik',
      kind: 'rss',
      keywords: ['Erasmus', 'lisansüstü'],
    },
    { name: 'Yeni Nesil Kariyer', category: 'kariyer', kind: 'rss', keywords: ['yetenek', 'staj'] },
    {
      name: 'Açık Teknoloji Ağı',
      category: 'etkinlik',
      kind: 'rss',
      keywords: ['açık kaynak', 'teknoloji'],
    },
    { name: 'Bilim Köprüsü', category: 'burs', kind: 'html', keywords: ['doktora', 'araştırma'] },
    { name: 'Kuzey Akademi', category: 'akademik', kind: 'rss', keywords: ['araştırmacı'] },
    { name: 'İlk Adım Programı', category: 'kariyer', kind: 'html', keywords: ['mentorluk'] },
    { name: 'Tasarım Buluşmaları', category: 'etkinlik', kind: 'rss', keywords: ['tasarım'] },
  ];
  const titles = [
    ['2026–2027 Lisansüstü Araştırma Bursu', 'Üniversite Öğrencileri Eğitim Desteği'],
    ['Erasmus+ Staj Hareketliliği', 'Lisansüstü Araştırma Asistanlığı'],
    ['Genç Yetenek Programı — Yaz Dönemi', 'Ürün Tasarımı Staj Programı'],
    ['Açık Kaynak ve Teknoloji Zirvesi', 'Dijital Gelecek Atölyeleri'],
    ['Doktora Araştırma Desteği'],
    ['Genç Araştırmacılar Çağrısı'],
    ['Kariyer Mentorluğu Programı'],
    ['Sürdürülebilir Tasarım Buluşması'],
  ];
  const details = [
    [
      'Aylık 12.000 TL araştırma desteği, eğitim materyali ve mentorluk. Lisansüstü öğrencilerin başvuruları kabul ediliyor.',
      'Başarılı lisans öğrencileri için karşılıksız eğitim desteği. Başvuru belgeleri: öğrenci belgesi, transkript ve niyet mektubu.',
    ],
    [
      'Avrupa üniversitelerinde 2–6 ay Erasmus staj hareketliliği. Dil belgesi ve kabul mektubu gereklidir.',
      'Disiplinler arası araştırma projelerinde görev almak isteyen lisansüstü öğrencilere açık çağrı.',
    ],
    [
      'Yeni mezunlar için 8 haftalık yetenek ve kariyer programı. Hibrit çalışma, birebir mentorluk ve proje deneyimi.',
      'Ürün tasarımı ekibinde ücretli staj. Tasarım portfolyosu ile başvurabilirsiniz.',
    ],
    [
      'Açık kaynak geliştiricileri, öğrenciler ve teknoloji meraklıları bir araya geliyor. Öğrenci katılımı ücretsiz.',
      'Yapay zekâ, erişilebilirlik ve yaratıcı kodlama üzerine uygulamalı teknoloji atölyeleri.',
    ],
    [
      'Doktora öğrencileri için altı aylık araştırma bursu. Alan çalışması ve yayın desteği kapsamdadır.',
    ],
    ['Genç araştırmacılar için ortak proje ve danışmanlık desteği. Başvuru yönergesi güncellendi.'],
    ['İlk işine hazırlanan gençler için üç aylık kariyer mentorluk eşleştirmesi.'],
    ['Sürdürülebilirlik ve tasarım alanındaki yeni yaklaşımlar üzerine açık bir buluşma.'],
  ];
  let globalIndex = 0;
  db.transaction(() => {
    for (let s = 0; s < definitions.length; s++) {
      const def = definitions[s];
      let source = saveSource(
        db,
        {
          ...def,
          url: `https://example.org/demo/source-${s + 1}`,
          selector: def.kind === 'html' ? '#announcements' : undefined,
          intervalMinutes: 360,
        },
        addDays(-7),
      );
      const make = (before: boolean) =>
        titles[s].map((title, i) => {
          const index = globalIndex + i;
          const offset = [3, 12, 7, 10, 4, 15, 8, 20, 6, 14, 9, 18][index];
          const deadline = dateText(addDays(before ? offset - 2 : offset));
          const content = `${details[s][i]}\nSon başvuru: ${deadline}.\n${before ? 'Önceki duyuru metni.' : 'Başvuru koşulları ve belgeler güncellendi.'}\nDemo örneğidir; gerçek bir kurum duyurusu veya canlı gözlem değildir.`;
          return {
            identity: `${def.kind === 'rss' ? 'guid:' : 'html:'}demo-${s}-${i}`,
            title,
            content,
            url: `https://example.org/demo/opportunity-${s}-${i}`,
          };
        });
      const beforeItems = s === 2 || s === 3 ? make(true).slice(0, -1) : make(true),
        afterItems = make(false);
      const body = (items: typeof beforeItems) => (def.kind === 'html' ? html(items) : xml(items));
      const first = canonicalize({
        body: body(beforeItems),
        url: source.url,
        kind: source.kind,
        selector: source.selector,
      });
      const meta: FetchResult = {
        status: 200,
        body: body(beforeItems),
        url: source.url,
        contentType: def.kind === 'html' ? 'text/html' : 'application/rss+xml',
        etag: null,
        lastModified: null,
      };
      observations.persist(source, first, meta, true, addDays(-6));
      source = JSON.parse(
        (db.prepare('SELECT data FROM sources WHERE id=?').get(source.id) as { data: string }).data,
      );
      const after = canonicalize({
        body: body(afterItems),
        url: source.url,
        kind: source.kind,
        selector: source.selector,
      });
      observations.persist(
        source,
        after,
        { ...meta, body: body(afterItems) },
        false,
        new Date(current.getTime() - (s === 0 ? 35 * 60_000 : s * 95 * 60_000)),
      );
      const rows = db
        .prepare('SELECT id,data FROM items WHERE source_id=? ORDER BY rowid')
        .all(source.id) as { id: string; data: string }[];
      for (let i = 0; i < rows.length; i++) {
        const index = globalIndex + i;
        const item = JSON.parse(rows[i].data);
        if (index === 0 || index === 4 || index === 2) {
          decide(db, item.id, { action: 'save' }, current);
          confirmDeadline(
            db,
            item.id,
            {
              candidateId: item.deadlineCandidates[0]?.id,
              dateOnly: day([3, 12, 7, 10, 4][index]),
              timezone: 'Europe/Istanbul',
              userSuppliedFields: [],
              expectedVersion: 0,
            },
            current,
          );
        } else if (index === 3) decide(db, item.id, { action: 'review' }, current);
        else if (index === 10)
          decide(db, item.id, { action: 'irrelevant', reason: 'Alanımla ilgili değil' }, current);
        else if (index === 11) decide(db, item.id, { action: 'archive' }, current);
      }
      for (let d = 0; d < 7; d++) {
        const at = addDays(-d);
        const obs: Observation = {
          id: randomUUID(),
          sourceId: source.id,
          startedAt: at.toISOString(),
          finishedAt: at.toISOString(),
          status: d % 3 === 0 ? 'unchanged' : 'success',
          message: 'Demo için oluşturulmuş örnek gözlem kaydı.',
          changeCount: d % 3 === 0 ? 0 : (s + d) % 3,
        };
        db.prepare('INSERT INTO observations VALUES (?,?,?,?)').run(
          obs.id,
          source.id,
          obs.startedAt,
          JSON.stringify(obs),
        );
      }
      const stored = JSON.parse(
        (db.prepare('SELECT data FROM sources WHERE id=?').get(source.id) as { data: string }).data,
      ) as Source;
      if (s === 6)
        putJson(db, 'sources', source.id, {
          ...stored,
          enabled: false,
          status: 'paused',
          nextCheckAt: null,
        });
      if (s === 7)
        putJson(db, 'sources', source.id, {
          ...stored,
          status: 'blocked',
          lastError: 'Örnek erişim kısıtı: kaynak geçici olarak izin vermiyor.',
        });
      globalIndex += titles[s].length;
    }
    setSetting(db, 'demoSeeded', true);
    setSetting(db, 'onboardingComplete', true);
    setSetting(db, 'observationGap', null);
    const notificationRows = db
      .prepare('SELECT id,data FROM notifications ORDER BY rowid')
      .all() as { id: string; data: string }[];
    for (let i = 0; i < notificationRows.length - 5; i++)
      putJson(db, 'notifications', notificationRows[i].id, {
        ...JSON.parse(notificationRows[i].data),
        read: true,
      });
    addNotification(
      db,
      'demo-info',
      null,
      'Örnek çalışma alanınız hazır',
      '8 örnek kaynak ve 12 duyuruyla akışı deneyin. Bu alan canlı kaynakları izlemiyor.',
      current,
    );
  })();
}

import { createHash } from 'node:crypto';
import { load } from 'cheerio';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
export const NORMALIZATION_VERSION = 1;
export type CanonicalInput = { body: string; url: string; kind: 'rss' | 'html'; selector?: string };
export type CanonicalItem = {
  identity: string;
  title: string;
  content: string;
  url: string;
  publishedAt: string | null;
  hash: string;
};
export type CanonicalDocument = {
  title: string;
  items: CanonicalItem[];
  normalizationVersion: number;
  hash: string;
};
export class ContentError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
export const contentHash = (value: string) => createHash('sha256').update(value).digest('hex');
const volatile =
  'script,style,noscript,iframe,object,embed,.cookie-banner,#cookie-banner,[data-volatile],.visitor-counter,.random-id';
export function plainText(html: string, baseUrl?: string): string {
  const $ = load(html);
  $(volatile).remove();
  $('br').replaceWith('\n');
  $('p,div,li,h1,h2,h3,h4,section,article,tr').each((_i, node) => {
    $(node).prepend('\n').append('\n');
  });
  $('a[href]').each((_i, node) => {
    const href = $(node).attr('href') || '';
    try {
      const url = new URL(href, baseUrl);
      if (['http:', 'https:'].includes(url.protocol) && !url.username && !url.password)
        $(node).append(` (${url.href})`);
    } catch {
      /* Unsafe or non-web links are text only. */
    }
  });
  return $.root()
    .text()
    .normalize('NFC')
    .split(/\r?\n/)
    .map((line) => line.replace(/[\t\u00a0 ]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n')
    .trim();
}
function link(value: string, base: string) {
  try {
    const url = new URL(value, base);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return base;
    url.hash = '';
    for (const key of [...url.searchParams.keys()])
      if (/^utm_|^(fbclid|gclid)$/.test(key)) url.searchParams.delete(key);
    return url.href;
  } catch {
    return base;
  }
}
const asArray = <T>(value: T | T[] | undefined): T[] =>
  value === undefined ? [] : Array.isArray(value) ? value : [value];
const scalar = (value: unknown): string =>
  typeof value === 'string'
    ? value
    : typeof value === 'number'
      ? String(value)
      : value && typeof value === 'object'
        ? scalar((value as Record<string, unknown>)['#text'])
        : '';
function makeItem(
  identity: string,
  title: string,
  content: string,
  url: string,
  date: string,
): CanonicalItem {
  const explicitInstant =
    /(?:^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})$)|(?:\b\d{4}\s+\d{2}:\d{2}(?::\d{2})?\s+(?:GMT|UTC|[+-]\d{4})$)/i.test(
      date,
    );
  const publishedAt =
    explicitInstant && !Number.isNaN(Date.parse(date)) ? new Date(date).toISOString() : null;
  return {
    identity,
    title: title || 'Başlıksız duyuru',
    content,
    url,
    publishedAt,
    hash: contentHash(JSON.stringify({ title, content, url, publishedAt })),
  };
}
export function canonicalize(input: CanonicalInput): CanonicalDocument {
  const body = input.body;
  if (!body.trim())
    throw new ContentError(
      'EMPTY_CONTENT',
      'Kaynak boş bir yanıt verdi; son geçerli görüntü korundu.',
    );
  if (
    /captcha|verify you are human|cf-chl-|g-recaptcha|insan olduğunuzu doğrulayın/i.test(body) ||
    /<input[^>]+type\s*=\s*["']?password/i.test(body)
  )
    throw new ContentError('ACCESS_RESTRICTED', 'Kaynak CAPTCHA veya giriş gerektiriyor.');
  if (/<!ENTITY|<!DOCTYPE\s+(?!html(?:\s|>))/i.test(body))
    throw new ContentError('XML_ENTITY_REJECTED', 'XML dış varlıkları desteklenmez.');
  let items: CanonicalItem[];
  let title: string;
  if (input.kind === 'rss') {
    if (XMLValidator.validate(body) !== true)
      throw new ContentError(
        'XML_INVALID',
        'Besleme geçerli XML değil. Bir web sayfası ekliyorsanız kaynak türünü “Statik web sayfası” seçip izlenecek bölgeyi belirtin.',
      );
    const parsed = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      processEntities: false,
      parseTagValue: false,
      trimValues: false,
    }).parse(body) as Record<string, any>;
    const channel = parsed.rss?.channel;
    const feed = parsed.feed;
    if (!channel && !feed)
      throw new ContentError(
        'FEED_INVALID',
        'RSS/Atom beslemesi bulunamadı; statik HTML için içerik bölgesi seçin.',
      );
    title = plainText(scalar((channel || feed).title));
    const entries = asArray<Record<string, any>>(channel?.item || feed?.entry);
    items = entries.slice(0, 1000).map((entry) => {
      const links = asArray<Record<string, any> | string>(entry.link);
      const chosen =
        links.find((l) => typeof l === 'object' && (!l['@_rel'] || l['@_rel'] === 'alternate')) ||
        links[0];
      const rawLink =
        typeof chosen === 'object' ? String(chosen['@_href'] || scalar(chosen)) : scalar(chosen);
      const url = link(rawLink || input.url, input.url);
      const title = plainText(scalar(entry.title));
      const content = plainText(
        scalar(entry['content:encoded'] || entry.content || entry.description || entry.summary),
        input.url,
      );
      const guid = scalar(entry.guid || entry.id).trim();
      const identity = guid
        ? `guid:${guid.slice(0, 2048)}`
        : rawLink
          ? `url:${url}`
          : `hash:${contentHash(title + '\n' + content)}`;
      return makeItem(
        identity,
        title,
        content,
        url,
        scalar(entry.pubDate || entry.published || entry.updated),
      );
    });
    // A valid, explicitly empty feed can show removals. Malformed / HTML responses never do.
  } else {
    if (!input.selector)
      throw new ContentError('SELECTOR_REQUIRED', 'Statik HTML için bir içerik bölgesi seçin.');
    const $ = load(body);
    $(volatile).remove();
    let region;
    try {
      region = $(input.selector);
    } catch {
      throw new ContentError('SELECTOR_INVALID', 'İçerik seçicisi geçersiz.');
    }
    if (!region.length || !region.text().trim())
      throw new ContentError(
        'SELECTOR_EMPTY',
        'Seçilen bölge bulunamadı veya boş; önceki görüntü korundu.',
      );
    title =
      $('title').text().trim() || region.find('h1').first().text().trim() || 'Statik duyurular';
    let elements: typeof region = region
      .find('article,li,[data-item]')
      .filter(
        (_i, node) => !$(node).parentsUntil(input.selector).filter('article,li,[data-item]').length,
      );
    if (!elements.length) elements = region;
    items = elements
      .slice(0, 1000)
      .toArray()
      .map((node) => {
        const el = $(node);
        const a = el.find('a[href]').first();
        const rawLink = a.attr('href');
        const url = link(rawLink || input.url, input.url);
        const itemTitle =
          el.find('h1,h2,h3,h4').first().text().trim() ||
          a.text().trim() ||
          el.text().trim().slice(0, 100);
        const content = plainText($.html(node), input.url);
        const stableKey = el.attr('data-id') || el.attr('id');
        const identity = stableKey
          ? `html:${stableKey}`
          : rawLink
            ? `url:${url}`
            : `hash:${contentHash(itemTitle + '\n' + content)}`;
        return makeItem(identity, itemTitle, content, url, '');
      });
  }
  const unique = new Map<string, CanonicalItem>();
  for (const item of items) if (!unique.has(item.identity)) unique.set(item.identity, item);
  items = [...unique.values()].sort((a, b) => a.identity.localeCompare(b.identity));
  return {
    title,
    items,
    normalizationVersion: NORMALIZATION_VERSION,
    hash: contentHash(JSON.stringify(items)),
  };
}

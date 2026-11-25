import { describe, expect, it } from 'vitest';
import { canonicalize } from '../../packages/shared/src/canonicalize';
import { compareSnapshots } from '../../packages/shared/src/diff';
const rss = (text: string) =>
  `<rss version="2.0"><channel><title>Örnek burslar</title><item><guid>stable-1</guid><link>https://example.org/burs</link><title>Araştırma Bursu</title><description><![CDATA[${text}]]></description></item></channel></rss>`;
const input = (body: string) => ({ body, url: 'https://example.org/feed', kind: 'rss' as const });
describe('meaningful canonical content', () => {
  it('preserves date and link changes with stable item identity', () => {
    const a = canonicalize(input(rss('<p>Son başvuru 24 Ekim 2026</p>')));
    const b = canonicalize(input(rss('<p>Son başvuru 30 Ekim 2026</p>')));
    expect(a.items[0].identity).toBe(b.items[0].identity);
    expect(a.items[0].content).toContain('24 Ekim 2026');
    expect(compareSnapshots(a, b)[0].type).toBe('updated');
  });
  it('ignores explicitly volatile banners while preserving announcement links', () => {
    const make = (counter: string) =>
      canonicalize({
        kind: 'html',
        url: 'https://example.org/list',
        selector: '#announcements',
        body: `<div id="announcements"><div class="cookie-banner">Çerez ${counter}</div><article><h2><a href="/a">Duyuru</a></h2><p>Başvuru 24 Ekim 2026.</p><span data-volatile>${counter}</span></article></div>`,
      });
    expect(compareSnapshots(make('1'), make('2'))).toEqual([]);
    expect(make('1').items[0].url).toBe('https://example.org/a');
  });
  it('rejects CAPTCHA, login, empty selectors and malformed XML', () => {
    for (const body of [
      '<html><h1>Verify you are human</h1></html>',
      '<html><form><input type="password"></form></html>',
      '<rss><channel>',
    ])
      expect(() => canonicalize(input(body))).toThrow();
    expect(() =>
      canonicalize({
        kind: 'html',
        selector: '#missing',
        url: 'https://example.org/',
        body: '<div>Duyuru</div>',
      }),
    ).toThrow();
  });
  it('never renders executable markup or unsafe links as content', () => {
    const doc = canonicalize(
      input(
        rss(
          '<script>alert(1)</script><p onclick="bad()">Başvuru koşulları</p><a href="javascript:alert(1)">indir</a>',
        ),
      ),
    );
    expect(doc.items[0].content).toBe('Başvuru koşulları\nindir');
    expect(doc.items[0].content).not.toContain('script');
  });
  it('requires a new baseline when normalization versions differ', () => {
    const a = canonicalize(input(rss('başvuru')));
    expect(() => compareSnapshots(a, { ...a, normalizationVersion: 2 })).toThrow();
  });
});
describe('source facts remain intact', () => {
  it('detects a changed relative application link while identity stays the same', () => {
    const make = (href: string) =>
      canonicalize({
        kind: 'html',
        url: 'https://example.org/list',
        selector: '#announcements',
        body: `<main id="announcements"><article id="a"><h2><a href="/announcement">Burs</a></h2><p>Son başvuru 24 Ekim 2026</p><a href="${href}">Başvur</a></article></main>`,
      });
    expect(compareSnapshots(make('/apply-v1'), make('/apply-v2'))).toHaveLength(1);
    expect(make('/apply-v2').items[0].content).toContain('https://example.org/apply-v2');
  });
  it('does not infer year, time or timezone in publication metadata', () => {
    const doc = canonicalize(
      input(rss('Başvuru').replace('</item>', '<pubDate>October 24</pubDate></item>')),
    );
    expect(doc.items[0].publishedAt).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import { gzipSync } from 'node:zlib';
import { safeFetch, type Transport } from '../../apps/server/src/network/safe-fetch';
import { validateUrl, isPublicIp } from '../../apps/server/src/network/url-policy';
const publicDns = async () => [{ address: '93.184.216.34', family: 4 }];
const xml = '<rss><channel><item><guid>1</guid><title>Burs</title></item></channel></rss>';
const ok: Transport = async () => ({
  status: 200,
  headers: { 'content-type': 'application/rss+xml' },
  body: Buffer.from(xml),
});
describe('default-deny network boundary', () => {
  it.each([
    'http://127.0.0.1/',
    'http://2130706433/',
    'http://0x7f000001/',
    'http://[::1]/',
    'http://[::ffff:127.0.0.1]/',
    'http://169.254.169.254/',
    'http://10.2.3.4/',
    'http://[fe80::1]/',
    'http://[fc00::1]/',
    'http://192.168.1.1/',
    'http://user:secret@example.org/',
    'ftp://example.org/',
    'https://example.org:444/',
  ])('rejects dangerous URL %s', (url) => {
    expect(() => validateUrl(url)).toThrow();
  });
  it.each([
    '0.0.0.0',
    '100.64.0.1',
    '192.0.2.1',
    '198.51.100.1',
    '203.0.113.1',
    '224.0.0.1',
    '255.255.255.255',
    '2001:db8::1',
    'ff02::1',
  ])('rejects non-public IP %s', (ip) => expect(isPublicIp(ip)).toBe(false));
  it('rejects a mixed public/private DNS answer before connecting', async () => {
    let connections = 0;
    await expect(
      safeFetch(
        { url: 'https://example.org/' },
        {
          resolve: async () => [
            { address: '93.184.216.34', family: 4 },
            { address: '10.0.0.1', family: 4 },
          ],
          transport: async (...args) => {
            connections++;
            return ok(...args);
          },
        },
      ),
    ).rejects.toMatchObject({ code: 'DNS_REJECTED' });
    expect(connections).toBe(0);
  });
  it('pins verified DNS address and preserves the original TLS hostname', async () => {
    let resolutions = 0;
    let target: any;
    await safeFetch(
      { url: 'https://example.org/' },
      {
        resolve: async () => {
          resolutions++;
          return [{ address: resolutions === 1 ? '93.184.216.34' : '127.0.0.1', family: 4 }];
        },
        transport: async (req) => {
          target = req;
          return ok(req);
        },
      },
    );
    expect(resolutions).toBe(1);
    expect(target.address).toBe('93.184.216.34');
    expect(target.url.hostname).toBe('example.org');
  });
  it('rejects public-to-private redirects without a second connection', async () => {
    let connections = 0;
    await expect(
      safeFetch(
        { url: 'https://example.org/' },
        {
          resolve: publicDns,
          transport: async () => {
            connections++;
            return {
              status: 302,
              headers: { location: 'http://169.254.169.254/latest' },
              body: Buffer.alloc(0),
            };
          },
        },
      ),
    ).rejects.toMatchObject({ code: 'IP_REJECTED' });
    expect(connections).toBe(1);
  });
  it('rejects oversized decompressed bodies', async () => {
    await expect(
      safeFetch(
        { url: 'https://example.org/' },
        {
          resolve: publicDns,
          maxExpandedBytes: 1000,
          transport: async () => ({
            status: 200,
            headers: { 'content-type': 'application/rss+xml', 'content-encoding': 'gzip' },
            body: gzipSync(Buffer.from('x'.repeat(2000))),
          }),
        },
      ),
    ).rejects.toMatchObject({ code: 'BODY_TOO_LARGE' });
  });
  it('separates 304 and server Retry-After from content', async () => {
    const result = await safeFetch(
      { url: 'https://example.org/', etag: '"abc"' },
      {
        resolve: publicDns,
        transport: async (req) => {
          expect(req.headers['If-None-Match']).toBe('"abc"');
          return { status: 304, headers: { etag: '"abc"' }, body: Buffer.alloc(0) };
        },
      },
    );
    expect(result.status).toBe(304);
    expect(result.body).toBeNull();
    await expect(
      safeFetch(
        { url: 'https://example.org/' },
        {
          resolve: publicDns,
          transport: async () => ({
            status: 429,
            headers: { 'retry-after': '120' },
            body: Buffer.alloc(0),
          }),
        },
      ),
    ).rejects.toMatchObject({ code: 'RETRY_AFTER', retryAfterMs: 120000 });
  });
  it('rejects XML entities and decodes declared character encodings', async () => {
    await expect(
      safeFetch(
        { url: 'https://example.org/' },
        {
          resolve: publicDns,
          transport: async () => ({
            status: 200,
            headers: { 'content-type': 'text/xml' },
            body: Buffer.from('<!DOCTYPE rss [<!ENTITY x SYSTEM "file:///etc/passwd">]><rss/>'),
          }),
        },
      ),
    ).rejects.toMatchObject({ code: 'XML_ENTITY_REJECTED' });
    const result = await safeFetch(
      { url: 'https://example.org/' },
      {
        resolve: publicDns,
        transport: async () => ({
          status: 200,
          headers: { 'content-type': 'text/xml; charset=iso-8859-9' },
          body: Buffer.from([0xd0, 0xfd, 0xfe]),
        }),
      },
    );
    expect(result.body).toBe('Ğış');
  });
});
describe('network resource bounds', () => {
  it('supports ordinary HTML doctypes and rejects compressed response overflow', async () => {
    const result = await safeFetch(
      { url: 'https://example.org/' },
      {
        resolve: publicDns,
        transport: async () => ({
          status: 200,
          headers: { 'content-type': 'text/html' },
          body: Buffer.from('<!doctype html><html><body>Public announcement</body></html>'),
        }),
      },
    );
    expect(result.body).toContain('Public announcement');
    await expect(
      safeFetch(
        { url: 'https://example.org/' },
        {
          resolve: publicDns,
          maxCompressedBytes: 10,
          transport: async () => ({
            status: 200,
            headers: { 'content-type': 'text/xml' },
            body: Buffer.from(xml),
          }),
        },
      ),
    ).rejects.toMatchObject({ code: 'BODY_TOO_LARGE' });
  });
  it('limits redirect chains even when all hosts are public', async () => {
    let count = 0;
    await expect(
      safeFetch(
        { url: 'https://example.org/' },
        {
          resolve: publicDns,
          transport: async () => {
            count++;
            return {
              status: 302,
              headers: { location: `https://example.org/${count}` },
              body: Buffer.alloc(0),
            };
          },
        },
      ),
    ).rejects.toMatchObject({ code: 'REDIRECT_LIMIT' });
    expect(count).toBe(6);
  });
});
describe('fetch time is independent of host queue delay', () => {
  it('keeps the full network timeout after waiting for a host request slot', async () => {
    const { vi } = await import('vitest');
    let clock = 0;
    const mock = vi.spyOn(Date, 'now').mockImplementation(() => clock);
    try {
      let timeout = 0;
      await safeFetch(
        { url: 'https://example.org/' },
        {
          resolve: publicDns,
          beforeRequest: async () => {
            clock += 40_000;
          },
          transport: async (request) => {
            timeout = request.timeoutMs;
            return ok(request);
          },
        },
      );
      expect(timeout).toBeGreaterThanOrEqual(29000);
    } finally {
      mock.mockRestore();
    }
  });
});

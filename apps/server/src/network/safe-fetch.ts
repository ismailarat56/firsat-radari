import http from 'node:http';
import https from 'node:https';
import { brotliDecompressSync, gunzipSync, inflateSync } from 'node:zlib';
import iconv from 'iconv-lite';
import { AppError } from '../errors';
import { resolvePublic, validateUrl, type Resolver } from './url-policy';
export type FetchRequest = { url: string; etag?: string | null; lastModified?: string | null };
export type FetchResult = {
  status: 200 | 304;
  body: string | null;
  url: string;
  contentType: string;
  etag: string | null;
  lastModified: string | null;
};
export type TransportRequest = {
  url: URL;
  address: string;
  family: number;
  headers: Record<string, string>;
  timeoutMs: number;
  maxCompressedBytes: number;
  connectTimeoutMs: number;
};
export type TransportResponse = { status: number; headers: Record<string, string>; body: Buffer };
export type Transport = (request: TransportRequest) => Promise<TransportResponse>;
export type Fetcher = (request: FetchRequest) => Promise<FetchResult>;
export type FetchOptions = {
  resolve?: Resolver;
  transport?: Transport;
  maxCompressedBytes?: number;
  maxExpandedBytes?: number;
  totalTimeoutMs?: number;
  beforeRequest?: (url: URL) => Promise<void>;
  afterResponse?: (url: URL, result: TransportResponse) => void;
};
export class FetchError extends AppError {
  constructor(
    code: string,
    message: string,
    readonly retryAfterMs = 0,
  ) {
    super(code, message, 422);
  }
}
export const nodeTransport: Transport = ({
  url,
  address,
  family,
  headers,
  timeoutMs,
  maxCompressedBytes,
  connectTimeoutMs,
}) =>
  new Promise((resolve, reject) => {
    const client = url.protocol === 'https:' ? https : http;
    const request = client.request(
      url,
      {
        method: 'GET',
        headers,
        agent: false,
        servername: url.hostname.replace(/^\[|\]$/g, ''),
        lookup: (_hostname, options, callback) => {
          if (options.all) callback(null, [{ address, family }]);
          else callback(null, address, family);
        },
      },
      (response) => {
        const chunks: Buffer[] = [];
        let size = 0;
        response.on('data', (chunk: Buffer) => {
          size += chunk.length;
          if (size > maxCompressedBytes) {
            request.destroy(
              new FetchError('BODY_TOO_LARGE', 'Sıkıştırılmış yanıt 5 MiB sınırını aşıyor.'),
            );
            return;
          }
          chunks.push(chunk);
        });
        response.on('end', () => {
          const normalized: Record<string, string> = {};
          for (const [key, value] of Object.entries(response.headers))
            if (value) normalized[key] = Array.isArray(value) ? value.join(',') : value;
          resolve({
            status: response.statusCode || 0,
            headers: normalized,
            body: Buffer.concat(chunks),
          });
        });
        response.on('error', reject);
      },
    );
    const total = setTimeout(
      () => request.destroy(new FetchError('TIMEOUT', 'Kaynağın yanıt süresi aşıldı.')),
      Math.max(1, timeoutMs),
    );
    const connect = setTimeout(
      () => request.destroy(new FetchError('CONNECT_TIMEOUT', 'Kaynağa bağlantı süresi aşıldı.')),
      connectTimeoutMs,
    );
    request.on('socket', (socket) => {
      socket.once(url.protocol === 'https:' ? 'secureConnect' : 'connect', () =>
        clearTimeout(connect),
      );
    });
    request.on('error', (error) =>
      reject(
        error instanceof AppError
          ? error
          : new FetchError('NETWORK_ERROR', 'Kaynağa erişilemiyor.'),
      ),
    );
    request.on('close', () => {
      clearTimeout(total);
      clearTimeout(connect);
    });
    request.end();
  });
export async function safeFetch(
  request: FetchRequest,
  options: FetchOptions = {},
): Promise<FetchResult> {
  let url = validateUrl(request.url);
  let elapsed = 0;
  const total = options.totalTimeoutMs ?? 30_000;
  const maxCompressedBytes = options.maxCompressedBytes ?? 5 * 1024 * 1024;
  const maxExpandedBytes = options.maxExpandedBytes ?? 10 * 1024 * 1024;
  for (let redirects = 0; redirects <= 5; redirects++) {
    const remaining = () => Math.max(1, total - elapsed);
    if (elapsed >= total) throw new FetchError('TIMEOUT', 'Kaynağın toplam yanıt süresi aşıldı.');
    const dnsStarted = Date.now();
    let dnsTimer: ReturnType<typeof setTimeout> | undefined;
    let addresses;
    try {
      addresses = await Promise.race([
        resolvePublic(url, options.resolve),
        new Promise<never>((_resolve, reject) => {
          dnsTimer = setTimeout(
            () => reject(new FetchError('DNS_TIMEOUT', 'DNS çözümlemesi zaman aşımına uğradı.')),
            remaining(),
          );
        }),
      ]);
    } finally {
      clearTimeout(dnsTimer);
      elapsed += Date.now() - dnsStarted;
    }
    if (options.beforeRequest) await options.beforeRequest(url);
    const headers: Record<string, string> = {
      'User-Agent': 'FirsatRadari/1.0 (+local opportunity monitor)',
      Accept:
        'application/rss+xml, application/atom+xml, text/xml, application/xml, text/html, text/plain;q=0.5',
      'Accept-Encoding': 'gzip, deflate, br',
      Host: url.host,
    };
    if (redirects === 0 && request.etag) headers['If-None-Match'] = request.etag;
    if (redirects === 0 && request.lastModified)
      headers['If-Modified-Since'] = request.lastModified;
    const networkStarted = Date.now();
    const result = await (options.transport || nodeTransport)({
      url,
      address: addresses[0].address,
      family: addresses[0].family,
      headers,
      timeoutMs: remaining(),
      connectTimeoutMs: Math.min(5000, remaining()),
      maxCompressedBytes,
    });
    elapsed += Date.now() - networkStarted;
    options.afterResponse?.(url, result);
    if (result.body.length > maxCompressedBytes)
      throw new FetchError('BODY_TOO_LARGE', 'Sıkıştırılmış yanıt sınırı aşıldı.');
    if ([301, 302, 303, 307, 308].includes(result.status)) {
      if (!result.headers.location)
        throw new FetchError('REDIRECT_INVALID', 'Yönlendirme adresi eksik.');
      if (redirects === 5)
        throw new FetchError('REDIRECT_LIMIT', 'En fazla beş yönlendirmeye izin verilir.');
      url = validateUrl(new URL(result.headers.location, url).href);
      continue;
    }
    const meta = {
      url: url.href,
      etag: result.headers.etag || null,
      lastModified: result.headers['last-modified'] || null,
      contentType: result.headers['content-type'] || '',
    };
    if (result.status === 304) return { status: 304, body: null, ...meta };
    if (result.status === 429 || result.status === 503) {
      const value = result.headers['retry-after'];
      const delay = value
        ? /^\d+$/.test(value)
          ? Number(value) * 1000
          : Math.max(0, Date.parse(value) - Date.now())
        : 0;
      throw new FetchError(
        'RETRY_AFTER',
        'Kaynak daha sonra yeniden denenmesini istiyor.',
        Number.isFinite(delay) ? delay : 0,
      );
    }
    if ([401, 402, 403, 407, 451].includes(result.status))
      throw new FetchError(
        'ACCESS_RESTRICTED',
        'Kaynak erişimi kısıtlıyor; giriş veya erişim engeli aşılmaz.',
      );
    if (result.status !== 200)
      throw Object.assign(
        new FetchError('HTTP_ERROR', `Kaynak HTTP ${result.status} yanıtı verdi.`),
        { httpStatus: result.status },
      );
    if (
      !/^(text\/(html|xml|plain)|application\/(rss\+xml|atom\+xml|xml|xhtml\+xml))(;|$)/i.test(
        meta.contentType,
      )
    )
      throw new FetchError(
        'CONTENT_TYPE_UNSUPPORTED',
        'Yalnız RSS/Atom, XML ve statik HTML içerikleri desteklenir.',
      );
    let body = result.body;
    try {
      const limits = { maxOutputLength: maxExpandedBytes };
      switch (result.headers['content-encoding']?.trim().toLowerCase()) {
        case 'gzip':
          body = gunzipSync(body, limits);
          break;
        case 'deflate':
          body = inflateSync(body, limits);
          break;
        case 'br':
          body = brotliDecompressSync(body, limits);
          break;
        case undefined:
        case 'identity':
        case '':
          break;
        default:
          throw new FetchError('ENCODING_UNSUPPORTED', 'Yanıt sıkıştırma türü desteklenmiyor.');
      }
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new FetchError(
        (error as { code?: string }).code === 'ERR_BUFFER_TOO_LARGE'
          ? 'BODY_TOO_LARGE'
          : 'CONTENT_INVALID',
        'Sıkıştırılmış yanıt geçersiz veya açılmış boyut sınırını aşıyor.',
      );
    }
    if (body.length > maxExpandedBytes)
      throw new FetchError('BODY_TOO_LARGE', 'Açılmış yanıt 10 MiB sınırını aşıyor.');
    const declared =
      meta.contentType.match(/charset\s*=\s*["']?([^;\s"']+)/i)?.[1] ||
      body
        .subarray(0, 200)
        .toString('ascii')
        .match(/<\?xml[^>]*encoding=["']([^"']+)/i)?.[1] ||
      'utf-8';
    if (!iconv.encodingExists(declared))
      throw new FetchError('CHARSET_UNSUPPORTED', 'Kaynağın karakter kodlaması desteklenmiyor.');
    const text = iconv.decode(body, declared);
    if (/<!ENTITY|<!DOCTYPE\s+(?!html(?:\s|>))/i.test(text))
      throw new FetchError(
        'XML_ENTITY_REJECTED',
        'XML dış varlıkları ve belge türü tanımları kabul edilmez.',
      );
    return { status: 200, body: text, ...meta };
  }
  throw new FetchError('REDIRECT_LIMIT', 'Yönlendirme sınırı aşıldı.');
}

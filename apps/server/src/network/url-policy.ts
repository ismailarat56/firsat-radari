import ipaddr from 'ipaddr.js';
import { lookup } from 'node:dns/promises';
import { AppError } from '../errors';
export function isPublicIp(address: string): boolean {
  try {
    const ip = ipaddr.parse(address.replace(/^\[|\]$/g, ''));
    if (ip.kind() === 'ipv6' && (ip as ipaddr.IPv6).isIPv4MappedAddress()) return false;
    return ip.range() === 'unicast';
  } catch {
    return false;
  }
}
export function validateUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new AppError('URL_REJECTED', 'Geçerli bir HTTP veya HTTPS adresi girin.');
  }
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    (url.port && url.port !== (url.protocol === 'https:' ? '443' : '80'))
  )
    throw new AppError(
      'URL_REJECTED',
      'Yalnız 80/443 portlarında, kimlik bilgisi içermeyen HTTP(S) adresleri desteklenir.',
    );
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host === 'metadata.google.internal' ||
    (ipaddr.isValid(host) && !isPublicIp(host))
  )
    throw new AppError('IP_REJECTED', 'Özel, yerel veya ayrılmış ağ adresine erişim engellendi.');
  url.hash = '';
  return url;
}
export type Resolver = (hostname: string) => Promise<{ address: string; family: number }[]>;
export const resolveAll: Resolver = async (hostname) =>
  lookup(hostname, { all: true, verbatim: true });
export async function resolvePublic(url: URL, resolver: Resolver = resolveAll) {
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const addresses = ipaddr.isValid(host)
    ? [{ address: host, family: ipaddr.parse(host).kind() === 'ipv6' ? 6 : 4 }]
    : await resolver(host);
  if (!addresses.length || addresses.some((a) => !isPublicIp(a.address)))
    throw new AppError('DNS_REJECTED', 'DNS yanıtı özel veya ayrılmış bir adres içeriyor.');
  return addresses;
}

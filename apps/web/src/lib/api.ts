import { QueryClient } from '@tanstack/react-query';
import type { ApiError, SessionInfo } from '@shared/contracts';

let csrfToken = '';
export class RequestError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15000,
      refetchOnWindowFocus: true,
      retry: (count, error) => !(error instanceof RequestError && error.status < 500) && count < 1,
    },
    mutations: { retry: false },
  },
});
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set('X-FR-Client', 'web');
  if (options.body) headers.set('Content-Type', 'application/json');
  if (options.method && options.method !== 'GET' && csrfToken)
    headers.set('X-CSRF-Token', csrfToken);
  let response: Response;
  try {
    response = await fetch(`/api${path}`, { ...options, headers, credentials: 'same-origin' });
  } catch {
    throw new RequestError(
      'OFFLINE',
      'Yerel sunucuya ulaşılamıyor. Uygulamanın çalıştığından emin olun.',
      0,
    );
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as ApiError | null;
    if (response.status === 401 && !['/session', '/pair', '/demo/session'].includes(path)) {
      csrfToken = '';
      void queryClient.invalidateQueries({ queryKey: ['session'] });
    }
    throw new RequestError(
      body?.error?.code ?? 'REQUEST_FAILED',
      body?.error?.message ?? 'İşlem tamamlanamadı. Lütfen yeniden deneyin.',
      response.status,
    );
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
export async function getSession(): Promise<SessionInfo> {
  let result = await api<SessionInfo>('/session');
  if (result.demo && !result.authenticated)
    result = await api<SessionInfo>('/demo/session', { method: 'POST' });
  if (result.csrfToken) csrfToken = result.csrfToken;
  return result;
}
export function setSessionToken(session: SessionInfo) {
  csrfToken = session.csrfToken ?? '';
}
export const post = <T>(path: string, data?: unknown, headers?: Record<string, string>) =>
  api<T>(path, {
    method: 'POST',
    body: data === undefined ? undefined : JSON.stringify(data),
    headers,
  });
export const patch = <T>(path: string, data: unknown) =>
  api<T>(path, { method: 'PATCH', body: JSON.stringify(data) });
export function refreshData() {
  return queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] !== 'session' });
}

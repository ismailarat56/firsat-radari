import { useCallback, useEffect, useState } from 'react';
export type View =
  'overview' | 'inbox' | 'saved' | 'calendar' | 'sources' | 'notifications' | 'settings';
const views: View[] = [
  'overview',
  'inbox',
  'saved',
  'calendar',
  'sources',
  'notifications',
  'settings',
];
export type ListFilters = {
  category: string;
  q: string;
  type: string;
  source: string;
  status: string;
  sort: string;
};
export const defaultFilters: ListFilters = {
  category: '',
  q: '',
  type: 'all',
  source: '',
  status: 'active',
  sort: 'newest',
};
function readLocation() {
  const params = new URLSearchParams(window.location.search);
  const view = params.get('view') as View;
  const value = (key: string, allowed: string[], fallback: string) => {
    const input = params.get(key) ?? '';
    return allowed.includes(input) ? input : fallback;
  };
  return {
    view: views.includes(view) ? view : ('overview' as View),
    category: value('category', ['burs', 'akademik', 'kariyer', 'etkinlik'], ''),
    q: params.get('q') ?? '',
    type: value('type', ['all', 'new', 'updated', 'removed', 'archived'], 'all'),
    source: params.get('source') ?? '',
    status: value(
      'status',
      ['active', 'all', 'unread', 'reviewed', 'saved', 'archived', 'irrelevant'],
      'active',
    ),
    sort: value('sort', ['newest', 'oldest', 'priority'], 'newest'),
    item: params.get('item') ?? '',
  };
}
export function useNavigation() {
  const [location, setLocation] = useState(readLocation);
  useEffect(() => {
    const update = () => setLocation(readLocation());
    window.addEventListener('popstate', update);
    return () => window.removeEventListener('popstate', update);
  }, []);
  const navigate = useCallback(
    (updates: Partial<ReturnType<typeof readLocation>>, replace = false) => {
      const current = readLocation();
      const next = { ...current, ...updates };
      const params = new URLSearchParams();
      if (next.view !== 'overview') params.set('view', next.view);
      for (const key of Object.keys(defaultFilters) as (keyof ListFilters)[]) {
        if (next[key] !== defaultFilters[key]) params.set(key, next[key]);
      }
      if (next.item) params.set('item', next.item);
      const query = params.toString();
      const returnTo = next.item
        ? current.item
          ? window.history.state?.readerReturn
          : window.location.pathname + window.location.search
        : undefined;
      window.history[replace ? 'replaceState' : 'pushState'](
        returnTo ? { readerReturn: returnTo } : {},
        '',
        `${window.location.pathname}${query ? `?${query}` : ''}`,
      );
      setLocation(next);
    },
    [],
  );
  const closeItem = useCallback(() => {
    if (window.history.state?.readerReturn) window.history.back();
    else navigate({ item: '' }, true);
  }, [navigate]);
  return { ...location, navigate, closeItem };
}

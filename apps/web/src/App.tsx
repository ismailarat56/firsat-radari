import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import type {
  Notification,
  Opportunity,
  SessionInfo,
  Settings as SettingsType,
  Source,
  Summary,
} from '@shared/contracts';
import { Layout, viewLabels } from './components/Layout';
import { Icon, RadarMark } from './components/Icon';
import { ErrorState, Loading, useToast } from './components/ui';
import { api, getSession, post, refreshData } from './lib/api';
import { defaultFilters, useNavigation, type ListFilters, type View } from './lib/navigation';
import { relativeTime } from './lib/format';
import { DateTimezone } from './lib/date-context';
import { Pairing, OnboardingBanner } from './features/onboarding/Pairing';
import { SourceForm, fetchSources } from './features/sources/SourceForm';
import { Sources } from './features/sources/Sources';
import { ScanQueue, useScanQueue } from './features/sources/ScanQueue';
import { ReaderPlaceholder, WorkspaceSummary } from './features/inbox/Dashboard';
import { OpportunityList } from './features/inbox/OpportunityList';
import { Calendar } from './features/decisions/Calendar';
import { DiffDetail } from './features/diffs/DiffDetail';
import { Notifications } from './features/inbox/Notifications';
import { Settings } from './features/settings/Settings';

export function App() {
  const session = useQuery({
    queryKey: ['session'],
    queryFn: getSession,
    retry: false,
    refetchOnWindowFocus: false,
  });
  if (session.isPending)
    return (
      <div className="app-loading">
        <RadarMark />
        <Loading />
      </div>
    );
  if (session.error)
    return (
      <div className="app-loading">
        <RadarMark />
        <h1>Radarınla bağlantı kurulamadı.</h1>
        <ErrorState error={session.error} onRetry={() => void session.refetch()} />
        <p>Yerel uygulamayı başlattıktan sonra yeniden dene.</p>
      </div>
    );
  if (!session.data.authenticated) return <Pairing />;
  return <Workspace session={session.data} />;
}
function Workspace({ session }: { session: SessionInfo }) {
  const navigation = useNavigation();
  const { view, category, q, source, item: selectedId, navigate, closeItem } = navigation;
  const [sourceDialog, setSourceDialog] = useState<{ open: boolean; source: Source | null }>({
    open: false,
    source: null,
  });
  const [expandedId, setExpandedId] = useState('');
  const listRef = useRef<HTMLDivElement>(null);
  const returnTarget = useRef<HTMLElement | null>(null);
  const lastSelected = useRef('');
  const listScroll = useRef(0);
  const toast = useToast();
  const sourcesQuery = useQuery({
    queryKey: ['sources'],
    queryFn: fetchSources,
    refetchInterval: 15000,
  });
  const itemsQuery = useQuery({
    queryKey: ['items'],
    queryFn: () => api<{ items: Opportunity[] }>('/items'),
    refetchInterval: 15000,
  });
  const summaryQuery = useQuery({
    queryKey: ['summary'],
    queryFn: () => api<Summary>('/summary'),
    refetchInterval: 15000,
  });
  const notificationsQuery = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api<{ notifications: Notification[] }>('/notifications'),
    refetchInterval: 15000,
  });
  const settingsQuery = useQuery({
    queryKey: ['settings'],
    queryFn: () => api<SettingsType>('/settings'),
  });
  const sources = sourcesQuery.data?.sources ?? [];
  const items = itemsQuery.data?.items ?? [];
  const summary = summaryQuery.data;
  const notifications = notificationsQuery.data?.notifications ?? [];
  const settings = settingsQuery.data;
  const save = useMutation({
    mutationFn: (item: Opportunity) =>
      post<Opportunity>(
        `/items/${item.id}/decisions`,
        { action: item.status === 'saved' ? 'review' : 'save' },
        { 'Idempotency-Key': crypto.randomUUID() },
      ),
    onSuccess: async (_, item) => {
      await refreshData();
      toast(
        item.status === 'saved'
          ? 'Fırsat kaydedilenlerden kaldırıldı.'
          : 'Fırsat, kaynak kanıtıyla kaydedildi.',
      );
    },
    onError: (error: Error) => toast(error.message, 'error'),
  });
  const queue = useScanQueue();
  const scanning =
    queue.request.isPending ||
    queue.rows.some((row) => ['running', 'queued'].includes(row.job.status));
  const go = (next: View) => navigate({ view: next, ...defaultFilters, item: '' });
  const addSource = () => setSourceDialog({ open: true, source: null });
  const filter = (update: Partial<ListFilters>) => navigate({ ...update, item: '' });
  const openItem = (item: Opportunity | string) => {
    returnTarget.current = document.activeElement as HTMLElement;
    listScroll.current = listRef.current?.scrollTop ?? 0;
    navigate({ item: typeof item === 'string' ? item : item.id }, !!selectedId);
  };
  useEffect(() => {
    const active = document.activeElement;
    const returningFromReader = active === document.body || active?.closest('.evidence-reader');
    if (!selectedId && lastSelected.current && returningFromReader) {
      const target = returnTarget.current;
      const fallback =
        listRef.current?.querySelector<HTMLButtonElement>('.opportunity-title') ??
        listRef.current
          ?.closest('.inbox-panel')
          ?.querySelector<HTMLButtonElement>('.filter-button');
      (target?.isConnected ? target : fallback)?.focus({ preventScroll: true });
      if (listRef.current) listRef.current.scrollTop = listScroll.current;
    }
    lastSelected.current = selectedId;
  }, [selectedId]);
  const listView = ['overview', 'inbox', 'saved'].includes(view);
  const expanded = !!selectedId && (!listView || expandedId === selectedId);
  const loading =
    sourcesQuery.isPending ||
    itemsQuery.isPending ||
    summaryQuery.isPending ||
    settingsQuery.isPending;
  const error = sourcesQuery.error || itemsQuery.error || summaryQuery.error || settingsQuery.error;
  const initialError =
    error && (!sourcesQuery.data || !itemsQuery.data || !summaryQuery.data || !settingsQuery.data);
  const subtitles: Record<View, string> = {
    overview: 'Kaynaklarını takip et. Değişikliği gör. Kanıtıyla karar ver.',
    inbox: 'Kaynaklarından gelen değişiklikler ve inceleme kararların.',
    saved: 'Kanıtıyla sakladığın, takip etmek istediğin fırsatlar.',
    calendar: 'Yalnızca senin onayladığın son tarihler.',
    sources: 'İzlenen kaynaklar, kontrol zamanları ve gözlem geçmişi.',
    notifications: 'Kaynak gelişmeleri ve onaylı tarih hatırlatmaları.',
    settings: 'Çalışma tercihleri, kanıt saklama ve yedekler.',
  };
  return (
    <DateTimezone value={settings?.timezone ?? 'Europe/Istanbul'}>
      <Layout
        view={view}
        onNavigate={go}
        summary={summary}
        unreadNotifications={notifications.filter((n) => !n.read).length}
        demo={session.demo}
        query={q}
        onSearch={(value) =>
          navigate({ q: value, view: view === 'saved' ? 'saved' : 'inbox', item: '' }, true)
        }
        sources={sources}
        sourceId={source}
        category={category}
        onSource={(id) => navigate({ view: 'inbox', ...defaultFilters, source: id, item: '' })}
        onCategory={(value) =>
          navigate({ view: 'inbox', ...defaultFilters, category: value, item: '' })
        }
        scanStatus={
          <>
            <Icon
              name={scanning ? 'LoaderCircle' : 'Clock3'}
              size={14}
              className={scanning ? 'spin' : ''}
            />
            <span>
              {scanning
                ? 'Kontrol sırada / sürüyor'
                : summary?.lastScanAt
                  ? `Son gözlem ${relativeTime(summary.lastScanAt).toLocaleLowerCase('tr')}`
                  : 'İlk gözlem bekleniyor'}
            </span>
          </>
        }
        actions={
          <>
            <button
              className="button secondary refresh-button"
              onClick={() =>
                queue.request.mutate(sources.filter((s) => s.enabled && !s.baselineRequired))
              }
              disabled={scanning || !sources.some((s) => s.enabled && !s.baselineRequired)}
              aria-label="Radarı yenile"
              title="Kaynakları kontrol et"
            >
              <Icon name="RefreshCw" size={16} className={scanning ? 'spin' : ''} />
              <span>Yenile</span>
            </button>
            <button className="button primary" onClick={addSource} disabled={sources.length >= 50}>
              <Icon name="Plus" size={17} />
              Kaynak ekle
            </button>
          </>
        }
      >
        <div className="page-heading">
          <div>
            <div className="page-eyebrow">
              <span className="eyebrow-line" />
              {listView ? 'KAYNAKTAN KARARA' : 'ÇALIŞMA ALANIM'}
            </div>
            <h1>{view === 'overview' ? 'Gelişmeler' : viewLabels[view]}</h1>
            <p>{subtitles[view]}</p>
          </div>
          {summary && listView && (
            <WorkspaceSummary summary={summary} items={items} onNavigate={go} />
          )}
        </div>
        <div className="workspace-alerts">
          <ScanQueue queue={queue} />
          {summary?.observationGap && (
            <div className="observation-gap">
              <Icon name="Clock3" size={17} />
              <div>
                <strong>Gözlem boşluğu</strong>
                <p>{summary.observationGap}</p>
              </div>
            </div>
          )}
          {error && !initialError && (
            <div className="stale-warning">
              <Icon name="WifiOff" size={16} />
              <span>Veriler yenilenemedi. Son alınan kayıtlar gösteriliyor.</span>
              <button className="text-button" onClick={() => void refreshData()}>
                Tekrar dene
              </button>
            </div>
          )}
        </div>
        {loading ? (
          <div className="workspace-skeleton" aria-label="Çalışma alanı yükleniyor" role="status">
            <div className="list-skeleton">
              {[1, 2, 3, 4, 5].map((i) => (
                <div className="skeleton-row" key={i}>
                  <div className="skeleton short" />
                  <div className="skeleton" />
                  <div className="skeleton medium" />
                </div>
              ))}
            </div>
            <div className="skeleton-reader">
              <div className="skeleton medium" />
              <div className="skeleton" />
              <div className="skeleton" />
            </div>
          </div>
        ) : initialError ? (
          <ErrorState error={error} onRetry={() => void refreshData()} />
        ) : (
          <>
            {view === 'overview' && !settings?.onboardingComplete && !session.demo && (
              <OnboardingBanner sources={sources} onAdd={addSource} />
            )}
            <div
              className={`review-desk ${selectedId ? 'reader-open' : ''} ${expanded ? 'reader-expanded' : ''} ${!listView ? 'companion-view' : ''}`}
            >
              <div className="desk-content">
                {listView && (
                  <OpportunityList
                    items={items}
                    sources={sources}
                    filters={navigation}
                    onFilter={filter}
                    onOpen={openItem}
                    onSave={(item) => save.mutate(item)}
                    busyId={save.isPending ? save.variables?.id : undefined}
                    saved={view === 'saved'}
                    selectedId={selectedId}
                    scrollRef={listRef}
                    onAdd={addSource}
                  />
                )}
                {view === 'calendar' && <Calendar items={items} onOpen={openItem} />}
                {view === 'sources' && (
                  <Sources
                    sources={sources}
                    onAdd={addSource}
                    onEdit={(source) => setSourceDialog({ open: true, source })}
                  />
                )}
                {view === 'notifications' &&
                  (notificationsQuery.error ? (
                    <ErrorState
                      error={notificationsQuery.error}
                      onRetry={() => void notificationsQuery.refetch()}
                    />
                  ) : notificationsQuery.isPending ? (
                    <Loading label="Bildirimler yükleniyor…" />
                  ) : (
                    <Notifications notifications={notifications} onOpen={openItem} />
                  ))}
                {view === 'settings' && settings && <Settings settings={settings} />}
              </div>
              {selectedId ? (
                <DiffDetail
                  key={selectedId}
                  itemId={selectedId}
                  onClose={closeItem}
                  timezone={settings?.timezone ?? 'Europe/Istanbul'}
                  expanded={expanded}
                  onExpand={listView ? () => setExpandedId(expanded ? '' : selectedId) : undefined}
                  source={sources.find(
                    (s) => s.id === items.find((i) => i.id === selectedId)?.sourceId,
                  )}
                />
              ) : listView ? (
                <ReaderPlaceholder />
              ) : null}
            </div>
          </>
        )}
        {sourceDialog.open && (
          <SourceForm
            key={sourceDialog.source?.id ?? 'new'}
            open
            onClose={() => setSourceDialog({ open: false, source: null })}
            source={sourceDialog.source}
            defaultInterval={settings?.defaultIntervalMinutes}
          />
        )}
      </Layout>
    </DateTimezone>
  );
}

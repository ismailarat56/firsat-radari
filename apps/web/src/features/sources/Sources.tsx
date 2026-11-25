import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import type { Observation, Source } from '@shared/contracts';
import { Icon } from '../../components/Icon';
import { Badge, EmptyState, ErrorState, Loading, Modal, useToast } from '../../components/ui';
import { api, patch, refreshData } from '../../lib/api';
import { categoryLabels, relativeTime, safeHref } from '../../lib/format';
import { useDateFormat } from '../../lib/date-context';
import { categoryIcons } from '../inbox/OpportunityList';
import { ScanQueue, useScanQueue } from './ScanQueue';

export function Sources({
  sources,
  onAdd,
  onEdit,
}: {
  sources: Source[];
  onAdd: () => void;
  onEdit: (source: Source) => void;
}) {
  const { formatDate } = useDateFormat();
  const timestamp = (date: string) =>
    formatDate(date, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const [filter, setFilter] = useState('all');
  const [history, setHistory] = useState<Source | null>(null);
  const toast = useToast();
  const toggle = useMutation({
    mutationFn: (source: Source) => patch(`/sources/${source.id}`, { enabled: !source.enabled }),
    onSuccess: async (_, source) => {
      await refreshData();
      toast(source.enabled ? 'Kaynak duraklatıldı.' : 'Kaynak takibi devam ediyor.');
    },
    onError: (e: Error) => toast(e.message, 'error'),
  });
  const queue = useScanQueue();
  const [removeSource, setRemoveSource] = useState<Source | null>(null);
  const remove = useMutation({
    mutationFn: (source: Source) => api(`/sources/${source.id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      await refreshData();
      toast('Kaynak takipten kaldırıldı. Kararların ve kanıtların korundu.');
      setRemoveSource(null);
    },
    onError: (error: Error) => toast(error.message, 'error'),
  });
  const filtered = sources.filter(
    (s) =>
      filter === 'all' ||
      (filter === 'active'
        ? s.enabled && s.status === 'active'
        : filter === 'attention'
          ? s.baselineRequired || ['error', 'blocked'].includes(s.status)
          : !s.enabled),
  );
  return (
    <>
      <ScanQueue queue={queue} />
      <div className="sources-summary">
        <div>
          <Icon name="Radio" size={20} />
          <span>
            <strong>{sources.length}</strong> / 50 kaynak
          </span>
        </div>
        <div className="sources-capacity">
          <span style={{ width: `${sources.length * 2}%` }} />
        </div>
        <span>{50 - sources.length} yeni kaynak için yerin var</span>
      </div>
      <section className="panel sources-panel">
        <div className="list-tabs" role="group" aria-label="Kaynak durumu">
          {[
            ['all', 'Tüm kaynaklar'],
            ['active', 'Aktif'],
            ['attention', 'İlgilenmen gerekenler'],
            ['paused', 'Duraklatılanlar'],
          ].map(([value, label]) => (
            <button
              key={value}

              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
            >
              {label}
            </button>
          ))}
        </div>
        {filtered.length ? (
          <div className="source-list">
            {filtered.map((source) => (
              <article className="source-row" key={source.id}>
                <span className={`source-icon category-${source.category}`}>
                  <Icon name={categoryIcons[source.category]} size={23} />
                </span>
                <div className="source-info">
                  <div className="source-title-row">
                    <h3>{source.name}</h3>
                    <Badge
                      tone={
                        !source.enabled
                          ? 'neutral'
                          : source.baselineRequired
                            ? 'amber'
                            : source.status === 'active'
                              ? 'green'
                              : 'red'
                      }
                      dot
                    >
                      {!source.enabled
                        ? 'Duraklatıldı'
                        : source.baselineRequired
                          ? 'Başlangıç bekliyor'
                          : source.status === 'active'
                            ? 'Takipte'
                            : source.status === 'blocked'
                              ? 'Erişim kısıtlı'
                              : 'Kontrol gerekiyor'}
                    </Badge>
                  </div>
                  <a href={safeHref(source.url)} target="_blank" rel="noopener noreferrer">
                    {source.url}
                    <Icon name="ExternalLink" size={11} />
                  </a>
                  <div className="source-meta">
                    <span>{categoryLabels[source.category]}</span>
                    <span>·</span>
                    <span>{source.kind.toUpperCase()}</span>
                    <span>·</span>
                    <span>
                      {source.intervalMinutes < 60
                        ? `${source.intervalMinutes} dakikada bir`
                        : `${source.intervalMinutes / 60} saatte bir`}
                    </span>
                    {source.keywords.length > 0 && (
                      <span className="source-keyword">
                        {source.keywords.slice(0, 2).join(', ')}
                      </span>
                    )}
                  </div>
                  {source.lastError && (
                    <p className="source-error">
                      <Icon name="AlertCircle" size={13} />
                      {source.lastError}
                    </p>
                  )}
                </div>
                <div className="source-check-info">
                  <span>Son başarılı kontrol</span>
                  <strong>
                    {source.lastSuccessAt
                      ? timestamp(source.lastSuccessAt)
                      : 'Henüz başarılı kontrol yok'}
                  </strong>
                  {source.lastError && (
                    <small>Son deneme: {relativeTime(source.lastCheckedAt)}</small>
                  )}
                  {source.nextCheckAt && source.enabled && (
                    <small>Sonraki: {timestamp(source.nextCheckAt)}</small>
                  )}
                </div>
                <div className="source-actions">
                  {source.baselineRequired ? (
                    <button className="button secondary small" onClick={() => onEdit(source)}>
                      Kurulumu tamamla
                    </button>
                  ) : (
                    <button
                      className="icon-button"
                      onClick={() => queue.request.mutate([source])}
                      disabled={
                        !source.enabled ||
                        (queue.request.isPending &&
                          queue.request.variables?.some((s) => s.id === source.id))
                      }
                      aria-label={`${source.name} kaynağını kontrol et`}
                    >
                      <Icon
                        name="RefreshCw"
                        className={
                          queue.request.isPending &&
                          queue.request.variables?.some((s) => s.id === source.id)
                            ? 'spin'
                            : ''
                        }
                        size={17}
                      />
                    </button>
                  )}
                  <button
                    className="icon-button"
                    onClick={() => setHistory(source)}
                    aria-label={`${source.name} gözlem geçmişi`}
                  >
                    <Icon name="Clock3" size={17} />
                  </button>
                  <button
                    className="icon-button"
                    onClick={() => onEdit(source)}
                    aria-label={`${source.name} kaynağını düzenle`}
                  >
                    <Icon name="Settings2" size={17} />
                  </button>
                  <button
                    className="icon-button"
                    onClick={() => toggle.mutate(source)}
                    disabled={toggle.isPending && toggle.variables?.id === source.id}
                    aria-label={
                      source.enabled
                        ? `${source.name} kaynağını duraklat`
                        : `${source.name} takibini sürdür`
                    }
                  >
                    <Icon name={source.enabled ? 'Pause' : 'Play'} size={17} />
                  </button>
                  <button
                    className="icon-button"
                    onClick={() => setRemoveSource(source)}
                    aria-label={`${source.name} kaynağını takipten kaldır`}
                  >
                    <Icon name="Archive" size={17} />
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState
            icon="Radio"
            title={sources.length ? 'Bu durumda bir kaynak yok' : 'İlk kaynağınla başlayalım'}
            description={
              sources.length
                ? 'Diğer kaynaklarını görmek için farklı bir filtre seçebilirsin.'
                : 'Takip ettiğin burs, kariyer veya etkinlik duyurularını radarına ekle.'
            }
            action={
              !sources.length ? (
                <button className="button primary" onClick={onAdd}>
                  <Icon name="Plus" />
                  İlk kaynağımı ekle
                </button>
              ) : undefined
            }
          />
        )}
      </section>
      <div className="info-strip">
        <Icon name="ShieldCheck" />
        <p>
          Aynı kuruma yapılan istekler arasında en az 10 saniye beklenir. Erişim kuralları ve
          sunucunun bekleme talebi önceliklidir. Bir bağlantı hatası, duyurunun silindiği anlamına
          gelmez.
        </p>
      </div>
      {removeSource && (
        <Modal
          open
          onOpenChange={(v) => {
            if (!v && !remove.isPending) setRemoveSource(null);
          }}
          title="Kaynağı takipten kaldır"
          description="Kaynak taranmayacak; geçmiş kararların ve kaynak kanıtların korunacak."
        >
          <div className="remove-source-content">
            <strong>{removeSource.name}</strong>
            <p>{removeSource.url}</p>
            <div className="info-strip">
              <Icon name="Archive" />
              <p>
                Bekleyen kontroller iptal edilir ve kaynak kotasında yer açılır. Yeniden takip etmek
                için kaynağı tekrar ekleyip başlangıç görüntüsünü onaylaman gerekir.
              </p>
            </div>
            <div className="dialog-actions">
              <button
                className="button secondary"
                onClick={() => setRemoveSource(null)}
                disabled={remove.isPending}
              >
                Vazgeç
              </button>
              <button
                className="button danger"
                onClick={() => remove.mutate(removeSource)}
                disabled={remove.isPending}
              >
                Takipten kaldır
              </button>
            </div>
          </div>
        </Modal>
      )}
      {history && <ObservationHistory source={history} onClose={() => setHistory(null)} />}
    </>
  );
}
function ObservationHistory({ source, onClose }: { source: Source; onClose: () => void }) {
  const { formatDate } = useDateFormat();
  const query = useQuery({
    queryKey: ['observations', source.id],
    queryFn: () => api<{ observations: Observation[] }>(`/sources/${source.id}/observations`),
    refetchInterval: 5000,
  });
  const labels: Record<Observation['status'], string> = {
    running: 'Kontrol ediliyor',
    success: 'Başarılı',
    unchanged: 'Değişiklik yok',
    unreachable: 'Ulaşılamadı',
    restricted: 'Erişim kısıtlandı',
    invalid: 'Geçersiz içerik',
  };
  return (
    <Modal
      open
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
      title="Gözlem geçmişi"
      description={source.name}
    >
      <div className="history-content">
        {query.isPending ? (
          <Loading />
        ) : query.error ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        ) : !query.data.observations.length ? (
          <EmptyState
            icon="Clock3"
            title="İlk gözlem bekleniyor"
            description="Kaynağını önizleyip başlangıç görüntüsünü onayla."
          />
        ) : (
          <div className="history-list">
            {query.data.observations.map((o) => (
              <article key={o.id}>
                <span
                  className={`history-dot ${['success', 'unchanged'].includes(o.status) ? 'success' : 'warning'}`}
                >
                  <Icon
                    name={
                      ['success', 'unchanged'].includes(o.status)
                        ? 'Check'
                        : o.status === 'running'
                          ? 'LoaderCircle'
                          : 'AlertCircle'
                    }
                    size={14}
                  />
                </span>
                <div>
                  <strong>{labels[o.status]}</strong>
                  <p>
                    {o.message ||
                      (o.changeCount
                        ? `${o.changeCount} anlamlı değişiklik bulundu.`
                        : 'Son geçerli görüntü korundu.')}
                  </p>
                  <time>
                    {formatDate(o.startedAt, {
                      day: 'numeric',
                      month: 'long',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </time>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}

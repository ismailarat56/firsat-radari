import { useMemo, useState, type RefObject } from 'react';
import { categories, type Category, type Opportunity, type Source } from '@shared/contracts';
import { Icon, type IconName } from '../../components/Icon';
import { Badge, EmptyState, Modal } from '../../components/ui';
import { categoryLabels, relativeTime } from '../../lib/format';
import { useDateFormat } from '../../lib/date-context';
import { defaultFilters, type ListFilters } from '../../lib/navigation';

export const categoryIcons: Record<Category, IconName> = {
  burs: 'GraduationCap',
  akademik: 'FileText',
  kariyer: 'BriefcaseBusiness',
  etkinlik: 'CalendarDays',
};
export const statusLabels: Record<Opportunity['status'], string> = {
  unread: 'Okunmadı',
  reviewed: 'İncelendi',
  saved: 'Kaydedildi',
  irrelevant: 'İlgisiz',
  archived: 'Arşivlendi',
};
export function ChangeBadge({ type }: { type: Opportunity['changeType'] }) {
  return (
    <Badge tone={type === 'new' ? 'green' : 'neutral'}>
      <Icon name={type === 'new' ? 'Plus' : type === 'updated' ? 'RefreshCw' : 'Eye'} size={12} />
      {type === 'new' ? 'Yeni fırsat' : type === 'updated' ? 'Güncelleme' : 'Artık görünmüyor'}
    </Badge>
  );
}
export function OpportunityCard({
  item,
  onOpen,
  onSave,
  busy,
  selected,
}: {
  item: Opportunity;
  onOpen: (item: Opportunity) => void;
  onSave: (item: Opportunity) => void;
  busy?: boolean;
  selected?: boolean;
}) {
  const { daysUntil, deadlineDate, formatDate } = useDateFormat();
  const confirmed = deadlineDate(item);
  const days = confirmed ? daysUntil(confirmed) : null;
  return (
    <article
      className={`opportunity-card ${item.status === 'unread' ? 'unread' : ''} ${selected ? 'is-selected' : ''}`}
    >
      <div className="opportunity-meta">
        <span className="source-name">
          <Icon name={categoryIcons[item.category]} size={14} />
          {item.sourceName}
        </span>
        <time
          dateTime={item.observedAt}
          title={formatDate(item.observedAt, {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })}
        >
          {relativeTime(item.observedAt)}
        </time>
      </div>
      <div className="opportunity-title-row">
        <button
          className="opportunity-title"
          data-item-id={item.id}
          aria-label={`Kanıtı aç: ${item.title}`}
          aria-current={selected ? 'true' : undefined}
          onClick={() => onOpen(item)}
        >
          {item.title}
        </button>
        <button
          className={`bookmark-button ${item.status === 'saved' ? 'is-saved' : ''}`}
          onClick={() => onSave(item)}
          disabled={busy}
          aria-label={
            item.status === 'saved'
              ? `${item.title} kaydını kaldır`
              : `${item.title} fırsatını kaydet`
          }
          aria-pressed={item.status === 'saved'}
        >
          <Icon
            name={busy ? 'LoaderCircle' : 'Bookmark'}
            size={17}
            className={busy ? 'spin' : ''}
          />
        </button>
      </div>
      <p className="opportunity-summary">
        {item.summary || item.content || 'Kaynak metni boş. Görüntü kanıtını inceleyebilirsin.'}
      </p>
      <div className="opportunity-bottom">
        <div className="opportunity-badges">
          <ChangeBadge type={item.changeType} />
          {item.status === 'unread' && (
            <span className="unread-label">
              <span className="unread-dot" />
              Okunmadı
            </span>
          )}
          {confirmed ? (
            <span
              className={`deadline-tag ${days !== null && days >= 0 && days <= 14 ? 'urgent' : ''}`}
              title="Senin tarafından onaylanan son tarih"
            >
              <Icon name="CalendarDays" size={12} />
              {formatDate(confirmed, { day: 'numeric', month: 'short' })} · Onaylı
              {days === 0
                ? ' · Bugün'
                : days !== null && days > 0 && days <= 14
                  ? ` · ${days} gün`
                  : ''}
            </span>
          ) : item.deadlineCandidates.length > 0 ? (
            <span className="pending-date-tag">
              <Icon name="CalendarDays" size={12} />
              Tarih adayı
            </span>
          ) : null}
          {item.confirmedDeadline?.reviewRequired && (
            <Badge tone="amber">
              <Icon name="AlertCircle" size={12} />
              Tarihi yeniden incele
            </Badge>
          )}
          {['reviewed', 'archived', 'irrelevant'].includes(item.status) && (
            <span className="row-status">{statusLabels[item.status]}</span>
          )}
        </div>
        <button
          className="evidence-link"
          onClick={() => onOpen(item)}
          aria-label={`${item.title} kanıtını incele`}
        >
          <span>İncele</span>
          <Icon name="ArrowRight" size={14} />
        </button>
      </div>
    </article>
  );
}

type ListProps = {
  items: Opportunity[];
  sources: Source[];
  filters: ListFilters;
  onFilter: (update: Partial<ListFilters>) => void;
  onOpen: (item: Opportunity) => void;
  onSave: (item: Opportunity) => void;
  busyId?: string;
  saved?: boolean;
  selectedId: string;
  scrollRef: RefObject<HTMLDivElement | null>;
  onAdd: () => void;
};
export function OpportunityList({
  items,
  sources,
  filters,
  onFilter,
  onOpen,
  onSave,
  busyId,
  saved,
  selectedId,
  scrollRef,
  onAdd,
}: ListProps) {
  const [showFilters, setShowFilters] = useState(false);
  const { category, type, source, status, sort, q } = filters;
  // /items returns the complete collection, without pagination. Filter and sort that full set.
  const filtered = useMemo(
    () =>
      items
        .filter(
          (item) =>
            (!saved || item.status === 'saved') &&
            (!category || item.category === category) &&
            (!source || item.sourceId === source) &&
            (type === 'archived'
              ? ['archived', 'irrelevant'].includes(item.status)
              : (type === 'all' || item.changeType === type) &&
                (status === 'all' ||
                  (status === 'active'
                    ? !['archived', 'irrelevant'].includes(item.status)
                    : item.status === status))) &&
            (!q ||
              `${item.title} ${item.content} ${item.sourceName}`
                .toLocaleLowerCase('tr')
                .includes(q.toLocaleLowerCase('tr'))),
        )
        .sort((a, b) => {
          const priority = { high: 0, normal: 1, low: 2 };
          return sort === 'priority'
            ? priority[a.priority] - priority[b.priority] ||
                b.observedAt.localeCompare(a.observedAt)
            : sort === 'oldest'
              ? a.observedAt.localeCompare(b.observedAt)
              : b.observedAt.localeCompare(a.observedAt);
        }),
    [items, category, type, source, status, sort, q, saved],
  );
  const allSources = [
    ...new Map([
      ...items.map((item) => [item.sourceId, item.sourceName] as const),
      ...sources.map((item) => [item.id, item.name] as const),
    ]).entries(),
  ];
  const activeCount =
    Number(!!category) + Number(!!source) + Number(status !== 'active') + Number(type !== 'all');
  const narrowed = !!(q || activeCount);
  return (
    <section className="inbox-panel" aria-label="Fırsat listesi">
      <div className="list-toolbar">
        <div className="list-tabs" role="group" aria-label="Fırsat türü">
          {[
            ['all', 'Tümü'],
            ['new', 'Yeni'],
            ['updated', 'Güncellenen'],
          ].map(([value, label]) => (
            <button
              key={value}
              aria-pressed={type === value}
              onClick={() => onFilter({ type: value })}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          className={`button filter-button ${activeCount ? 'filter-active' : ''}`}
          aria-expanded={showFilters}
          onClick={() => setShowFilters(true)}
          aria-label="Liste filtrelerini aç"
        >
          <Icon name="SlidersHorizontal" size={16} />
          Filtreler{activeCount > 0 && <span className="count-pill">{activeCount}</span>}
        </button>
      </div>
      <div className="list-caption">
        <span role="status">
          {filtered.length} {saved ? 'kaydedilen fırsat' : 'gelişme'}
          {narrowed ? ' · Filtrelenmiş' : ''}
        </span>
        <label className="sort-control">
          <span className="sr-only">Sıralama</span>
          <select
            aria-label="Sıralama"
            value={sort}
            onChange={(event) => onFilter({ sort: event.target.value })}
          >
            <option value="newest">En yeni önce</option>
            <option value="oldest">En eski önce</option>
            <option value="priority">Öncelikli gelişmeler</option>
          </select>
        </label>
      </div>
      {narrowed && (
        <div className="active-filters">
          <span>
            {[
              q && `“${q}”`,
              categoryLabels[category as Category],
              allSources.find(([id]) => id === source)?.[1],
              status !== 'active' &&
                (statusLabels[status as Opportunity['status']] ?? 'Tüm durumlar'),
              type === 'removed' && 'Artık görünmeyenler',
              type === 'archived' && 'Arşiv',
            ]
              .filter(Boolean)
              .join(' · ') || 'Değişiklik türüne göre filtreleniyor'}
          </span>
          <button
            className="text-button"
            onClick={() => onFilter(defaultFilters)}
            aria-label="Tüm filtreleri temizle"
          >
            <Icon name="X" size={14} />
            Temizle
          </button>
        </div>
      )}
      <div className="opportunity-list" ref={scrollRef}>
        {filtered.length ? (
          filtered.map((item) => (
            <OpportunityCard
              key={item.id}
              item={item}
              onOpen={onOpen}
              onSave={onSave}
              busy={busyId === item.id}
              selected={selectedId === item.id}
            />
          ))
        ) : (
          <EmptyState
            icon={saved ? 'Bookmark' : sources.length ? 'Inbox' : 'Radio'}
            title={
              narrowed
                ? 'Bu filtrelerde bir fırsat yok'
                : saved
                  ? 'İlk fırsatını kaydet'
                  : sources.length
                    ? 'Henüz yeni bir gelişme yok'
                    : 'İlk kaynağını ekle'
            }
            description={
              narrowed
                ? 'Aramanı değiştirebilir veya filtreleri temizleyebilirsin.'
                : saved
                  ? 'Kaynak kanıtıyla kaydettiğin fırsatları burada bulabilirsin.'
                  : sources.length
                    ? 'Başlangıç görüntüsü bildirim üretmez. Sonraki anlamlı değişiklikler burada görünür.'
                    : 'Bir RSS beslemesi veya statik sayfa bölgesi ekleyerek inceleme masana başla.'
            }
            action={
              narrowed ? (
                <button className="button secondary" onClick={() => onFilter(defaultFilters)}>
                  Filtreleri temizle
                </button>
              ) : !sources.length && !saved ? (
                <button className="button primary" onClick={onAdd}>
                  <Icon name="Plus" size={16} />
                  İlk kaynağımı ekle
                </button>
              ) : undefined
            }
          />
        )}
      </div>
      <div className="list-result-count">
        <Icon name="ShieldCheck" size={13} />
        Kaynak görüntüleriyle birlikte
        <span>
          {filtered.length} / {items.length} kayıt
        </span>
      </div>
      {showFilters && (
        <Modal
          open
          onOpenChange={setShowFilters}
          title="Gelişmeleri filtrele"
          description="Seçimlerin bağlantıda ve listeye döndüğünde korunur."
          className="filter-dialog"
          initialFocus="#filter-category"
        >
          <div className="filter-fields">
            <div className="field">
              <label htmlFor="filter-category">Kategori</label>
              <select
                id="filter-category"
                value={category}
                onChange={(event) => onFilter({ category: event.target.value })}
              >
                <option value="">Tüm kategoriler</option>
                {categories.map((value) => (
                  <option key={value} value={value}>
                    {categoryLabels[value]}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="filter-source">Kaynak</label>
              <select
                id="filter-source"
                value={source}
                onChange={(event) => onFilter({ source: event.target.value })}
              >
                <option value="">Tüm kaynaklar</option>
                {allSources.map(([id, name]) => (
                  <option value={id} key={id}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="filter-type">Değişiklik türü</label>
              <select
                id="filter-type"
                value={type}
                onChange={(event) => onFilter({ type: event.target.value })}
              >
                <option value="all">Tüm değişiklikler</option>
                <option value="new">Yeni fırsatlar</option>
                <option value="updated">Güncellemeler</option>
                <option value="removed">Artık görünmeyenler</option>
                {type === 'archived' && <option value="archived">Arşiv (eski bağlantı)</option>}
              </select>
            </div>
            {!saved && (
              <div className="field">
                <label htmlFor="filter-status">Karar durumu</label>
                <select
                  id="filter-status"
                  value={status}
                  onChange={(event) =>
                    onFilter({
                      status: event.target.value,
                      ...(type === 'archived' ? { type: 'all' } : {}),
                    })
                  }
                >
                  <option value="active">Gelen kutusunda</option>
                  <option value="all">Tüm durumlar</option>
                  {Object.entries(statusLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <div className="dialog-actions">
            <button className="text-button" onClick={() => onFilter(defaultFilters)}>
              Filtreleri temizle
            </button>
            <button className="button primary" onClick={() => setShowFilters(false)}>
              {filtered.length} sonucu göster
              <Icon name="ArrowRight" size={15} />
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import type { DiffDetail as DiffDetailType, Opportunity, Source } from '@shared/contracts';
import { Icon } from '../../components/Icon';
import { Badge, ErrorState, Loading, useToast } from '../../components/ui';
import { api, post, refreshData } from '../../lib/api';
import { categoryShort, safeHref } from '../../lib/format';
import { useDateFormat } from '../../lib/date-context';
import { ChangeBadge, statusLabels } from '../inbox/OpportunityList';

export function DiffDetail({
  itemId,
  onClose,
  timezone,
  expanded,
  onExpand,
  source,
}: {
  itemId: string;
  onClose: () => void;
  timezone: string;
  expanded: boolean;
  onExpand?: () => void;
  source?: Source;
}) {
  const reader = useRef<HTMLElement>(null);
  const query = useQuery({
    queryKey: ['diff', itemId],
    queryFn: () => api<DiffDetailType>(`/items/${encodeURIComponent(itemId)}/diff`),
  });
  useEffect(() => {
    reader.current?.focus({ preventScroll: true });
  }, [itemId]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (
        event.key !== 'Escape' ||
        event.defaultPrevented ||
        document.querySelector('[role="dialog"]')
      )
        return;
      if (
        (event.target as HTMLElement).closest('input, textarea, select, [contenteditable="true"]')
      )
        return;
      event.preventDefault();
      onClose();
    };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [onClose]);
  return (
    <section
      className={`evidence-reader ${expanded ? 'is-expanded' : ''}`}
      ref={reader}
      tabIndex={-1}
      aria-label="Kanıt okuyucusu"
    >
      <header className="reader-toolbar">
        <button className="text-button" onClick={onClose} aria-label="Listeye dön">
          <Icon name="ArrowLeft" size={16} />
          <span>Listeye dön</span>
        </button>
        <span>KANIT OKUYUCUSU</span>
        <button className="icon-button" onClick={onClose} aria-label="Kanıt okuyucusunu kapat">
          <Icon name="X" size={17} />
        </button>
      </header>
      <div className="reader-scroll">
        {query.isPending ? (
          <Loading label="Kaynak kanıtı yükleniyor…" />
        ) : query.error && !query.data ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        ) : query.data ? (
          <>
            {query.error && (
              <div className="info-strip warning">
                <Icon name="WifiOff" />
                <p>Kanıt yenilenemedi. Son alınan görüntü gösteriliyor.</p>
                <button className="text-button" onClick={() => void query.refetch()}>
                  Tekrar dene
                </button>
              </div>
            )}
            <DetailContent
              detail={query.data}
              timezone={timezone}
              expanded={expanded}
              onExpand={onExpand}
              source={source}
            />
          </>
        ) : null}
      </div>
    </section>
  );
}
function DetailContent({
  detail,
  timezone,
  expanded,
  onExpand,
  source,
}: {
  detail: DiffDetailType;
  timezone: string;
  expanded: boolean;
  onExpand?: () => void;
  source?: Source;
}) {
  const { formatDate } = useDateFormat();
  const [tab, setTab] = useState('diff');
  const { item, before, after, changes } = detail;
  const added = changes.filter((c) => c.kind === 'added').length;
  const removed = changes.filter((c) => c.kind === 'removed').length;
  const timestamp = (date: string) =>
    formatDate(date, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  return (
    <>
      <div className="detail-hero">
        <div className="detail-eyebrow">
          <span>{categoryShort[item.category]}</span>
          <span>·</span>
          <span>{item.sourceName}</span>
        </div>
        <h2>{item.title}</h2>
        <a
          className="external-source"
          href={safeHref(item.url)}
          target="_blank"
          rel="noopener noreferrer"
        >
          Orijinal kaynağı aç
          <Icon name="ArrowUpRight" size={14} />
        </a>
        <div className="detail-meta">
          <ChangeBadge type={item.changeType} />
          <span>{statusLabels[item.status]}</span>
          <time dateTime={item.observedAt}>
            <Icon name="Clock3" size={13} />
            {timestamp(item.observedAt)}
          </time>
        </div>
      </div>
      <DecisionActions item={item} />
      <div className="detail-evidence">
        {source?.lastError && (
          <div className="info-strip warning">
            <Icon name="AlertCircle" />
            <p>
              <strong>Son kontrol tamamlanamadı.</strong> {source.lastError} Son geçerli kanıt
              korunuyor; bu durum içeriğin kaldırıldığı anlamına gelmez.
            </p>
          </div>
        )}
        {item.changeType === 'removed' && (
          <div className="info-strip warning">
            <Icon name="AlertCircle" />
            <p>Bu öğe kaynakta artık görünmüyor. Başvurunun kapandığı sonucuna varılamaz.</p>
          </div>
        )}
        <div className="detail-tabs" role="group" aria-label="Kanıt görünümü">
          <button aria-pressed={tab === 'diff'} onClick={() => setTab('diff')}>
            <Icon name="FileText" size={15} />
            Değişiklik kanıtı
          </button>
          <button aria-pressed={tab === 'content'} onClick={() => setTab('content')}>
            Son gözlem metni
          </button>
        </div>
        <div className="diff-summary">
          <Icon name="Activity" size={16} />
          <p>{item.changeSummary || 'Kaynak içeriğinin iki gözlem arasındaki farkı.'}</p>
        </div>
        {onExpand && (
          <button className="expand-evidence button secondary" onClick={onExpand}>
            <Icon name={expanded ? 'ArrowDownLeft' : 'ArrowUpRight'} size={15} />
            {expanded ? 'Dar okuyucuya dön' : 'Tam genişlikte incele'}
            <span>{expanded ? 'Listeyle yan yana' : 'Önce / sonra karşılaştır'}</span>
          </button>
        )}
        {tab === 'diff' ? (
          <>
            <div className="diff-legend">
              <span className="added">
                <b>+</b>
                {added} eklenen bölüm
              </span>
              <span className="removed">
                <b>−</b>
                {removed} kaldırılan bölüm
              </span>
            </div>
            <div className="diff-columns">
              <section className="diff-column before">
                <header>
                  <span className="diff-label">ÖNCEKİ GÖRÜNTÜ</span>
                  <small>{before ? timestamp(before.observedAt) : 'Önceki görüntü yok'}</small>
                </header>
                <div className="diff-lines">
                  {!before ? (
                    <p className="no-previous">Bu fırsat ilk kez bu gözlemde görüldü.</p>
                  ) : !before.content.trim() ? (
                    <p className="no-previous">Önceki görüntüde içerik yok.</p>
                  ) : (
                    changes
                      .filter((c) => c.kind !== 'added')
                      .map((line, i) => (
                        <div className={`diff-line ${line.kind}`} key={i}>
                          <span
                            className="diff-line-mark"
                            aria-label={line.kind === 'removed' ? 'Kaldırıldı' : 'Değişmedi'}
                          >
                            {line.kind === 'removed' ? '−' : '·'}
                          </span>
                          <p>{line.text}</p>
                        </div>
                      ))
                  )}
                </div>
              </section>
              <section className="diff-column after">
                <header>
                  <span className="diff-label">YENİ GÖRÜNTÜ</span>
                  <small>{timestamp(after.observedAt)}</small>
                </header>
                <div className="diff-lines">
                  {!after.content.trim() ? (
                    <p className="no-previous">
                      Bu görüntüde içerik yok. Kaldırılan metni önceki görüntüde inceleyebilirsin.
                    </p>
                  ) : (
                    changes
                      .filter((c) => c.kind !== 'removed')
                      .map((line, i) => (
                        <div className={`diff-line ${line.kind}`} key={i}>
                          <span
                            className="diff-line-mark"
                            aria-label={line.kind === 'added' ? 'Eklendi' : 'Değişmedi'}
                          >
                            {line.kind === 'added' ? '+' : '·'}
                          </span>
                          <p>{line.text}</p>
                        </div>
                      ))
                  )}
                </div>
              </section>
            </div>
          </>
        ) : (
          <div className="current-content">
            <h3>Son gözlemde kaydedilen metin</h3>
            <p>{after.content || 'Bu görüntüde içerik yok.'}</p>
          </div>
        )}
        <div className="evidence-footer">
          <Icon name="ShieldCheck" size={14} />
          <span>Gözlemde kaydedilen kaynak görüntüleri</span>
        </div>
        <div className="source-citation">
          <span>KAYNAK KAYDI</span>
          <a href={safeHref(item.sourceUrl)} target="_blank" rel="noopener noreferrer">
            {item.sourceUrl}
            <Icon name="ExternalLink" size={12} />
          </a>
          <p>
            Gözlem: {timestamp(after.observedAt)} · {timezone}
          </p>
        </div>
      </div>
      <DeadlineConfirmation
        key={`${item.id}-${item.confirmedDeadline?.version ?? 0}`}
        item={item}
        timezone={timezone}
      />
    </>
  );
}
function DecisionActions({ item }: { item: Opportunity }) {
  const [irrelevant, setIrrelevant] = useState(false);
  const [reason, setReason] = useState('');
  const toast = useToast();
  const mutation = useMutation({
    mutationFn: ({ action, reason }: { action: string; reason?: string }) =>
      post<Opportunity>(
        `/items/${item.id}/decisions`,
        { action, reason },
        { 'Idempotency-Key': crypto.randomUUID() },
      ),
    onSuccess: async (_, variables) => {
      await refreshData();
      toast(
        variables.action === 'save'
          ? 'Fırsat, kaynak kanıtıyla kaydedildi.'
          : variables.action === 'archive'
            ? 'Fırsat arşive taşındı.'
            : variables.action === 'irrelevant'
              ? 'Kararın ve gerekçen kaydedildi.'
              : variables.action === 'restore'
                ? 'Fırsat gelen kutusuna geri alındı.'
                : 'İnceleme kararın kaydedildi.',
      );
      setIrrelevant(false);
    },
  });
  const statusLabels: Record<Opportunity['status'], string> = {
    unread: 'Henüz karar vermedin',
    reviewed: 'İncelendi',
    saved: 'Kaydedildi',
    irrelevant: 'İlgisiz olarak işaretlendi',
    archived: 'Arşivlendi',
  };
  return (
    <section className="decision-section">
      <h3 className="sr-only">İnceleme kararı</h3>
      <div className="decision-status">
        <Icon
          name={
            item.status === 'saved'
              ? 'Bookmark'
              : item.status === 'unread'
                ? 'Circle'
                : 'CheckCircle2'
          }
          size={14}
        />
        {statusLabels[item.status]}
      </div>
      <div className="decision-controls">
        <button
          className={`button ${item.status === 'saved' ? 'secondary saved-button' : 'primary'} full`}
          disabled={mutation.isPending}
          onClick={() => mutation.mutate({ action: item.status === 'saved' ? 'review' : 'save' })}
        >
          <Icon name="Bookmark" size={16} />
          {item.status === 'saved' ? 'Kaydedildi · Kaydı kaldır' : 'Fırsatı kaydet'}
        </button>
        <div className="decision-secondary">
          <button
            className="button secondary small"
            disabled={mutation.isPending || item.status === 'reviewed'}
            onClick={() => mutation.mutate({ action: 'review' })}
          >
            <Icon name="CheckCheck" size={15} />
            İnceledim
          </button>
          <button
            className="button secondary small"
            disabled={mutation.isPending}
            onClick={() => setIrrelevant(!irrelevant)}
          >
            <Icon name="X" size={15} />
            İlgisiz
          </button>
        </div>
        {irrelevant && (
          <form
            className="irrelevant-form"
            onSubmit={(e) => {
              e.preventDefault();
              mutation.mutate({ action: 'irrelevant', reason });
            }}
          >
            <label htmlFor="decision-reason">Neden ilgisiz?</label>
            <select
              id="decision-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
            >
              <option value="">Bir neden seç</option>
              <option>İlgi alanıma uygun değil</option>
              <option>Başvuru koşullarını karşılamıyorum</option>
              <option>Anahtar kelime eşleşmesi hatalı</option>
              <option>Anlamlı bir değişiklik değil</option>
              <option>Bu fırsatı zaten değerlendirdim</option>
            </select>
            <button
              className="button secondary small full"
              type="submit"
              disabled={!reason || mutation.isPending}
            >
              Kararı kaydet
            </button>
          </form>
        )}
        <button
          className="archive-button"
          disabled={mutation.isPending}
          onClick={() =>
            mutation.mutate({
              action: ['archived', 'irrelevant'].includes(item.status) ? 'restore' : 'archive',
            })
          }
        >
          <Icon
            name={['archived', 'irrelevant'].includes(item.status) ? 'Undo2' : 'Archive'}
            size={14}
          />
          {['archived', 'irrelevant'].includes(item.status) ? 'Gelen kutusuna geri al' : 'Arşivle'}
        </button>
      </div>
      {mutation.error && <ErrorState error={mutation.error} />}
    </section>
  );
}
function DeadlineConfirmation({ item, timezone }: { item: Opportunity; timezone: string }) {
  const { formatDate } = useDateFormat();
  const [editing, setEditing] = useState(
    !item.confirmedDeadline || item.confirmedDeadline.reviewRequired,
  );
  const [candidateId, setCandidateId] = useState(item.deadlineCandidates[0]?.id ?? '');
  const candidate = item.deadlineCandidates.find((c) => c.id === candidateId);
  const [date, setDate] = useState(item.confirmedDeadline?.dateOnly ?? candidate?.dateOnly ?? '');
  const [mode, setMode] = useState<'day' | 'instant'>('day');
  const [instant, setInstant] = useState('');
  const [accepted, setAccepted] = useState(false);
  const toast = useToast();
  const confirm = useMutation({
    mutationFn: () =>
      post<Opportunity>(`/items/${item.id}/deadline-confirmations`, {
        candidateId: candidateId || null,
        dateOnly: mode === 'day' ? date : null,
        instantUtc: mode === 'instant' ? new Date(`${instant}Z`).toISOString() : null,
        timezone: mode === 'day' ? timezone : 'UTC',
        userSuppliedFields: [
          ...new Set([
            ...(mode === 'instant'
              ? ['instantUtc', 'timezone']
              : candidate?.dateOnly === date
                ? []
                : ['dateOnly']),
            ...(candidate?.resolution === 'missing_year' ? ['year'] : []),
            ...(candidate?.resolution === 'missing_timezone' ? ['timezone'] : []),
          ]),
        ],
        expectedVersion: item.confirmedDeadline?.version ?? 0,
      }),
    onSuccess: async () => {
      await refreshData();
      toast('Son tarih onaylandı ve takvimine eklendi.');
      setEditing(false);
    },
  });
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (accepted) confirm.mutate();
  };
  return (
    <section className="deadline-section">
      <div className="deadline-section-heading">
        <Icon name="CalendarDays" size={17} />
        <h3>Son tarih</h3>
      </div>
      {item.confirmedDeadline?.reviewRequired && (
        <div className="date-review-warning">
          <Icon name="AlertCircle" size={15} />
          <span>
            Kaynak yeni tarih yayımladı. Önceki onayını yeniden incele.
            <strong className="previous-confirmation">
              Önceki onayın:{' '}
              {item.confirmedDeadline.dateOnly
                ? formatDate(item.confirmedDeadline.dateOnly)
                : formatDate(item.confirmedDeadline.instantUtc!, {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  }) + ` · ${timezone}`}
            </strong>
          </span>
        </div>
      )}
      {item.confirmedDeadline && !editing ? (
        <div className="confirmed-date">
          <Badge tone="green">
            <Icon name="Check" size={12} />
            Senin tarafından onaylandı
          </Badge>
          <strong>
            {item.confirmedDeadline.dateOnly
              ? formatDate(item.confirmedDeadline.dateOnly)
              : formatDate(item.confirmedDeadline.instantUtc!, {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                }) + ` · ${timezone}`}
          </strong>
          <p>
            {item.confirmedDeadline.dateOnly
              ? 'Belirtilen günün tamamını kapsar.'
              : 'Kesin zaman olarak kaydedildi.'}
          </p>
          <button className="text-button" onClick={() => setEditing(true)}>
            Tarihi düzenle <Icon name="ArrowRight" size={13} />
          </button>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="deadline-form">
          {item.deadlineCandidates.length > 1 && (
            <div className="field">
              <label htmlFor="candidate">Kaynakta geçen tarih</label>
              <select
                id="candidate"
                value={candidateId}
                onChange={(e) => {
                  setCandidateId(e.target.value);
                  setDate(
                    item.deadlineCandidates.find((c) => c.id === e.target.value)?.dateOnly ?? '',
                  );
                  setAccepted(false);
                }}
              >
                {item.deadlineCandidates.map((c, i) => (
                  <option value={c.id} key={c.id}>
                    Aday {i + 1}: {c.quote.slice(0, 55)}
                  </option>
                ))}
              </select>
            </div>
          )}
          {candidate ? (
            <div className="deadline-quote">
              <Badge tone="neutral">Onaylanmamış tarih adayı</Badge>
              <span>KAYNAKTAN ALINTI</span>
              <blockquote>“{candidate.quote}”</blockquote>
              {candidate.resolution !== 'complete' && (
                <small>
                  <Icon name="AlertCircle" size={12} />
                  {candidate.resolution === 'missing_year'
                    ? 'Kaynakta yıl belirtilmemiş.'
                    : candidate.resolution === 'missing_timezone'
                      ? 'Kaynakta saat dilimi belirtilmemiş.'
                      : 'Bu tarih açıklama gerektiriyor.'}
                </small>
              )}
            </div>
          ) : (
            <p className="deadline-hint">
              Kaynakta kesin bir tarih bulunamadı. Dilersen kendi doğruladığın tarihi
              ekleyebilirsin.
            </p>
          )}
          <div className="field">
            <label htmlFor="deadline-mode">Tarih türü</label>
            <select
              id="deadline-mode"
              value={mode}
              onChange={(e) => {
                setMode(e.target.value as 'day' | 'instant');
                setAccepted(false);
              }}
            >
              <option value="day">Takvim günü</option>
              <option value="instant">Kesin tarih ve saat · UTC</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="confirmed-date">
              {mode === 'day' ? 'Onaylayacağın son tarih' : 'Kesin zaman (UTC)'}
            </label>
            <input
              id="confirmed-date"
              type={mode === 'day' ? 'date' : 'datetime-local'}
              required
              value={mode === 'day' ? date : instant}
              onChange={(e) => {
                if (mode === 'day') setDate(e.target.value);
                else setInstant(e.target.value);
                setAccepted(false);
              }}
            />
            <small>
              {mode === 'day'
                ? 'Günün tamamı dahildir. Eksik alanlar senin beyanın olarak kaydedilir.'
                : 'Girilen saat UTC olarak saklanır; yerel saat değildir.'}
            </small>
          </div>
          <label className="confirmation-checkbox">
            <input
              type="checkbox"
              checked={accepted}
              onChange={(e) => setAccepted(e.target.checked)}
              required
            />
            <span>Bu tarihi kaynaktan kontrol ettim, takvimime eklemek istiyorum.</span>
          </label>
          {confirm.error && <ErrorState error={confirm.error} />}
          <button
            type="submit"
            className="button secondary full"
            disabled={!accepted || confirm.isPending || !(mode === 'day' ? date : instant)}
          >
            <Icon
              name={confirm.isPending ? 'LoaderCircle' : 'Check'}
              size={15}
              className={confirm.isPending ? 'spin' : ''}
            />
            Tarihi onayla
          </button>
        </form>
      )}
    </section>
  );
}

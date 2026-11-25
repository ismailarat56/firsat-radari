import type { Opportunity, Summary } from '@shared/contracts';
import { Icon } from '../../components/Icon';
import { useDateFormat } from '../../lib/date-context';
import type { View } from '../../lib/navigation';

export function WorkspaceSummary({
  summary,
  items,
  onNavigate,
}: {
  summary: Summary;
  items: Opportunity[];
  onNavigate: (view: View) => void;
}) {
  const { daysUntil, deadlineDate } = useDateFormat();
  const upcoming = items.filter((item) => {
    const date = deadlineDate(item);
    return (
      date &&
      daysUntil(date) >= 0 &&
      daysUntil(date) <= 14 &&
      !['archived', 'irrelevant'].includes(item.status)
    );
  }).length;
  return (
    <div className="workspace-summary" aria-label="Çalışma alanı özeti">
      <button onClick={() => onNavigate('sources')}>
        <Icon name="Radio" size={15} />
        <strong>{summary.sourceCount}</strong> kaynak
      </button>
      <button onClick={() => onNavigate('inbox')}>
        <Icon name="Inbox" size={15} />
        <strong>{summary.unreadCount}</strong> okunmamış gelişme
      </button>
      <button className={upcoming ? 'attention' : ''} onClick={() => onNavigate('calendar')}>
        <Icon name="CalendarDays" size={15} />
        <strong>{upcoming}</strong> yaklaşan onaylı tarih{' '}
        <span className="summary-period">· 14 gün</span>
      </button>
    </div>
  );
}

export function ReaderPlaceholder() {
  return (
    <aside className="reader-placeholder" aria-label="Kanıt inceleme alanı">
      <div className="reader-placeholder-header">
        <Icon name="FileText" size={16} /> KANIT OKUYUCUSU
      </div>
      <div className="reader-placeholder-body">
        <div className="evidence-symbol" aria-hidden="true">
          <Icon name="FileText" size={30} />
          <Icon name="ArrowRight" size={18} />
          <Icon name="CheckCheck" size={30} />
        </div>
        <h2>Her gelişmenin bir dayanağı var.</h2>
        <p>
          Listeden bir kayıt seç. Kaynağın önceki ve yeni görüntüsünü incele, kararını kanıtıyla
          kaydet.
        </p>
        <ol>
          <li>
            <span>01</span> Gelişmeyi seç
          </li>
          <li>
            <span>02</span> Değişikliği karşılaştır
          </li>
          <li>
            <span>03</span> Kararını ver
          </li>
        </ol>
        <span className="reader-privacy">
          <Icon name="ShieldCheck" size={15} /> Kaynak metni ve gözlem zamanı birlikte.
        </span>
      </div>
    </aside>
  );
}

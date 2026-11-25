import { useMemo, useState } from 'react';
import type { Opportunity } from '@shared/contracts';
import { Icon } from '../../components/Icon';
import { Badge, EmptyState } from '../../components/ui';
import { categoryShort } from '../../lib/format';
import { useDateFormat } from '../../lib/date-context';
export function Calendar({
  items,
  onOpen,
}: {
  items: Opportunity[];
  onOpen: (item: Opportunity) => void;
}) {
  const { deadlineDate, formatDate, calendarDay } = useDateFormat();
  const today = calendarDay(new Date());
  const currentMonth = () => new Date(`${today.slice(0, 7)}-01T12:00:00Z`);
  const [mode, setMode] = useState<'agenda' | 'month'>('agenda');
  const [month, setMonth] = useState(currentMonth);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const deadlines = items.filter(
    (i) => deadlineDate(i) && !['archived', 'irrelevant'].includes(i.status),
  );
  const dateKey = (date: Date) =>
    `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
  const days = useMemo(() => {
    const start = new Date(month);
    start.setUTCDate(1 - ((month.getUTCDay() + 6) % 7));
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start);
      d.setUTCDate(start.getUTCDate() + i);
      return d;
    });
  }, [month]);
  const monthItems = deadlines
    .filter((i) =>
      mode === 'agenda'
        ? deadlineDate(i)! >= today
        : selectedDay
          ? deadlineDate(i) === selectedDay
          : deadlineDate(i)?.slice(0, 7) === dateKey(month).slice(0, 7),
    )
    .sort((a, b) => deadlineDate(a)!.localeCompare(deadlineDate(b)!));
  return (
    <>
      <div className="calendar-view-tabs" role="group" aria-label="Takvim görünümü">
        <button
          className="button secondary"
          aria-pressed={mode === 'agenda'}
          onClick={() => setMode('agenda')}
        >
          <Icon name="FileText" size={15} />
          Ajanda
        </button>
        <button
          className="button secondary"
          aria-pressed={mode === 'month'}
          onClick={() => setMode('month')}
        >
          <Icon name="CalendarDays" size={15} />
          Ay görünümü
        </button>
      </div>
      <div className={`calendar-layout ${mode === 'agenda' ? 'agenda-first' : ''}`}>
        <section className="panel calendar-panel">
          <div className="calendar-heading">
            <h2>
              {new Intl.DateTimeFormat('tr-TR', {
                month: 'long',
                year: 'numeric',
                timeZone: 'UTC',
              }).format(month)}
            </h2>
            <div>
              <button
                className="button small secondary"
                onClick={() => {
                  setMonth(currentMonth());
                  setSelectedDay(today);
                }}
              >
                Bugün
              </button>
              <button
                className="icon-button"
                onClick={() => {
                  setMonth(
                    new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() - 1, 1, 12)),
                  );
                  setSelectedDay(null);
                }}
                aria-label="Önceki ay"
              >
                <Icon name="ChevronLeft" />
              </button>
              <button
                className="icon-button"
                onClick={() => {
                  setMonth(
                    new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 1, 12)),
                  );
                  setSelectedDay(null);
                }}
                aria-label="Sonraki ay"
              >
                <Icon name="ChevronRight" />
              </button>
            </div>
          </div>
          <div className="calendar-grid calendar-weekdays">
            {['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'].map((d) => (
              <span key={d}>{d}</span>
            ))}
          </div>
          <div className="calendar-grid">
            {days.map((date) => {
              const key = dateKey(date);
              const events = deadlines.filter((i) => deadlineDate(i) === key);
              return (
                <button
                  key={key}
                  className={`calendar-day ${date.getUTCMonth() !== month.getUTCMonth() ? 'outside' : ''} ${key === today ? 'today' : ''} ${selectedDay === key ? 'selected' : ''}`}
                  onClick={() => setSelectedDay(key === selectedDay ? null : key)}
                  aria-label={`${formatDate(key)}, ${events.length} son tarih`}
                  aria-pressed={selectedDay === key}
                >
                  <span className="day-number">{date.getUTCDate()}</span>
                  <div className="day-events">
                    {events.slice(0, 2).map((item) => (
                      <span className={`calendar-event category-${item.category}`} key={item.id}>
                        {item.title}
                      </span>
                    ))}
                    {events.length > 2 && <small>+{events.length - 2} fırsat</small>}
                  </div>
                  {events.length > 0 && <span className="mobile-event-dot" />}
                </button>
              );
            })}
          </div>
          <div className="calendar-legend">
            <Icon name="CheckCircle2" size={14} /> Yalnızca senin onayladığın tarihler gösterilir.
          </div>
        </section>
        <aside className="panel calendar-agenda">
          <div className="panel-heading">
            <div>
              <h2>
                {mode === 'agenda'
                  ? 'Yaklaşan son tarihler'
                  : selectedDay
                    ? formatDate(selectedDay, { day: 'numeric', month: 'long' })
                    : 'Bu ayın ajandası'}
              </h2>
              <p>{monthItems.length} onaylı son tarih</p>
            </div>
            {selectedDay && mode === 'month' && (
              <button
                className="icon-button"
                onClick={() => setSelectedDay(null)}
                aria-label="Gün filtresini temizle"
              >
                <Icon name="X" size={16} />
              </button>
            )}
          </div>
          {monthItems.length ? (
            monthItems.map((item) => (
              <button className="agenda-item" key={item.id} onClick={() => onOpen(item)}>
                <span>{formatDate(deadlineDate(item)!, { day: 'numeric', month: 'long' })}</span>
                <strong>{item.title}</strong>
                <small>{item.sourceName}</small>
                <Badge tone={item.confirmedDeadline?.reviewRequired ? 'amber' : 'green'}>
                  {item.confirmedDeadline?.reviewRequired
                    ? 'Yeniden inceleme gerekiyor'
                    : `${categoryShort[item.category]} · Onaylandı`}
                </Badge>
              </button>
            ))
          ) : (
            <EmptyState
              icon="CalendarDays"
              title="Ajandan ferah"
              description="Bu dönem için henüz onaylanmış bir son tarih yok."
            />
          )}
        </aside>
      </div>
      <div className="info-strip">
        <Icon name="Clock3" />
        <p>
          Yalnız tarih içeren son tarihler belirtilen günün tamamını kapsar. Kaynak yeni bir tarih
          yayımlarsa, önceki onayın kendiliğinden değiştirilmez.
        </p>
      </div>
    </>
  );
}

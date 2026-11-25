import { useMutation } from '@tanstack/react-query';
import type { Notification } from '@shared/contracts';
import { Icon } from '../../components/Icon';
import { EmptyState, useToast } from '../../components/ui';
import { patch, post, refreshData } from '../../lib/api';
import { relativeTime } from '../../lib/format';
import { useDateFormat } from '../../lib/date-context';
export function Notifications({
  notifications,
  onOpen,
}: {
  notifications: Notification[];
  onOpen: (id: string) => void;
}) {
  const { formatDate } = useDateFormat();
  const toast = useToast();
  const read = useMutation({
    mutationFn: (id: string) => patch(`/notifications/${id}`, { read: true }),
    onSuccess: () => refreshData(),
    onError: (e: Error) => toast(e.message, 'error'),
  });
  const readAll = useMutation({
    mutationFn: () => post('/notifications/read-all'),
    onSuccess: async () => {
      await refreshData();
      toast('Tüm bildirimler okundu olarak işaretlendi.');
    },
    onError: (e: Error) => toast(e.message, 'error'),
  });
  const unread = notifications.filter((n) => !n.read).length;
  return (
    <section className="panel notifications-panel">
      <div className="panel-heading">
        <div>
          <h2>Bildirim geçmişi</h2>
          <p>{unread ? `${unread} okunmamış bildirimin var.` : 'Tüm bildirimler okundu.'}</p>
        </div>
        <button
          className="button secondary small"
          disabled={!unread || readAll.isPending}
          onClick={() => readAll.mutate()}
        >
          <Icon name="CheckCheck" size={16} />
          Tümünü okundu işaretle
        </button>
      </div>
      {notifications.length ? (
        <div className="notification-list">
          {notifications.map((n) => (
            <article key={n.id} className={`notification-row ${!n.read ? 'unread' : ''}`}>
              <span className="notification-icon">
                <Icon name={n.itemId ? 'Activity' : 'Bell'} size={21} />
              </span>
              <div>
                <h3>
                  {n.title}
                  {!n.read && (
                    <span className="unread-label">
                      <span className="unread-dot" />
                      Okunmadı
                    </span>
                  )}
                </h3>
                <p>{n.message}</p>
                <time dateTime={n.createdAt} title={formatDate(n.createdAt)}>
                  {relativeTime(n.createdAt)}
                </time>
                <div className="notification-row-actions">
                  {n.itemId && (
                    <button
                      className="text-button"
                      onClick={() => {
                        if (!n.read) read.mutate(n.id);
                        onOpen(n.itemId!);
                      }}
                    >
                      Fırsatı incele <Icon name="ArrowRight" size={13} />
                    </button>
                  )}
                  {!n.read && (
                    <button
                      className="text-button muted"
                      disabled={read.isPending}
                      onClick={() => read.mutate(n.id)}
                    >
                      Okundu işaretle
                    </button>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState
          icon="Bell"
          title="Şimdilik her şey sakin"
          description="Yeni gelişmeler ve onaylı son tarihlerle ilgili uyarıların burada görünecek."
        />
      )}
    </section>
  );
}

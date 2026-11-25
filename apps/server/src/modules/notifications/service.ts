import { randomUUID } from 'node:crypto';
import type { Notification } from '../../../../../packages/shared/src/contracts';
import type { DB } from '../../db/database';
export function addNotification(
  db: DB,
  eventKey: string,
  itemId: string | null,
  title: string,
  message: string,
  now: Date,
) {
  const notification: Notification = {
    id: randomUUID(),
    itemId,
    title,
    message,
    createdAt: now.toISOString(),
    read: false,
  };
  db.prepare('INSERT OR IGNORE INTO notifications VALUES (?,?,?,?)').run(
    notification.id,
    itemId,
    eventKey,
    JSON.stringify(notification),
  );
}
export function listNotifications(db: DB): Notification[] {
  return (
    db.prepare('SELECT data FROM notifications ORDER BY rowid DESC LIMIT 200').all() as {
      data: string;
    }[]
  ).map((r) => JSON.parse(r.data));
}

import { randomUUID } from 'node:crypto';
import {
  decisionSchema,
  deadlineConfirmationSchema,
  type Opportunity,
  type ConfirmedDeadline,
} from '../../../../../packages/shared/src/contracts';
import { isValidDateOnly } from '../../../../../packages/shared/src/deadlines';
import type { DB } from '../../db/database';
import { putJson } from '../../db/database';
import { AppError, assertFound } from '../../errors';
import { getItem } from '../items/service';
import { protectItemEvidence } from '../../storage/retention';
import { completeOnboarding } from '../../storage/settings';
export function decide(db: DB, id: string, body: unknown, now: Date): Opportunity {
  const input = decisionSchema.parse(body);
  return db.transaction(() => {
    const item = getItem(db, id);
    protectItemEvidence(db, id, now);
    const states = {
      review: 'reviewed',
      save: 'saved',
      irrelevant: 'irrelevant',
      archive: 'archived',
      restore: 'unread',
    } as const;
    const updated: Opportunity = {
      ...item,
      status: states[input.action],
      decisionReason: input.reason || null,
    };
    putJson(db, 'items', id, updated);
    db.prepare('INSERT INTO decisions VALUES (?,?,?,?,?)').run(
      randomUUID(),
      id,
      input.action,
      input.reason || null,
      now.toISOString(),
    );
    db.prepare('INSERT INTO events VALUES (?,?,?,?)').run(
      randomUUID(),
      input.action === 'save'
        ? 'item_saved'
        : input.action === 'irrelevant'
          ? 'alert_dismissed'
          : 'item_reviewed',
      id,
      now.toISOString(),
    );
    completeOnboarding(db);
    return updated;
  })();
}
export function confirmDeadline(db: DB, id: string, body: unknown, now: Date): Opportunity {
  const input = deadlineConfirmationSchema.parse(body);
  if (input.dateOnly && !isValidDateOnly(input.dateOnly))
    throw new AppError('DATE_INVALID', 'Takvim günü geçersiz.');
  try {
    new Intl.DateTimeFormat('en', { timeZone: input.timezone }).format();
  } catch {
    throw new AppError('TIMEZONE_INVALID', 'Geçerli bir IANA saat dilimi seçin.');
  }
  return db.transaction(() => {
    const item = getItem(db, id);
    if ((item.confirmedDeadline?.version || 0) !== input.expectedVersion)
      throw new AppError(
        'VERSION_CONFLICT',
        'Son tarih başka bir işlemde değişti. Güncel kaydı açıp yeniden deneyin.',
        409,
      );
    const candidate = input.candidateId
      ? assertFound(
          item.deadlineCandidates.find((c) => c.id === input.candidateId),
          'Tarih kanıtı',
        )
      : null;
    const supplied = input.userSuppliedFields;
    if (candidate?.resolution === 'missing_year' && !supplied.includes('year'))
      throw new AppError(
        'USER_FIELDS_REQUIRED',
        'Kaynakta eksik olan yılı kullanıcı bilgisi olarak belirtin.',
      );
    if (candidate?.resolution === 'missing_timezone' && !supplied.includes('timezone'))
      throw new AppError(
        'USER_FIELDS_REQUIRED',
        'Kaynakta saat dilimi yok; saat dilimini kullanıcı bilgisi olarak belirtin.',
      );
    if (candidate?.resolution === 'ambiguous' && !supplied.length)
      throw new AppError(
        'USER_FIELDS_REQUIRED',
        'Belirsiz tarihi tamamladığınız alanları belirtin.',
      );
    if (!candidate && !supplied.length)
      throw new AppError(
        'USER_FIELDS_REQUIRED',
        'Kendi girdiğiniz tarih için kullanıcı alanlarını belirtin.',
      );
    if (
      candidate?.resolution === 'complete' &&
      ((input.dateOnly && candidate.dateOnly !== input.dateOnly) ||
        (input.instantUtc && candidate.instantUtc !== input.instantUtc)) &&
      !supplied.length
    )
      throw new AppError(
        'USER_FIELDS_REQUIRED',
        'Kaynak tarihinden farklı seçiminizi kullanıcı bilgisi olarak belirtin.',
      );
    protectItemEvidence(db, id, now);
    const confirmed: ConfirmedDeadline = {
      dateOnly: input.dateOnly || null,
      instantUtc: input.instantUtc || null,
      timezone: input.timezone,
      userSuppliedFields: supplied,
      confirmedAt: now.toISOString(),
      reviewRequired: false,
      version: input.expectedVersion + 1,
    };
    const updated: Opportunity = { ...item, confirmedDeadline: confirmed };
    db.prepare(
      'INSERT INTO confirmed_deadlines VALUES (?,?,?) ON CONFLICT(item_id) DO UPDATE SET data=excluded.data,version=excluded.version',
    ).run(id, confirmed.version, JSON.stringify(confirmed));
    putJson(db, 'items', id, updated);
    db.prepare('INSERT INTO events VALUES (?,?,?,?)').run(
      randomUUID(),
      'deadline_confirmed',
      id,
      now.toISOString(),
    );
    return updated;
  })();
}

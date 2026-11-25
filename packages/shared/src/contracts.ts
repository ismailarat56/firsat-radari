import { z } from 'zod';

export const categories = ['burs', 'akademik', 'kariyer', 'etkinlik'] as const;
export type Category = (typeof categories)[number];
export const categoryLabels: Record<Category, string> = {
  burs: 'Burslar',
  akademik: 'Akademik',
  kariyer: 'Kariyer',
  etkinlik: 'Etkinlikler',
};
export const sourceInputSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    url: z.string().trim().url().max(2048),
    category: z.enum(categories),
    kind: z.enum(['rss', 'html']).default('rss'),
    selector: z.string().trim().max(200).optional(),
    keywords: z.array(z.string().trim().min(1).max(80)).max(20).default([]),
    intervalMinutes: z.number().int().min(30).max(10080).default(360),
  })
  .refine((s) => s.kind !== 'html' || Boolean(s.selector?.trim()), {
    message: 'HTML kaynağı için bir içerik seçicisi belirtin.',
    path: ['selector'],
  });
export type SourceInput = z.infer<typeof sourceInputSchema>;
export type Source = SourceInput & {
  id: string;
  configVersion: number;
  enabled: boolean;
  status: 'new' | 'active' | 'error' | 'paused' | 'blocked';
  baselineRequired: boolean;
  lastCheckedAt: string | null;
  lastSuccessAt: string | null;
  nextCheckAt: string | null;
  lastError: string | null;
  itemCount: number;
};
export type ItemStatus = 'unread' | 'reviewed' | 'saved' | 'irrelevant' | 'archived';
export type DeadlineCandidate = {
  id: string;
  quote: string;
  dateOnly: string | null;
  instantUtc?: string | null;
  resolution: 'complete' | 'missing_year' | 'missing_timezone' | 'ambiguous';
  sourceUrl: string;
  observedAt: string;
};
export type ConfirmedDeadline = {
  dateOnly: string | null;
  instantUtc: string | null;
  timezone: string;
  userSuppliedFields: string[];
  confirmedAt: string;
  reviewRequired: boolean;
  version: number;
};
export type Opportunity = {
  id: string;
  sourceId: string;
  sourceName: string;
  sourceUrl: string;
  category: Category;
  title: string;
  url: string;
  summary: string;
  content: string;
  changeType: 'new' | 'updated' | 'removed';
  changeSummary: string;
  observedAt: string;
  publishedAt: string | null;
  status: ItemStatus;
  priority: 'high' | 'normal' | 'low';
  matchedKeywords: string[];
  deadlineCandidates: DeadlineCandidate[];
  confirmedDeadline: ConfirmedDeadline | null;
  decisionReason: string | null;
};
export type DiffLine = { kind: 'added' | 'removed' | 'unchanged'; text: string };
export type SnapshotView = {
  id: string;
  content: string;
  observedAt: string;
  normalizationVersion: number;
};
export type DiffDetail = {
  item: Opportunity;
  before: SnapshotView | null;
  after: SnapshotView;
  changes: DiffLine[];
};
export type Observation = {
  id: string;
  sourceId: string;
  startedAt: string;
  finishedAt: string | null;
  status: 'running' | 'success' | 'unchanged' | 'unreachable' | 'restricted' | 'invalid';
  message: string | null;
  changeCount: number;
};
export type Preview = {
  previewId: string;
  sourceId: string;
  title: string;
  fetchedAt: string;
  itemCount: number;
  items: { title: string; content: string; url: string }[];
};
export type JobView = {
  id: string;
  sourceId: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  nextAttemptAt: string;
  delayReason: string | null;
};
export type Notification = {
  id: string;
  itemId: string | null;
  title: string;
  message: string;
  createdAt: string;
  read: boolean;
};
export type Settings = {
  timezone: string;
  defaultIntervalMinutes: number;
  retentionDays: number;
  maxSnapshots: number;
  evidenceQuotaMb: number;
  evidenceUsedBytes: number;
  dataDirectory: string;
  demo: boolean;
  lastBackupAt: string | null;
  onboardingComplete: boolean;
};
export type SessionInfo = {
  authenticated: boolean;
  demo: boolean;
  csrfToken?: string;
  expiresAt?: string;
};
export type Summary = {
  sourceCount: number;
  activeSources: number;
  unreadCount: number;
  savedCount: number;
  confirmedDeadlineCount: number;
  observedToday: number;
  changesToday: number;
  activity: { date: string; count: number }[];
  lastScanAt: string | null;
  nextScanAt: string | null;
  observationGap: string | null;
};
export const decisionSchema = z
  .object({
    action: z.enum(['review', 'save', 'irrelevant', 'archive', 'restore']),
    reason: z.string().trim().max(1000).optional(),
  })
  .refine((d) => d.action !== 'irrelevant' || Boolean(d.reason?.trim()), {
    path: ['reason'],
    message: 'İlgisiz kararınız için bir neden seçin.',
  });
export const deadlineConfirmationSchema = z
  .object({
    candidateId: z.string().nullable().optional(),
    dateOnly: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable()
      .optional(),
    instantUtc: z.string().datetime().nullable().optional(),
    timezone: z.string().min(1).max(80),
    userSuppliedFields: z.array(z.string().max(40)).max(10).default([]),
    expectedVersion: z.number().int().min(0),
  })
  .refine((d) => Boolean(d.dateOnly) !== Boolean(d.instantUtc), {
    message: 'Takvim günü veya kesin zaman seçeneklerinden birini belirtin.',
  });
export type ApiError = { error: { code: string; message: string; details?: unknown } };

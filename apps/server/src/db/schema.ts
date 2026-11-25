import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
export const sources = sqliteTable('sources', {
  id: text('id').primaryKey(),
  data: text('data').notNull(),
  createdAt: text('created_at').notNull(),
  archived: integer('archived').notNull().default(0),
});
export const sourceConfigs = sqliteTable('source_configs', {
  sourceId: text('source_id')
    .notNull()
    .references(() => sources.id),
  version: integer('version').notNull(),
  data: text('data').notNull(),
  createdAt: text('created_at').notNull(),
});
export const observations = sqliteTable(
  'observations',
  {
    id: text('id').primaryKey(),
    sourceId: text('source_id')
      .notNull()
      .references(() => sources.id),
    startedAt: text('started_at').notNull(),
    data: text('data').notNull(),
  },
  (t) => [index('observations_source').on(t.sourceId, t.startedAt)],
);
export const snapshots = sqliteTable('snapshots', {
  id: text('id').primaryKey(),
  sourceId: text('source_id')
    .notNull()
    .references(() => sources.id),
  configVersion: integer('config_version').notNull(),
  normalizationVersion: integer('normalization_version').notNull(),
  observedAt: text('observed_at').notNull(),
  hash: text('hash').notNull(),
  document: text('document').notNull(),
  etag: text('etag'),
  lastModified: text('last_modified'),
});
export const items = sqliteTable(
  'items',
  {
    id: text('id').primaryKey(),
    sourceId: text('source_id')
      .notNull()
      .references(() => sources.id),
    identity: text('identity').notNull(),
    data: text('data').notNull(),
  },
  (t) => [uniqueIndex('item_identity').on(t.sourceId, t.identity)],
);
export const itemVersions = sqliteTable('item_versions', {
  id: text('id').primaryKey(),
  itemId: text('item_id')
    .notNull()
    .references(() => items.id),
  snapshotId: text('snapshot_id').references(() => snapshots.id, { onDelete: 'set null' }),
  content: text('content').notNull(),
  hash: text('hash').notNull(),
  createdAt: text('created_at').notNull(),
});
export const sessions = sqliteTable('sessions', {
  tokenHash: text('token_hash').primaryKey(),
  csrfToken: text('csrf_token').notNull(),
  expiresAt: text('expires_at').notNull(),
});

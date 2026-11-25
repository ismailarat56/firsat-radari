import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createApp } from '../../apps/server/src/app';
import { setup } from './helper';
import { dataDirectory } from '../../apps/server/src/db/database';
describe('demo and real data isolation', () => {
  it('defaults explicit demo to its own local directory while preserving explicit path overrides', () => {
    expect(dataDirectory(undefined, true, {})).toBe(resolve('.local/demo'));
    expect(dataDirectory('/tmp/explicit-demo', true, {})).toBe('/tmp/explicit-demo');
    expect(dataDirectory(undefined, true, { FR_DATA_DIR: '/tmp/selected' })).toBe('/tmp/selected');
    expect(dataDirectory(undefined, false, { XDG_DATA_HOME: '/tmp/xdg' })).toBe(
      '/tmp/xdg/firsat-radari',
    );
  });
  it('rejects demo access to an existing normal database even if it has no sources yet', () => {
    const directory = mkdtempSync(join(tmpdir(), 'fr-mode-normal-'));
    try {
      const normal = createApp({ dataDir: directory, demo: false });
      normal.locals.context.close();
      expect(() => createApp({ dataDir: directory, demo: true })).toThrow(/veri modu/i);
      const reopened = createApp({ dataDir: directory, demo: false });
      expect(reopened.locals.context.db.prepare('SELECT id FROM sources').all()).toHaveLength(0);
      reopened.locals.context.close();
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
  it('rejects normal access to demo-seeded data and keeps both data and mode provenance intact', () => {
    const directory = mkdtempSync(join(tmpdir(), 'fr-mode-demo-'));
    try {
      const demo = createApp({ dataDir: directory, demo: true });
      demo.locals.context.close();
      expect(() => createApp({ dataDir: directory, demo: false })).toThrow(/veri modu/i);
      const reopened = createApp({ dataDir: directory, demo: true });
      expect(reopened.locals.context.db.prepare('SELECT id FROM sources').all()).toHaveLength(8);
      expect(
        JSON.parse(
          reopened.locals.context.db
            .prepare("SELECT value FROM settings WHERE key='dataMode'")
            .get().value,
        ),
      ).toBe('demo');
      reopened.locals.context.close();
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

describe('restore mode isolation', () => {
  it('rejects a valid demo backup in a normal workspace', async () => {
    const real = await setup({ demo: false });
    const demo = await setup({ demo: true });
    try {
      const realBackup = (await real.post('/api/backups')).body;
      const demoBackup = (await demo.post('/api/backups')).body;
      copyFileSync(
        join(demo.directory, 'backups', `${demoBackup.id}.sqlite`),
        join(real.directory, 'backups', `${realBackup.id}.sqlite`),
      );
      expect((await real.post('/api/restore/preview', { backupId: realBackup.id })).status).toBe(
        422,
      );
      expect((await real.get('/api/sources')).body.sources).toHaveLength(0);
    } finally {
      real.close();
      demo.close();
    }
  });
});

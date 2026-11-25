import { describe, expect, it } from 'vitest';
import type { Express } from 'express';
import { listenLocal } from '../../apps/server/src/listen';
describe('honest local startup', () => {
  it('reports a failed bind and closes resources without printing a ready URL or pairing code', () => {
    let closed = false,
      failed = false;
    const messages: string[] = [];
    const errors: string[] = [];
    const app = {
      locals: {
        context: {
          close() {
            closed = true;
          },
          demo: false,
          pairingCode: 'SECRET',
          dataDir: '/tmp',
        },
      },
      listen(_port: number, _host: string, callback: (error?: Error) => void) {
        callback(Object.assign(new Error('blocked'), { code: 'EPERM' }));
        return {};
      },
    } as unknown as Express;
    listenLocal(app, 4318, {
      log: (message) => messages.push(message),
      error: (message) => errors.push(message),
      onFailure: () => (failed = true),
    });
    expect(closed).toBe(true);
    expect(failed).toBe(true);
    expect(messages).toEqual([]);
    expect(errors[0]).toContain('EPERM');
    expect(errors[0]).not.toContain('SECRET');
  });
});

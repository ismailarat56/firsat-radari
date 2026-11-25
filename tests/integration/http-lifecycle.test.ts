import { describe, expect, it } from 'vitest';
import express from 'express';
import { request } from './http';
describe('in-process HTTP transport lifecycle', () => {
  it('finishes responses and destroys the fake incoming socket after a response', async () => {
    const app = express();
    let finished = false;
    let incoming: import('node:http').IncomingMessage | undefined;
    app.get('/health', (req, res) => {
      incoming = req;
      res.on('finish', () => (finished = true));
      res.json({ ok: true });
    });
    expect((await request(app).get('/health')).body).toEqual({ ok: true });
    expect(finished).toBe(true);
    expect(incoming?.destroyed).toBe(true);
    expect(incoming?.socket.destroyed).toBe(true);
  });
});

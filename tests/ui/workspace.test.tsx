// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../../apps/server/src/app';
import { request } from '../integration/http';
import { App } from '../../apps/web/src/App';
import { putJson } from '../../apps/server/src/db/database';
import { ToastProvider } from '../../apps/web/src/components/ui';
import { queryClient, setSessionToken } from '../../apps/web/src/lib/api';
import type { Opportunity } from '../../packages/shared/src/contracts';
import axe from 'axe-core';

let directory: string;
let app: ReturnType<typeof createApp>;
let agent: ReturnType<typeof request>;
let unhandled: string[];
function mount() {
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <App />
      </ToastProvider>
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'fr-ui-'));
  app = createApp({ dataDir: directory, demo: true, startScheduler: false });
  agent = request(app);
  unhandled = [];
  window.history.replaceState({}, '', '/');
  queryClient.clear();
  setSessionToken({ authenticated: false, demo: true });
  vi.stubGlobal('fetch', async (input: string | URL | Request, init?: RequestInit) => {
    const path = String(input);
    const method = (init?.method ?? 'GET').toLowerCase() as 'get' | 'post' | 'patch' | 'delete';
    if (!path.startsWith('/api/')) {
      unhandled.push(path);
      throw new Error(`Unexpected request ${path}`);
    }
    let pending = agent[method](path).set('Origin', 'http://127.0.0.1:4318');
    new Headers(init?.headers).forEach((value, name) => {
      pending = pending.set(name, value);
    });
    if (init?.body) pending.send(JSON.parse(String(init.body)));
    const res = await pending;
    return new Response(res.status === 204 ? null : res.text, {
      status: res.status,
      headers: { 'Content-Type': 'application/json' },
    });
  });
});
afterEach(() => {
  cleanup();
  queryClient.clear();
  vi.unstubAllGlobals();
  app.locals.context.close();
  rmSync(directory, { recursive: true, force: true });
});

describe('Real React → Express → SQLite workspace flow', () => {
  it('search keeps focus when a new query closes the reader', async () => {
    const user = userEvent.setup();
    mount();
    await screen.findByRole('region', { name: 'Fırsat listesi' });
    await user.click(screen.getAllByRole('button', { name: /^Kanıtı aç:/ })[0]);
    await screen.findByRole('region', { name: 'Kanıt okuyucusu' });
    const search = screen.getByRole('textbox', { name: 'Fırsatlarda ara' });
    await user.type(search, 'araştırma');
    expect((search as HTMLInputElement).value).toBe('araştırma');
    expect(document.activeElement).toBe(search);
  });
  it('restores source, status, ordering and selected evidence from the URL', async () => {
    const rows = app.locals.context.db.prepare('SELECT data FROM items').all() as {
      data: string;
    }[];
    const item = rows
      .map((row) => JSON.parse(row.data) as Opportunity)
      .find((row) => row.status === 'unread')!;
    window.history.replaceState(
      {},
      '',
      `/?view=inbox&source=${item.sourceId}&status=unread&sort=oldest&item=${item.id}`,
    );
    mount();
    const reader = await screen.findByRole('region', { name: 'Kanıt okuyucusu' });
    await within(reader).findByRole('heading', { name: item.title });
    const list = screen.getByRole('region', { name: 'Fırsat listesi' });
    const titles = within(list).getAllByRole('button', { name: /Kanıtı aç:/ });
    expect(titles.length).toBeGreaterThan(0);
    const allowed = rows
      .map((row) => JSON.parse(row.data) as Opportunity)
      .filter((row) => row.sourceId === item.sourceId && row.status === 'unread');
    expect(titles).toHaveLength(allowed.length);
    const user = userEvent.setup();
    await user.click(within(reader).getByRole('button', { name: 'Listeye dön' }));
    expect(window.location.search).toContain(`source=${item.sourceId}`);
    expect(window.location.search).toContain('status=unread');
    expect(window.location.search).toContain('sort=oldest');
    expect(window.location.search).not.toContain('item=');
  });
  it('returns to pairing after the server revokes an existing session', async () => {
    app.locals.context.close();
    rmSync(directory, { recursive: true, force: true });
    directory = mkdtempSync(join(tmpdir(), 'fr-expiry-'));
    app = createApp({
      dataDir: directory,
      demo: false,
      pairingCode: '12345678',
      startScheduler: false,
    });
    agent = request(app);
    const pair = await agent
      .post('/api/pair')
      .set('Origin', 'http://127.0.0.1:4318')
      .send({ code: '12345678' });
    setSessionToken(pair.body);
    mount();
    await screen.findByRole('region', { name: 'Fırsat listesi' });
    app.locals.context.db.prepare('DELETE FROM sessions').run();
    await act(async () => {
      await queryClient.invalidateQueries({ queryKey: ['items'] });
    });
    await screen.findByLabelText('Terminaldeki eşleştirme kodu');
  });
  it('opens explicit demo, shows server data and filters by search without inventing results', async () => {
    const user = userEvent.setup();
    mount();
    await screen.findByRole('heading', { name: 'Gelişmeler' });
    await screen.findByRole('region', { name: 'Fırsat listesi' });
    expect(screen.getByText('Örnek çalışma alanı')).toBeTruthy();
    const items = (await agent.get('/api/items')).body.items as Opportunity[];
    const item = items.find((i) => i.status === 'unread')!;
    await user.type(screen.getByRole('textbox', { name: 'Fırsatlarda ara' }), item.title);
    await screen.findByText(item.title, { selector: 'button' });
    expect(window.location.search).toContain('view=inbox');
    await user.clear(screen.getByRole('textbox', { name: 'Fırsatlarda ara' }));
    await user.type(
      screen.getByRole('textbox', { name: 'Fırsatlarda ara' }),
      'olmayantamamenfarklıbirduyuru',
    );
    await screen.findByRole('heading', { name: 'Bu filtrelerde bir fırsat yok' });
    expect(unhandled).toEqual([]);
  });
  it('saves evidence, confirms an explicit date, and preserves both after remount', async () => {
    const user = userEvent.setup();
    const rendered = mount();
    await screen.findByRole('region', { name: 'Fırsat listesi' });
    const all = (await agent.get('/api/items')).body.items as Opportunity[];
    const item = all.find(
      (i) =>
        i.status === 'unread' &&
        i.deadlineCandidates.some((c) => c.resolution === 'complete') &&
        !i.confirmedDeadline,
    )!;
    expect(item).toBeTruthy();
    await user.type(screen.getByRole('textbox', { name: 'Fırsatlarda ara' }), item.title);
    await user.click(await screen.findByText(item.title, { selector: 'button' }));
    const dialog = await screen.findByRole('region', { name: 'Kanıt okuyucusu' });
    await within(dialog).findByText('ÖNCEKİ GÖRÜNTÜ');
    await within(dialog).findByText('YENİ GÖRÜNTÜ');
    await user.click(within(dialog).getByRole('button', { name: 'Fırsatı kaydet' }));
    await within(dialog).findByRole('button', { name: 'Kaydedildi · Kaydı kaldır' });
    const date = within(dialog).getByLabelText('Onaylayacağın son tarih') as HTMLInputElement;
    expect(date.value).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    await user.click(
      within(dialog).getByRole('checkbox', { name: /Bu tarihi kaynaktan kontrol ettim/ }),
    );
    await user.click(within(dialog).getByRole('button', { name: 'Tarihi onayla' }));
    await within(dialog).findByText('Senin tarafından onaylandı');
    const saved = (await agent.get('/api/items')).body.items.find(
      (i: Opportunity) => i.id === item.id,
    ) as Opportunity;
    expect(saved.status).toBe('saved');
    expect(saved.confirmedDeadline?.dateOnly).toBe(date.value);
    rendered.unmount();
    queryClient.clear();
    mount();
    await screen.findByRole('heading', { name: 'Gelen kutusu' });
    await screen.findByRole('button', { name: item.title + ' kaydını kaldır' });
    expect((await agent.get(`/api/items/${item.id}/diff`)).body.after.id).toBeTruthy();
  });
  it.each([
    {
      resolution: 'missing_year',
      field: 'year',
      date: null,
      quote: 'Son başvuru: 30 Kasım',
      hint: 'Kaynakta yıl belirtilmemiş.',
    },
    {
      resolution: 'missing_timezone',
      field: 'timezone',
      date: '2027-11-30',
      quote: 'Son başvuru: 30 Kasım 2027 saat 17:00',
      hint: 'Kaynakta saat dilimi belirtilmemiş.',
    },
  ] as const)(
    'records user-supplied $field separately from source evidence',
    async ({ resolution, field, date, quote, hint }) => {
      const db = app.locals.context.db;
      const rows = db.prepare('SELECT data FROM items').all() as { data: string }[];
      const item = rows
        .map((r) => JSON.parse(r.data) as Opportunity)
        .find((i) => i.status === 'unread' && !i.confirmedDeadline)!;
      const changed = {
        ...item,
        deadlineCandidates: [{ ...item.deadlineCandidates[0], dateOnly: date, resolution, quote }],
      };
      putJson(db, 'items', item.id, changed);
      const user = userEvent.setup();
      mount();
      await screen.findByRole('region', { name: 'Fırsat listesi' });
      await user.type(screen.getByRole('textbox', { name: 'Fırsatlarda ara' }), item.title);
      await user.click(await screen.findByText(item.title, { selector: 'button' }));
      const dialog = await screen.findByRole('region', { name: 'Kanıt okuyucusu' });
      const input = await within(dialog).findByLabelText('Onaylayacağın son tarih');
      expect((input as HTMLInputElement).value).toBe(date ?? '');
      expect(within(dialog).getByText(hint)).toBeTruthy();
      fireEvent.change(input, { target: { value: '2027-11-30' } });
      await user.click(
        within(dialog).getByRole('checkbox', { name: /Bu tarihi kaynaktan kontrol ettim/ }),
      );
      await user.click(within(dialog).getByRole('button', { name: 'Tarihi onayla' }));
      await within(dialog).findByText('Senin tarafından onaylandı');
      const saved = (await agent.get('/api/items')).body.items.find(
        (i: Opportunity) => i.id === item.id,
      ) as Opportunity;
      expect(saved.confirmedDeadline?.userSuppliedFields).toContain(field);
      expect(saved.deadlineCandidates[0].dateOnly).toBe(date);
    },
  );
  it('uses an accessible named dialog with no structural WCAG violations', async () => {
    const user = userEvent.setup();
    mount();
    await screen.findByRole('region', { name: 'Fırsat listesi' });
    await user.click(screen.getByRole('button', { name: 'Kaynak ekle' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText(/Kaynak adı/)).toBeTruthy();
    const results = await axe.run(document.body, {
      rules: { 'color-contrast': { enabled: false } },
    });
    expect(results.violations.map((v) => `${v.id}: ${v.description}`)).toEqual([]);
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(
      document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.textContent,
    ).toContain('Kaynak ekle');
  });
  it('completes first-run pairing and three-source baseline → queued change → keyboard review → saved date', async () => {
    app.locals.context.close();
    rmSync(directory, { recursive: true, force: true });
    directory = mkdtempSync(join(tmpdir(), 'fr-first-run-'));
    let revision = 1;
    app = createApp({
      dataDir: directory,
      demo: false,
      pairingCode: '12345678',
      startScheduler: false,
      fetcher: async ({ url }) => ({
        status: 200,
        url,
        contentType: 'application/rss+xml',
        etag: null,
        lastModified: null,
        body: `<rss><channel><title>Test kaynağı</title><item><guid>stable-item</guid><title>Araştırma Bursu — ${new URL(url).hostname}</title><link>https://example.org/burs</link><description>Öğrenciler için destek. Son başvuru ${revision === 1 ? '24' : '30'} Kasım 2026.</description></item></channel></rss>`,
      }),
    });
    agent = request(app);
    const user = userEvent.setup();
    mount();
    await user.type(await screen.findByLabelText('Terminaldeki eşleştirme kodu'), '12345678');
    await user.click(screen.getByRole('button', { name: 'Çalışma alanımı aç' }));
    await screen.findByRole('heading', { name: 'Gelişmeler' });
    for (let i = 1; i <= 3; i++) {
      const actions = document.querySelector('.page-actions') as HTMLElement;
      await user.click(within(actions).getByRole('button', { name: 'Kaynak ekle' }));
      const dialog = await screen.findByRole('dialog');
      await user.type(within(dialog).getByLabelText(/Kaynak adı/), `Test Kurumu ${i}`);
      await user.type(
        within(dialog).getByLabelText(/Kaynak bağlantısı/),
        `https://kurum${i}.example.org/feed`,
      );
      await user.click(within(dialog).getByRole('button', { name: 'Kaydet ve önizle' }));
      await within(dialog).findByText('1 öğe');
      await user.click(
        within(dialog).getByRole('button', { name: 'Başlangıç görüntüsünü onayla' }),
      );
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    }
    await screen.findByText('3 / 3 kaynak hazır');
    expect((await agent.get('/api/summary')).body.unreadCount).toBe(0);
    revision = 2;
    await user.click(screen.getByRole('button', { name: 'Radarı yenile' }));
    await screen.findByRole('region', { name: 'Tarama kuyruğu' });
    await act(async () => {
      await app.locals.context.scheduler.tick();
      await queryClient.invalidateQueries();
    });
    expect((await agent.get('/api/summary')).body.unreadCount).toBe(3);
    const title = await screen.findByText('Araştırma Bursu — kurum1.example.org', {
      selector: 'button',
    });
    title.focus();
    await user.keyboard('{Enter}');
    const dialog = await screen.findByRole('region', { name: 'Kanıt okuyucusu' });
    await within(dialog).findByText('ÖNCEKİ GÖRÜNTÜ');
    expect(dialog.querySelector('.diff-column.before')?.textContent).toContain('24 Kasım 2026');
    expect(dialog.querySelector('.diff-column.after')?.textContent).toContain('30 Kasım 2026');
    await user.click(within(dialog).getByRole('button', { name: 'Fırsatı kaydet' }));
    await within(dialog).findByRole('button', { name: 'Kaydedildi · Kaydı kaldır' });
    await user.click(
      within(dialog).getByRole('checkbox', { name: /Bu tarihi kaynaktan kontrol ettim/ }),
    );
    await user.click(within(dialog).getByRole('button', { name: 'Tarihi onayla' }));
    await within(dialog).findByText('Senin tarafından onaylandı');
    expect((await agent.get('/api/summary')).body.confirmedDeadlineCount).toBe(1);
    expect((await agent.get('/api/settings')).body.onboardingComplete).toBe(true);
  });
  it('requires a reason for irrelevant decisions and can restore archived items', async () => {
    const user = userEvent.setup();
    mount();
    await screen.findByRole('region', { name: 'Fırsat listesi' });
    await user.click(screen.getAllByRole('button', { name: /^Kanıtı aç:/ })[0]);
    const dialog = await screen.findByRole('region', { name: 'Kanıt okuyucusu' });
    await within(dialog).findByRole('button', { name: 'İlgisiz' });
    await user.click(within(dialog).getByRole('button', { name: 'İlgisiz' }));
    expect(
      (within(dialog).getByRole('button', { name: 'Kararı kaydet' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    await user.selectOptions(
      within(dialog).getByLabelText('Neden ilgisiz?'),
      'İlgi alanıma uygun değil',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Kararı kaydet' }));
    await within(dialog).findByText('İlgisiz olarak işaretlendi');
    await user.click(within(dialog).getByRole('button', { name: 'Gelen kutusuna geri al' }));
    await within(dialog).findByText('Henüz karar vermedin');
  });
});

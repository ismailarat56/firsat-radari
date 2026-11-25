import { test, expect, type Page } from '@playwright/test';
import axe from 'axe-core';
import type { Opportunity } from '../../packages/shared/src/contracts';

test.use({ baseURL: 'http://127.0.0.1:4330' });
const reader = (page: Page) => page.getByRole('region', { name: 'Kanıt okuyucusu' });
async function ready(page: Page, path = '/') {
  await page.goto(path);
  await expect(page.locator('.workspace-skeleton')).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: 'Fırsatlarda ara' })).toBeVisible();
}
async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}
async function accessibility(page: Page, name: string) {
  await page.route('**/__fixture/axe.js', (route) =>
    route.fulfill({ contentType: 'text/javascript', body: axe.source }),
  );
  await page.addScriptTag({ url: '/__fixture/axe.js' });
  const result = await page.evaluate(async () => {
    const engine = (window as unknown as { axe: typeof axe }).axe;
    const report = await engine.run(document.body, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] },
    });
    return report.violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => ({ target: n.target, summary: n.failureSummary })),
    }));
  });
  expect(result, name).toEqual([]);
}

test('source/status/sort URL, history, selection, scroll and keyboard return stay together', async ({
  page,
}) => {
  await ready(page);
  await page.getByRole('button', { name: 'Liste filtrelerini aç' }).click();
  const filter = page.getByRole('dialog');
  await filter.getByLabel('Karar durumu').selectOption('unread');
  await filter.getByRole('button', { name: /sonucu göster/ }).click();
  await page.getByLabel('Sıralama', { exact: true }).selectOption('oldest');
  const originalUrl = page.url();
  expect(originalUrl).toContain('status=unread');
  expect(originalUrl).toContain('sort=oldest');
  const title = page.locator('.opportunity-title').last();
  await title.scrollIntoViewIfNeeded();
  const titleName = await title.getAttribute('aria-label');
  const scroll = await page.locator('.opportunity-list').evaluate((element) => element.scrollTop);
  await title.focus();
  await page.keyboard.press('Enter');
  await expect(reader(page)).toBeFocused();
  await expect(reader(page).locator('.diff-column.after')).toBeVisible();
  expect(page.url()).toContain('item=');
  await page.goBack();
  await expect(reader(page)).toBeHidden();
  expect(page.url()).toBe(originalUrl);
  await expect(page.getByRole('button', { name: titleName!, exact: true })).toBeFocused();
  expect(await page.locator('.opportunity-list').evaluate((element) => element.scrollTop)).toBe(
    scroll,
  );
  await page.goForward();
  await expect(reader(page)).toBeVisible();
  await page.reload();
  await expect(reader(page)).toBeVisible();
  await reader(page).getByRole('button', { name: 'Listeye dön' }).click();
  await expect(reader(page)).toBeHidden();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: titleName!, exact: true }).scrollIntoViewIfNeeded();
  const mobileScroll = await page
    .locator('.opportunity-list')
    .evaluate((element) => element.scrollTop);
  await page.getByRole('button', { name: titleName!, exact: true }).click();
  await expect(page.locator('.desk-content')).toBeHidden();
  await reader(page).getByRole('button', { name: 'Listeye dön' }).click();
  await expect(reader(page)).toBeHidden();
  expect(page.url()).toBe(originalUrl);
  expect(await page.locator('.opportunity-list').evaluate((element) => element.scrollTop)).toBe(
    mobileScroll,
  );
  await noOverflow(page);
});

test('expanding evidence preserves an unfinished date confirmation', async ({ page }) => {
  await ready(page);
  const items = (await (await page.request.get('/api/items')).json()).items as Opportunity[];
  const item = items.find(
    (value) =>
      !value.confirmedDeadline && value.deadlineCandidates.length && value.status === 'unread',
  )!;
  await ready(page, `/?item=${item.id}`);
  const date = reader(page).getByLabel('Onaylayacağın son tarih');
  await date.fill('2027-11-30');
  await reader(page)
    .getByRole('checkbox', { name: /Bu tarihi kaynaktan kontrol ettim/ })
    .check();
  await reader(page)
    .getByRole('button', { name: /Tam genişlikte incele/ })
    .click();
  await expect(page.locator('.desk-content')).toBeHidden();
  await expect(date).toHaveValue('2027-11-30');
  await expect(reader(page).getByRole('checkbox')).toBeChecked();
  const before = await reader(page).locator('.diff-column.before').boundingBox();
  const after = await reader(page).locator('.diff-column.after').boundingBox();
  expect(after!.x).toBeGreaterThan(before!.x + before!.width);
  await page.screenshot({
    path: 'artifacts/frontend-redesign/after/expanded-evidence-1440.png',
    fullPage: true,
  });
  await reader(page)
    .getByRole('button', { name: /Dar okuyucuya dön/ })
    .click();
  await expect(date).toHaveValue('2027-11-30');
  // A date candidate remains outside the calendar until the real confirmation API succeeds.
  const persisted = (await (await page.request.get('/api/items')).json()).items as Opportunity[];
  expect(persisted.find((value) => value.id === item.id)?.confirmedDeadline).toBeNull();
});

test('four widths: overflow, contrast, focus, drawers, reduced motion and companion views', async ({
  page,
}) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  for (const width of [1440, 1280, 768, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await ready(page);
    await expect(page.locator('.opportunity-title').first()).toBeVisible();
    await noOverflow(page);
    await accessibility(page, `workspace ${width}`);
    await page.locator('.opportunity-title').first().click();
    await expect(reader(page).locator('.detail-hero h2')).toBeVisible();
    await noOverflow(page);
    await accessibility(page, `reader ${width}`);
    await reader(page).getByRole('button', { name: 'Listeye dön' }).click();
    await expect(reader(page)).toBeHidden();
    await page.getByRole('button', { name: 'Liste filtrelerini aç' }).click();
    await expect(page.getByRole('dialog').getByLabel('Kategori')).toBeFocused();
    await noOverflow(page);
    await accessibility(page, `filters ${width}`);
    await page.screenshot({
      path: `artifacts/frontend-redesign/after/filters-${width}.png`,
      fullPage: true,
    });
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Liste filtrelerini aç' })).toBeFocused();
    if (width <= 768) {
      await page.getByRole('button', { name: 'Ana menüyü aç' }).click();
      const menu = page.getByRole('dialog');
      await expect(menu.getByRole('button', { name: 'Fırsat Radarı ana sayfa' })).toBeFocused();
      await page.keyboard.press('Shift+Tab');
      expect(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))).toBe(
        true,
      );
      await page.screenshot({
        path: `artifacts/frontend-redesign/after/navigation-${width}.png`,
        fullPage: true,
      });
      await page.keyboard.press('Escape');
      await expect(page.getByRole('button', { name: 'Ana menüyü aç' })).toBeFocused();
    }
    for (const view of ['sources', 'calendar', 'saved', 'notifications', 'settings']) {
      await ready(page, `/?view=${view}`);
      await expect(page.locator('.workspace-skeleton')).toHaveCount(0);
      await noOverflow(page);
      await accessibility(page, `${view} ${width}`);
      await page.screenshot({
        path: `artifacts/frontend-redesign/after/${view}-${width}.png`,
        fullPage: true,
      });
    }
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await ready(page);
  await page.locator('.opportunity-title').first().focus();
  expect(
    await page
      .locator('.opportunity-title')
      .first()
      .evaluate((node) => getComputedStyle(node).outlineStyle),
  ).not.toBe('none');
  expect(
    await page
      .locator('.opportunity-card')
      .first()
      .evaluate((node) => parseFloat(getComputedStyle(node).transitionDuration)),
  ).toBeLessThanOrEqual(0.001);
  await page.keyboard.press('Control+k');
  await expect(page.getByRole('textbox', { name: 'Fırsatlarda ara' })).toBeFocused();
  expect(errors).toEqual([]);
});

test('loading, empty and no-results states at all four widths', async ({ page }) => {
  await page.route('**/api/items', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 700));
    await route.fulfill({ json: { items: [] } });
  });
  for (const width of [1440, 1280, 768, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/');
    await expect(page.locator('.workspace-skeleton')).toBeVisible();
    await page.screenshot({ path: `artifacts/frontend-redesign/after/loading-${width}.png` });
    await expect(page.getByRole('heading', { name: 'Henüz yeni bir gelişme yok' })).toBeVisible();
    await noOverflow(page);
    await page.screenshot({ path: `artifacts/frontend-redesign/after/empty-${width}.png` });
    await page.getByRole('textbox', { name: 'Fırsatlarda ara' }).fill('olmayan kayıt');
    await expect(
      page.getByRole('heading', { name: 'Bu filtrelerde bir fırsat yok' }),
    ).toBeVisible();
    await noOverflow(page);
  }
});

test('connection and source preview failures preserve truthful states and form input', async ({
  page,
}) => {
  await ready(page);
  await page.getByRole('button', { name: 'Kaynak ekle', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Kaynak adı').fill('Önizleme hata testi');
  await dialog.getByLabel('Kaynak bağlantısı').fill('https://example.org/failure-test');
  await page.route('**/api/sources/*/preview', (route) =>
    route.fulfill({
      status: 503,
      json: { error: { code: 'UNAVAILABLE', message: 'Test: kaynak şu anda erişilemiyor.' } },
    }),
  );
  await dialog.getByRole('button', { name: 'Kaydet ve önizle' }).click();
  await expect(dialog.getByText('Test: kaynak şu anda erişilemiyor.')).toBeVisible();
  await expect(dialog.getByLabel('Kaynak adı')).toHaveValue('Önizleme hata testi');
  await expect(dialog.getByLabel('Kaynak bağlantısı')).toHaveValue(
    'https://example.org/failure-test',
  );
  await page.screenshot({
    path: 'artifacts/frontend-redesign/after/source-preview-error.png',
    fullPage: true,
  });
  await page.keyboard.press('Escape');
  await page.route('**/api/items', (route) => route.abort('failed'));
  await page.evaluate(() => {
    window.dispatchEvent(new Event('visibilitychange'));
  });
  await page.reload();
  await expect(page.getByRole('alert')).toContainText('Yerel sunucuya ulaşılamıyor');
  await page.screenshot({
    path: 'artifacts/frontend-redesign/after/connection-error.png',
    fullPage: true,
  });
  await page.unroute('**/api/items');
  await page.getByRole('button', { name: 'Tekrar dene' }).click();
  await expect(page.locator('.opportunity-title').first()).toBeVisible();
  const sources = (await (await page.request.get('/api/sources')).json()).sources as {
    id: string;
    name: string;
  }[];
  const added = sources.find((source) => source.name === 'Önizleme hata testi');
  const session = await (await page.request.get('/api/session')).json();
  if (added)
    await page.request.delete(`/api/sources/${added.id}`, {
      headers: { Origin: 'http://127.0.0.1:4330', 'X-CSRF-Token': session.csrfToken },
    });
});

test('long Turkish titles, removed-only evidence and an outdated confirmed date remain explicit', async ({
  page,
}) => {
  await ready(page);
  const items = (await (await page.request.get('/api/items')).json()).items as Opportunity[];
  const original = items.find((item) => item.confirmedDeadline)!;
  const title =
    'Üniversiteler Arası Öğrenci Araştırmaları ve Sürdürülebilir Teknoloji Geliştirme Programı — Başvuru Koşulları, Değerlendirme Süreci ve Türkçe Açıklamalar '.repeat(
      3,
    );
  const changed = {
    ...original,
    title,
    changeType: 'removed',
    confirmedDeadline: { ...original.confirmedDeadline!, reviewRequired: true },
  };
  await page.route('**/api/items', (route) => route.fulfill({ json: { items: [changed] } }));
  await page.route(`**/api/items/${original.id}/diff`, async (route) => {
    const response = await route.fetch();
    const evidence = await response.json();
    await route.fulfill({
      json: {
        ...evidence,
        item: changed,
        after: { ...evidence.after, content: '' },
        changes: [{ kind: 'removed', text: original.content }],
      },
    });
  });
  await page.route('**/api/sources', async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    await route.fulfill({
      json: {
        sources: body.sources.map((source: { id: string }) =>
          source.id === original.sourceId
            ? { ...source, status: 'error', lastError: 'Test: son kontrolde bağlantı kesildi.' }
            : source,
        ),
      },
    });
  });
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await ready(page);
    const rowTitle = page.locator('.opportunity-title');
    await expect(rowTitle).toHaveText(title.trim());
    expect(await rowTitle.evaluate((node) => node.getBoundingClientRect().height)).toBeLessThan(50);
    await rowTitle.click();
    await expect(reader(page).getByRole('heading', { name: title.trim() })).toBeVisible();
    await expect(reader(page).getByText(/Başvurunun kapandığı sonucuna varılamaz/)).toBeAttached();
    await expect(reader(page).getByText(/Son kontrol tamamlanamadı/)).toBeAttached();
    await expect(reader(page).getByText(/Bu görüntüde içerik yok/)).toBeAttached();
    await reader(page)
      .getByText(/Önceki onayın:/)
      .scrollIntoViewIfNeeded();
    await expect(reader(page).getByText(/Önceki onayın:/)).toBeVisible();
    await noOverflow(page);
    await page.screenshot({
      path: `artifacts/frontend-redesign/after/removed-and-review-${width}.png`,
      fullPage: true,
    });
  }
});

test('typing a new search while the reader is open keeps focus in search', async ({ page }) => {
  for (const method of ['click', 'keyboard']) {
    await ready(page);
    await page.locator('.opportunity-title').first().click();
    await expect(reader(page)).toBeVisible();
    const search = page.getByRole('textbox', { name: 'Fırsatlarda ara' });
    if (method === 'click') await search.click();
    else await page.keyboard.press('Control+k');
    await expect(search).toBeFocused();
    await search.pressSequentially('araştırma');
    await expect(search).toHaveValue('araştırma');
    await expect(search).toBeFocused();
    await expect(reader(page)).toBeHidden();
  }
});

import { test, expect } from '@playwright/test';

test.use({ baseURL: 'http://127.0.0.1:4330' });
test('isolated demo: workspace, evidence and companion screens at four widths', async ({
  page,
}) => {
  const phase = process.env.FR_CAPTURE_PHASE === 'before' ? 'before' : 'after';
  await page.goto('/');
  await expect(page.getByText('Örnek çalışma alanı', { exact: true })).toBeVisible();
  await expect(page.locator('.opportunity-title').first()).toBeVisible();
  for (const width of [1440, 1280, 768, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.screenshot({
      path: `artifacts/frontend-redesign/${phase}/workspace-${width}.png`,
      fullPage: true,
    });
    await page.locator('.opportunity-title').first().click();
    await expect(page.getByText('ÖNCEKİ GÖRÜNTÜ', { exact: true })).toBeVisible();
    await page.screenshot({
      path: `artifacts/frontend-redesign/${phase}/reader-${width}.png`,
      fullPage: true,
    });
    await page.keyboard.press('Escape');
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  for (const view of ['sources', 'calendar', 'saved', 'notifications', 'settings']) {
    await page.goto(`/?view=${view}`);
    await expect(page.locator('.page-heading h1')).toBeVisible();
    await expect(page.locator('.workspace-skeleton')).toHaveCount(0);
    await page.screenshot({
      path: `artifacts/frontend-redesign/${phase}/${view}.png`,
      fullPage: true,
    });
  }
  await page.goto('/?view=sources');
  await page
    .locator('.page-actions')
    .getByRole('button', { name: 'Kaynak ekle', exact: true })
    .click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.screenshot({
    path: `artifacts/frontend-redesign/${phase}/source-form.png`,
    fullPage: true,
  });
});

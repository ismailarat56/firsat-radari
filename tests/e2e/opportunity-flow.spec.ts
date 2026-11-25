import { test, expect } from '@playwright/test';

test('üç kaynak → doğrulanmış başlangıç → fark → karar → tarih → kalıcılık', async ({
  page,
  request,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await page.getByLabel('Terminaldeki eşleştirme kodu').fill('65432100');
  await page.getByRole('button', { name: 'Çalışma alanımı aç' }).click();
  await expect(page.getByRole('heading', { name: 'Gelişmeler' })).toBeVisible();
  for (let index = 1; index <= 3; index++) {
    await page
      .locator('.page-actions')
      .getByRole('button', { name: 'Kaynak ekle', exact: true })
      .click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Kaynak adı').fill(`Test Kurumu ${index}`);
    await dialog.getByLabel('Kaynak bağlantısı').fill(`https://kurum${index}.example.org/feed`);
    await dialog.getByRole('button', { name: 'Kaydet ve önizle' }).click();
    await expect(dialog.getByText('1 öğe')).toBeVisible();
    await dialog.getByRole('button', { name: 'Başlangıç görüntüsünü onayla' }).click();
    await expect(dialog).toBeHidden();
  }
  await expect(page.getByText('3 / 3 kaynak hazır')).toBeVisible();
  await expect(page.getByRole('button', { name: '0 okunmamış gelişme' })).toBeVisible();
  await request.post('/__fixture/change');
  await page.getByRole('button', { name: 'Radarı yenile' }).click();
  await expect
    .poll(async () => {
      const result = await page.request.get('/api/summary');
      return (await result.json()).unreadCount;
    })
    .toBe(3);
  await page.reload();
  await expect(page.getByRole('button', { name: '3 okunmamış gelişme' })).toBeVisible();
  const title = page.locator('.opportunity-title').first();
  await page.keyboard.press('Tab');
  await title.focus();
  expect(await title.evaluate((node) => getComputedStyle(node).outlineStyle)).not.toBe('none');
  await page.keyboard.press('Enter');
  const detail = page.getByRole('region', { name: 'Kanıt okuyucusu' });
  await expect(detail.getByText('ÖNCEKİ GÖRÜNTÜ')).toBeVisible();
  await expect(detail.getByText('YENİ GÖRÜNTÜ')).toBeVisible();
  await expect(detail.locator('.diff-column.before')).toContainText('24 Kasım 2026');
  await expect(detail.locator('.diff-column.after')).toContainText('30 Kasım 2026');
  await detail.getByRole('button', { name: 'Fırsatı kaydet', exact: true }).click();
  await expect(detail.getByRole('button', { name: 'Kaydedildi · Kaydı kaldır' })).toBeVisible();
  await detail.getByRole('checkbox', { name: /Bu tarihi kaynaktan kontrol ettim/ }).check();
  await detail.getByRole('button', { name: 'Tarihi onayla' }).click();
  await expect(detail.getByText('Senin tarafından onaylandı')).toBeVisible();
  await page
    .getByRole('region', { name: 'Kanıt okuyucusu' })
    .getByRole('button', { name: 'Listeye dön' })
    .click();
  await expect(page.getByRole('region', { name: 'Kanıt okuyucusu' })).toBeHidden();
  await page.reload();
  await page.getByRole('button', { name: /^Kaydedilenler/ }).click();
  await expect(page.locator('.opportunity-card')).toHaveCount(1);
  await page.locator('.opportunity-title').click();
  await expect(
    page
      .getByRole('region', { name: 'Kanıt okuyucusu' })
      .getByText('30 Kasım 2026', { exact: true }),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Takvim', exact: true }).click();
  await page.getByRole('button', { name: 'Ay görünümü', exact: true }).click();
  const current = new Date();
  const monthOffset = (2026 - current.getFullYear()) * 12 + 10 - current.getMonth();
  for (let index = 0; index < Math.abs(monthOffset); index++) {
    await page.getByRole('button', { name: monthOffset > 0 ? 'Sonraki ay' : 'Önceki ay' }).click();
  }
  await page.getByRole('button', { name: '30 Kasım 2026, 1 son tarih' }).click();
  const agendaItem = page.locator('.agenda-item');
  await expect(agendaItem).toHaveCount(1);
  await agendaItem.click();
  await expect(detail).toBeVisible();
  await expect(detail.getByRole('button', { name: /Dar okuyucuya dön/ })).toHaveCount(0);
  await detail.getByRole('button', { name: 'Listeye dön' }).click();
  await expect(agendaItem).toBeFocused();
  await expect(page.getByRole('button', { name: 'Ay görünümü', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByRole('button', { name: '30 Kasım 2026, 1 son tarih' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('button', { name: /^Kaydedilenler/ }).click();
  for (const width of [1440, 1280, 768, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect(page.locator('.page-heading h1')).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.screenshot({
      path: `artifacts/frontend-redesign/after/saved-${width}.png`,
      fullPage: true,
    });
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const duration = await page
    .locator('.opportunity-card')
    .first()
    .evaluate((node) => parseFloat(getComputedStyle(node).animationDuration));
  expect(duration).toBeLessThanOrEqual(0.001);
  await page.getByRole('button', { name: 'Ana menüyü aç' }).click();
  await expect(page.getByRole('button', { name: 'Fırsat Radarı ana sayfa' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Ana menüyü aç' })).toBeFocused();
  await expect(page.getByRole('complementary', { name: 'Ana navigasyon' })).toBeHidden();
  expect(errors).toEqual([]);
});

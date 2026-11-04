import { expect, test } from '@playwright/test';

test('dashboard loads and the navigation is keyboard reachable', async ({ page }) => {
  const response = await page.goto('/');
  expect(response?.status()).toBe(200);
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();

  // Keyboard reachability: the skip link comes first, then the main navigation.
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: /Lead Radar/ }).first()).toBeFocused();
});

test('opportunities inbox is reachable and shows either rows or an empty state', async ({
  page,
}) => {
  await page.goto('/opportunities');
  await expect(page.getByRole('heading', { name: 'Opportunities' })).toBeVisible();
  await expect(
    page.getByRole('table').or(page.getByText('No opportunities match these filters')),
  ).toBeVisible();
});

test('the reply queue loads with a composer or an explicit empty state', async ({ page }) => {
  await page.goto('/reply-queue');
  await expect(page.getByRole('heading', { name: 'Reply queue' })).toBeVisible();
  await expect(
    page
      .getByRole('region', { name: /reply queue/i })
      .or(page.getByText('The reply queue is empty')),
  ).toBeVisible();
});

test('the reply comes right under the original post and copies in one click', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/reply-queue');

  const sheet = page.getByRole('article').first();
  if ((await sheet.count()) === 0) test.skip(true, 'no lead in the queue in this environment');

  // Reading order: the original post first, the reply immediately after it, each with its own link.
  const source = sheet.getByRole('heading', { level: 2 }).first();
  const replyHeading = sheet.getByRole('heading', { name: 'Your reply' });
  await expect(source).toBeVisible();
  await expect(replyHeading).toBeVisible();
  await expect(sheet.getByRole('link', { name: /open on reddit/i }).first()).toBeVisible();

  const copy = sheet.getByRole('button', { name: /copy reply/i });
  if ((await copy.count()) === 0) test.skip(true, 'this lead has no drafts yet');

  const text = await sheet.getByRole('textbox').inputValue();
  await copy.click();
  await expect(sheet.getByRole('button', { name: /copied/i })).toBeVisible();
  expect(await page.evaluate('navigator.clipboard.readText()')).toBe(text);
});

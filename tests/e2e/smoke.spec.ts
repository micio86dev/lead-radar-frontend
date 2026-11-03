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

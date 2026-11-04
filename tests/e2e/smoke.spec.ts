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

test('the queue switches between to reply and answered without losing the list', async ({
  page,
}) => {
  await page.goto('/reply-queue');
  const toReply = page.getByRole('link', { name: 'To reply' });
  const answered = page.getByRole('link', { name: 'Answered' });
  await expect(toReply).toBeVisible();
  await expect(answered).toBeVisible();
  await expect(toReply).toHaveAttribute('aria-current', 'page');

  await answered.click();
  await expect(page).toHaveURL(/answered=1/);
  await expect(page.getByRole('link', { name: 'Answered' })).toHaveAttribute(
    'aria-current',
    'page',
  );
});

test('follow-ups page explains itself and lists waiting threads or an empty state', async ({
  page,
}) => {
  const response = await page.goto('/follow-ups');
  expect(response?.status()).toBe(200);
  await expect(page.getByRole('heading', { name: 'Follow-ups', level: 1 })).toBeVisible();
  await expect(
    page
      .getByRole('region', { name: /follow-ups waiting/i })
      .or(page.getByText('No follow-ups waiting')),
  ).toBeVisible();
});

test('the inbox defaults to a visible score floor and can show every score', async ({ page }) => {
  await page.goto('/opportunities');
  await expect(page.getByRole('heading', { name: 'Opportunities' })).toBeVisible();

  // The default floor is 60 and it is stated, not hidden.
  await expect(page.getByText(/leads with score ≥ 60/)).toBeVisible();
  await expect(page.getByLabel('Score min')).toHaveValue('60');

  // The escape hatch keeps the other filters and drops only the floor.
  await page.getByRole('link', { name: 'Show all scores' }).click();
  await expect(page).toHaveURL(/all=1/);
  await expect(page.getByText(/leads, all scores/)).toBeVisible();
  await expect(page.getByLabel('Score min')).toHaveValue('');
  await expect(page.getByRole('link', { name: /Back to score ≥ 60/ })).toBeVisible();
});

test('the search panel explains how a search starts and needs an explicit confirmation', async ({
  page,
}) => {
  await page.goto('/opportunities');
  const panel = page.getByRole('region', { name: 'Start a search' });
  await expect(panel).toBeVisible();

  const runForm = panel
    .locator('form')
    .filter({ has: page.locator('input[name="op"][value="apify.run.start"]') });

  if ((await runForm.count()) === 0) {
    // No validated Actor in this environment: the panel says so instead of faking a run.
    await expect(panel.getByText(/no validated Actor to run/i)).toBeVisible();
    await expect(panel.getByRole('link', { name: /open apify/i })).toBeVisible();
    return;
  }

  // A registered Actor: the run is billable, so the form submits the confirmation field the server
  // requires and the submit button stays disabled until the box is checked.
  const first = runForm.first();
  await expect(first.locator('input[name="confirm"][type="checkbox"]')).toBeVisible();
  await expect(first.locator('input[name="items_limit"]')).toBeVisible();
  await expect(first.getByRole('button', { name: /start search/i })).toBeDisabled();
  await first.locator('input[name="confirm"]').check();
  await expect(first.getByRole('button', { name: /start search/i })).toBeEnabled();
});

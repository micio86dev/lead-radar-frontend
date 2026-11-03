import { expect, test } from '@playwright/test';

/**
 * End-to-end pipeline scenario: import a conversation through the API, wait for the worker to create
 * a lead, then follow it in the dashboard. Requires the local stack (`scripts/e2e-local.sh`).
 */
const API_URL = process.env.E2E_API_URL ?? 'http://localhost:8080';
const API_TOKEN = process.env.E2E_API_TOKEN ?? 'dev-local-token';

test('a manual import reaches the inbox and the review queue', async ({ page, request }) => {
  const published = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const content = `Our recruiting team cannot interview candidates who only speak Spanish. We need real-time translation in the interviews, any suggestions? This is an international hiring problem. Ref ${Date.now()}`;

  const imported = await request.post(`${API_URL}/api/v1/import/json`, {
    headers: { authorization: `Bearer ${API_TOKEN}` },
    data: {
      source_name: 'manual-import',
      posts: [
        {
          external_id: `e2e-${Date.now()}`,
          title: 'Multilingual interviews block our hiring',
          content,
          url: 'https://example.invalid/e2e',
          author: 'e2e-author',
          community: 'recruiting',
          language: 'en',
          published_at: published,
          engagement: { comments: 3, upvotes: 7, shares: 0 },
        },
      ],
    },
  });
  expect(imported.ok()).toBeTruthy();

  // The worker is asynchronous: poll the inbox until the lead appears.
  let leadId: string | undefined;
  for (let attempt = 0; attempt < 30 && !leadId; attempt += 1) {
    const response = await request.get(
      `${API_URL}/api/v1/opportunities?q=Multilingual%20interviews`,
      {
        headers: { authorization: `Bearer ${API_TOKEN}` },
      },
    );
    const body = (await response.json()) as { items: { id: string }[] };
    leadId = body.items[0]?.id;
    if (!leadId) await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  expect(leadId, 'the worker should create a lead').toBeTruthy();

  await page.goto('/opportunities');
  await expect(page.getByRole('heading', { name: 'Opportunities' })).toBeVisible();
  await page.goto(`/opportunities/${leadId}`);
  await expect(page.getByRole('heading', { name: /Multilingual interviews/ })).toBeVisible();
  await expect(page.getByText('Original content')).toBeVisible();
  await expect(page.getByText('Score breakdown')).toBeVisible();

  // Comment drafting is a queued action; the UI must show the explicit button.
  await expect(page.getByRole('button', { name: 'Draft three comment variants' })).toBeVisible();

  // Review queue renders without errors even when empty.
  await page.goto('/review');
  await expect(page.getByRole('heading', { name: 'Review Queue' })).toBeVisible();

  // No automatic publication surface exists anywhere in the UI.
  await page.goto(`/opportunities/${leadId}`);
  const publishButtons = await page.getByRole('button', { name: /^Publish/ }).count();
  expect(publishButtons).toBe(0);
});

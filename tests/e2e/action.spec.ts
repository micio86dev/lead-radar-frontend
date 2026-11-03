import { expect, test } from '@playwright/test';

/**
 * The dashboard action endpoint is the only way the browser reaches the backend. These tests pin its
 * transport policy: non-browser clients without an Origin are accepted, cross-site origins are
 * refused, and errors are JSON with a 4xx status instead of an HTML page.
 */

test('a form POST without an Origin header is accepted (non-browser client)', async ({
  request,
}) => {
  const response = await request.post('/api/action', {
    form: { op: 'not-a-real-operation' },
  });
  // Reaching our handler at all (instead of Astro's CSRF 403) is the point of this test.
  expect(response.status()).toBe(400);
  const body = (await response.json()) as { error: { code: string } };
  expect(body.error.code).toBe('bad_request');
});

test('a cross-site Origin is refused', async ({ request }) => {
  const response = await request.post('/api/action', {
    headers: { origin: 'http://evil.example' },
    form: { op: 'job.retry', id: '00000000-0000-0000-0000-000000000000' },
  });
  expect(response.status()).toBe(403);
  const body = (await response.json()) as { error: { code: string } };
  expect(body.error.code).toBe('forbidden');
});

test('JSON bodies are supported and reach the API', async ({ request }) => {
  const response = await request.post('/api/action', {
    data: { op: 'job.retry', id: '00000000-0000-0000-0000-000000000000' },
  });
  // A job that cannot be retried answers 409 and the endpoint relays it as JSON.
  expect(response.status()).toBe(409);
  const body = (await response.json()) as { error: { code: string } };
  expect(body.error.code).toBe('conflict');
});

test('an invalid import payload is rejected without touching the API', async ({ request }) => {
  const response = await request.post('/api/action', {
    data: { op: 'import.json', payload: '{not json' },
  });
  expect(response.status()).toBe(422);
  const body = (await response.json()) as { error: { code: string; message: string } };
  expect(body.error.code).toBe('validation_failed');
  expect(body.error.message).toContain('payload is not valid JSON');
});

test('an unsupported content type is answered with 415', async ({ request }) => {
  const response = await request.post('/api/action', {
    headers: { 'content-type': 'text/plain' },
    data: 'op=job.retry',
  });
  expect(response.status()).toBe(415);
});

import type { APIRoute } from 'astro';

import { api, ApiError } from '../../lib/api/client';

/**
 * Bounded form/JSON endpoint for dashboard actions.
 *
 * The browser never holds the API token and never calls the backend directly: every UI form posts here,
 * this route performs one allow-listed operation with the server-side token, then redirects back with an
 * outcome message. There is deliberately no generic proxy.
 *
 * Accepted bodies:
 * - `application/x-www-form-urlencoded` or `multipart/form-data` (the dashboard forms). Astro's
 *   `security.checkOrigin` protects these: a cross-origin form post is rejected before reaching here.
 * - `application/json` (`{ "op": "...", ...fields }`) for scripting and tests. JSON cannot be forged by
 *   a cross-origin form, and a cross-origin fetch would need a CORS preflight this app does not allow.
 *
 * Unknown operations, missing operations and unparseable bodies answer 4xx with a message instead of a
 * stack trace.
 */

const OPS = new Set([
  'import.json',
  'opportunity.analyze',
  'opportunity.generate',
  'opportunity.delete',
  'reply.post',
  'followup.update',
  'reply.prepare',
  'comment.patch',
  'comment.status',
  'comment.approve',
  'comment.reject',
  'comment.publish',
  'engagement.create',
  'project.create',
  'project.patch',
  'project.delete',
  'project.match',
  'community.patch',
  'community.validate',
  'source.create',
  'source.patch',
  'source.validate',
  'source.test',
  'profile.create',
  'profile.patch',
  'profile.delete',
  'apify.actor.create',
  'apify.actor.patch',
  'apify.run.start',
  'apify.run.cancel',
  'apify.run.reingest',
  'provider.test',
  'benchmark.start',
  'benchmark.dataset',
  'settings.patch',
  'job.retry',
]);

type Field = string | number | boolean | null | undefined;
type JsonPayload = Record<string, unknown>;

interface Body {
  /** First non-empty string value for a field. */
  text(key: string): string | undefined;
  /** Whether the field is present at all (used for tri-state checkboxes). */
  has(key: string): boolean;
  flag(key: string): boolean;
  list(key: string): string[];
  getAll(key: string): string[];
  /** Parse a field that holds a JSON object. */
  json(key: string): Record<string, unknown> | undefined;
}

/** One URL per line in the textarea; blank lines and duplicates are dropped. */
function splitUrls(raw: string | undefined): string[] {
  if (!raw) return [];
  const seen = new Set<string>();
  for (const line of raw.split(/\s*[\n,]\s*/)) {
    const url = line.trim();
    if (url !== '') seen.add(url);
  }
  return [...seen];
}

function asText(value: Field): string | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'object') return undefined;
  const raw = String(value).trim();
  return raw === '' ? undefined : raw;
}

function makeBody(get: (key: string) => Field | Field[], has: (key: string) => boolean): Body {
  const values = (key: string): Field[] => {
    const value = get(key);
    return Array.isArray(value) ? value : [value];
  };
  const text = (key: string): string | undefined => {
    for (const value of values(key)) {
      const parsed = asText(value);
      if (parsed !== undefined) return parsed;
    }
    return undefined;
  };
  return {
    text,
    has,
    flag: (key) => {
      const raw = text(key);
      return raw === 'on' || raw === 'true' || raw === '1';
    },
    list: (key) =>
      (text(key) ?? '')
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0),
    getAll: (key) =>
      values(key)
        .map((value) => asText(value))
        .filter((value): value is string => !!value),
    json: (key) => {
      const raw = text(key);
      if (!raw) return undefined;
      try {
        const parsed: unknown = JSON.parse(raw);
        if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
          throw new Error('must be a JSON object');
        }
        return parsed as Record<string, unknown>;
      } catch (error) {
        throw new ApiError(422, 'validation_failed', `${key}: ${(error as Error).message}`);
      }
    },
  };
}

async function readBody(request: Request): Promise<Body> {
  const contentType = request.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    let parsed: unknown;
    try {
      parsed = await request.json();
    } catch (error) {
      throw new ApiError(400, 'bad_request', `body is not valid JSON: ${(error as Error).message}`);
    }
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new ApiError(400, 'bad_request', 'JSON body must be an object');
    }
    const payload = parsed as JsonPayload;
    return makeBody(
      (key) => payload[key] as Field | Field[],
      (key) => Object.prototype.hasOwnProperty.call(payload, key),
    );
  }
  if (
    contentType.includes('multipart/form-data') ||
    contentType.includes('application/x-www-form-urlencoded')
  ) {
    const form = await request.formData();
    return makeBody(
      (key) => {
        const value = form.get(key);
        if (value === null) return undefined;
        if (typeof value === 'string') return value;
        return null;
      },
      (key) => form.has(key),
    );
  }
  throw new ApiError(
    415,
    'unsupported_media_type',
    'send application/x-www-form-urlencoded, multipart/form-data or application/json',
  );
}

/**
 * Origin policy replacing Astro's blanket `checkOrigin`.
 *
 * A browser sends `Origin` (and `Sec-Fetch-Site`) on cross-site requests, so those are refused. A
 * non-browser client (curl, Postman, a script) sends neither, cannot be a confused deputy for a
 * logged-in user, and is allowed. When `Origin` is present it must match the host this app answered on,
 * or one of the explicitly allowed app origins.
 */
function rejectCrossSite(request: Request): Response | null {
  const site = request.headers.get('sec-fetch-site');
  if (site === 'cross-site') {
    return forbidden('cross-site requests are not allowed');
  }
  const origin = request.headers.get('origin');
  if (!origin) return null;

  const host = request.headers.get('host');
  const allowed = new Set<string>();
  if (host) {
    allowed.add(`http://${host}`);
    allowed.add(`https://${host}`);
  }
  const configured: string = String(import.meta.env.LEAD_RADAR_ALLOWED_ORIGINS ?? '');
  for (const extra of configured
    .split(',')
    .map((value: string) => value.trim())
    .filter((value: string) => value.length > 0)) {
    allowed.add(extra);
  }
  if (!allowed.has(origin)) {
    return forbidden(`origin ${origin} is not allowed`);
  }
  return null;
}

function forbidden(message: string): Response {
  return new Response(JSON.stringify({ error: { code: 'forbidden', message } }), {
    status: 403,
    headers: { 'content-type': 'application/json' },
  });
}

function safeRedirect(raw: string | undefined): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return '/';
  return raw;
}

function withOutcome(target: string, key: 'ok' | 'error', message: string): string {
  const separator = target.includes('?') ? '&' : '?';
  return `${target}${separator}${key}=${encodeURIComponent(message)}`;
}

export const POST: APIRoute = async ({ request }) => {
  const crossSite = rejectCrossSite(request);
  if (crossSite) return crossSite;

  let body: Body;
  try {
    body = await readBody(request);
  } catch (error) {
    const failure =
      error instanceof ApiError ? error : new ApiError(400, 'bad_request', String(error));
    return new Response(
      JSON.stringify({ error: { code: failure.code, message: failure.message } }),
      {
        status: failure.status,
        headers: { 'content-type': 'application/json' },
      },
    );
  }

  const rawOp = body.text('op');
  const rawRedirect = body.text('redirect');
  // A caller that supplies no redirect (curl, tests, scripts) gets a JSON answer; the dashboard forms
  // always send one and expect a 303 back to the page.
  const wantsRedirect = rawRedirect !== undefined;
  const target = safeRedirect(rawRedirect);
  let message = 'saved';

  if (!rawOp) {
    return new Response(
      JSON.stringify({
        error: {
          code: 'bad_request',
          message: `missing "op"; known operations: ${[...OPS].sort().join(', ')}`,
        },
      }),
      { status: 400, headers: { 'content-type': 'application/json' } },
    );
  }
  if (!OPS.has(rawOp)) {
    return new Response(
      JSON.stringify({
        error: { code: 'bad_request', message: `unknown operation ${rawOp}` },
      }),
      { status: 400, headers: { 'content-type': 'application/json' } },
    );
  }

  try {
    switch (rawOp) {
      case 'import.json': {
        const raw = body.text('payload');
        if (!raw) throw new ApiError(422, 'validation_failed', 'payload is empty');
        let parsed: unknown;
        try {
          parsed = JSON.parse(raw);
        } catch (error) {
          throw new ApiError(
            422,
            'validation_failed',
            `payload is not valid JSON: ${(error as Error).message}`,
          );
        }
        const payload = Array.isArray(parsed) ? { posts: parsed } : parsed;
        const result = await api.post<{
          imported: number;
          duplicates: number;
          rejected: number;
          rejected_reasons?: string[];
        }>('/api/v1/import/json', payload);
        message =
          `imported ${result.imported}, duplicates ${result.duplicates}, ` +
          `rejected ${result.rejected}` +
          (result.rejected_reasons && result.rejected_reasons.length > 0
            ? ` (${result.rejected_reasons.join('; ')})`
            : '');
        break;
      }
      case 'opportunity.analyze':
        await api.post(
          `/api/v1/opportunities/${encodeURIComponent(body.text('id') ?? '')}/analyze`,
        );
        break;
      case 'opportunity.generate':
        await api.post(
          `/api/v1/opportunities/${encodeURIComponent(body.text('id') ?? '')}/generate-comments`,
        );
        break;
      case 'opportunity.delete':
        if (!body.flag('confirm')) {
          throw new ApiError(422, 'validation_failed', 'confirmation required');
        }
        await api.delete(`/api/v1/opportunities/${encodeURIComponent(body.text('id') ?? '')}`);
        break;
      case 'reply.post': {
        const result = await api.replyTo(body.text('lead_id') ?? '', {
          variant: body.text('variant') ?? '',
          body: body.text('body'),
          engagement_kind: body.text('engagement_kind'),
          note: body.text('note'),
        });
        message = `recorded as posted (${result.comment.variant})`;
        break;
      }
      case 'followup.update': {
        const state = body.text('state');
        if (state && !['waiting', 'answered', 'closed'].includes(state)) {
          throw new ApiError(422, 'validation_failed', 'state must be waiting, answered or closed');
        }
        await api.followupUpdate(body.text('lead_id') ?? '', {
          state: state as 'waiting' | 'answered' | 'closed' | undefined,
        });
        message = `follow-up ${state ?? 'updated'}`;
        break;
      }
      case 'reply.prepare': {
        const limit = Number.parseInt(body.text('limit') ?? '5', 10);
        const result = await api.prepareDrafts(Number.isFinite(limit) ? limit : 5);
        message = `queued ${result.queued} draft generation job(s)`;
        break;
      }
      case 'comment.patch':
        await api.patch(`/api/v1/comments/${encodeURIComponent(body.text('id') ?? '')}`, {
          body: body.text('body'),
        });
        break;
      case 'comment.status':
        await api.patch(`/api/v1/comments/${encodeURIComponent(body.text('id') ?? '')}`, {
          status: body.text('status'),
        });
        break;
      case 'comment.approve':
        await api.post(`/api/v1/comments/${encodeURIComponent(body.text('id') ?? '')}/approve`, {
          note: body.text('note'),
        });
        break;
      case 'comment.reject':
        await api.post(`/api/v1/comments/${encodeURIComponent(body.text('id') ?? '')}/reject`, {
          note: body.text('note'),
        });
        break;
      case 'comment.publish':
        await api.post(
          `/api/v1/comments/${encodeURIComponent(body.text('id') ?? '')}/record-publication`,
          { note: body.text('note') },
        );
        break;
      case 'engagement.create':
        await api.post('/api/v1/engagements', {
          lead_id: body.text('lead_id'),
          comment_id: body.text('comment_id'),
          kind: body.text('kind'),
          note: body.text('note'),
        });
        break;
      case 'project.create': {
        const result = await api.post<{ id: string }>('/api/v1/projects', {
          name: body.text('name'),
          summary: body.text('summary') ?? '',
          website_urls: splitUrls(body.text('website_urls')),
        });
        message = `project created (${result.id.slice(0, 8)})`;
        break;
      }
      case 'project.patch': {
        await api.patch(`/api/v1/projects/${encodeURIComponent(body.text('id') ?? '')}`, {
          name: body.text('name'),
          summary: body.text('summary'),
          website_urls: body.has('website_urls') ? splitUrls(body.text('website_urls')) : undefined,
          is_default: body.has('is_default') ? body.flag('is_default') : undefined,
        });
        message = 'project updated';
        break;
      }
      case 'project.delete':
        if (!body.flag('confirm')) {
          throw new ApiError(422, 'validation_failed', 'confirmation required');
        }
        await api.delete(`/api/v1/projects/${encodeURIComponent(body.text('id') ?? '')}`);
        message = 'project deleted';
        break;
      case 'project.match': {
        // Reading pages and asking a model is slow work: the default 15s budget would report a
        // timeout for an analysis that is still running.
        const result = await api.post<{ candidates: number; matched: number }>(
          `/api/v1/projects/${encodeURIComponent(body.text('id') ?? '')}/match-communities`,
          {},
          120_000,
        );
        message = `analysis ranked ${result.matched} of ${result.candidates} communities`;
        break;
      }
      case 'community.patch':
        await api.patch(`/api/v1/communities/${encodeURIComponent(body.text('id') ?? '')}`, {
          enabled: body.has('enabled') ? body.flag('enabled') : undefined,
          notes: body.text('notes'),
          self_promotion: body.text('self_promotion'),
          min_account_age_days: body.text('min_account_age_days')
            ? Number.parseInt(body.text('min_account_age_days') ?? '', 10)
            : undefined,
          min_comment_karma: body.text('min_comment_karma')
            ? Number.parseInt(body.text('min_comment_karma') ?? '', 10)
            : undefined,
          promo_cooldown_days: body.text('promo_cooldown_days')
            ? Number.parseInt(body.text('promo_cooldown_days') ?? '', 10)
            : undefined,
          flair_required: body.has('flair_required') ? body.flag('flair_required') : undefined,
          rules_summary: body.text('rules_summary'),
        });
        break;
      case 'community.validate':
        await api.post(
          `/api/v1/communities/${encodeURIComponent(body.text('id') ?? '')}/validate`,
          {
            outcome: body.text('outcome'),
            evidence: body.text('evidence'),
            notes: body.text('notes'),
          },
        );
        break;
      case 'source.create':
        await api.post('/api/v1/sources', {
          name: body.text('name'),
          provider: body.text('provider'),
          source_type: body.text('source_type'),
          config: body.json('config') ?? {},
        });
        break;
      case 'source.patch':
        await api.patch(`/api/v1/sources/${encodeURIComponent(body.text('id') ?? '')}`, {
          enabled: body.has('enabled') ? body.flag('enabled') : undefined,
          config: body.json('config'),
        });
        break;
      case 'source.validate': {
        const result = await api.post<{ validation_status: string }>(
          `/api/v1/sources/${encodeURIComponent(body.text('id') ?? '')}/validate`,
          {
            outcome: body.text('outcome'),
            evidence: body.text('evidence'),
            notes: body.text('notes'),
          },
        );
        message = `validation recorded: ${result.validation_status}`;
        break;
      }
      case 'source.test': {
        const result = await api.post<{ status: string; message: string | null }>(
          `/api/v1/sources/${encodeURIComponent(body.text('id') ?? '')}/test`,
        );
        message = `${result.status}${result.message ? `: ${result.message}` : ''}`;
        break;
      }
      case 'profile.create':
        await api.post('/api/v1/search-profiles', {
          name: body.text('name'),
          vertical: body.text('vertical'),
          enabled: true,
          keywords: body.list('keywords'),
          negative_keywords: body.list('negative_keywords'),
        });
        break;
      case 'profile.patch':
        await api.patch(`/api/v1/search-profiles/${encodeURIComponent(body.text('id') ?? '')}`, {
          keywords: body.has('keywords') ? body.list('keywords') : undefined,
          negative_keywords: body.has('negative_keywords')
            ? body.list('negative_keywords')
            : undefined,
          enabled: body.has('enabled') ? body.flag('enabled') : undefined,
        });
        break;
      case 'profile.delete':
        await api.delete(`/api/v1/search-profiles/${encodeURIComponent(body.text('id') ?? '')}`);
        break;
      case 'apify.actor.create':
        await api.post('/api/v1/providers/apify/actors', {
          actor_id: body.text('actor_id'),
          name: body.text('name'),
          description: body.text('description') ?? '',
          source_type: body.text('source_type'),
          input_template: body.json('input_template') ?? {},
          max_items_per_run: body.text('max_items_per_run')
            ? Number.parseInt(body.text('max_items_per_run') ?? '', 10)
            : undefined,
        });
        break;
      case 'apify.actor.patch':
        await api.patch(
          `/api/v1/providers/apify/actors/${encodeURIComponent(body.text('id') ?? '')}`,
          {
            validation_status: body.text('validation_status'),
            enabled: body.has('enabled') ? body.flag('enabled') : undefined,
            description: body.text('description'),
            max_items_per_run: body.text('max_items_per_run')
              ? Number.parseInt(body.text('max_items_per_run') ?? '', 10)
              : undefined,
          },
        );
        break;
      case 'apify.run.start':
        if (!body.flag('confirm')) {
          throw new ApiError(422, 'validation_failed', 'confirmation required');
        }
        await api.post('/api/v1/providers/apify/runs', {
          actor_registry_id: body.text('actor_registry_id'),
          items_limit: body.text('items_limit')
            ? Number.parseInt(body.text('items_limit') ?? '', 10)
            : undefined,
        });
        break;
      case 'apify.run.reingest': {
        const result = await api.post<{ job_id: string }>(
          `/api/v1/providers/apify/runs/${encodeURIComponent(body.text('id') ?? '')}/reingest`,
        );
        message = `dataset queued for re-ingestion (job ${result.job_id.slice(0, 8)})`;
        break;
      }
      case 'apify.run.cancel':
        await api.post(
          `/api/v1/providers/apify/runs/${encodeURIComponent(body.text('id') ?? '')}/cancel`,
        );
        break;
      case 'provider.test': {
        const result = await api.post<{
          status: string;
          latency_ms: number | null;
          message: string | null;
        }>(`/api/v1/providers/${encodeURIComponent(body.text('provider') ?? '')}/test`);
        message = `${result.status}${result.latency_ms === null ? '' : ` (${result.latency_ms} ms)`}${
          result.message ? `: ${result.message}` : ''
        }`;
        break;
      }
      case 'benchmark.dataset': {
        const dataset = body.text('dataset');
        const raw = body.text('payload');
        if (!dataset) throw new ApiError(422, 'validation_failed', 'dataset is required');
        if (!raw) throw new ApiError(422, 'validation_failed', 'payload is empty');
        let parsed: unknown;
        try {
          parsed = JSON.parse(raw);
        } catch (error) {
          throw new ApiError(
            422,
            'validation_failed',
            `payload is not valid JSON: ${(error as Error).message}`,
          );
        }
        const items = Array.isArray(parsed) ? parsed : (parsed as { items?: unknown }).items;
        if (!Array.isArray(items)) {
          throw new ApiError(422, 'validation_failed', 'payload must be an array of labeled items');
        }
        const result = await api.post<{ dataset: string; stored: number }>(
          '/api/v1/providers/benchmark/dataset',
          { dataset, items },
        );
        message = `stored ${result.stored} labeled examples in dataset ${result.dataset}`;
        break;
      }
      case 'benchmark.start':
        await api.post('/api/v1/providers/benchmark', {
          dataset: body.text('dataset') ?? 'seed',
          providers: body.getAll('providers'),
        });
        break;
      case 'settings.patch': {
        const budgets: Record<string, unknown> = {};
        const numeric: [string, string][] = [
          ['apify_daily_budget_eur', 'apify_daily_budget_eur'],
          ['apify_max_run_cost_eur', 'apify_max_run_cost_eur'],
          ['apify_max_items_per_run', 'apify_max_items_per_run'],
        ];
        for (const [field, key] of numeric) {
          const raw = body.text(field);
          if (raw !== undefined) budgets[key] = Number(raw);
        }
        if (body.has('kill_switch')) budgets.kill_switch = body.flag('kill_switch');
        await api.patch('/api/v1/settings', {
          retention_days: body.text('retention_days')
            ? Number.parseInt(body.text('retention_days') ?? '', 10)
            : undefined,
          budgets: Object.keys(budgets).length > 0 ? budgets : undefined,
        });
        break;
      }
      case 'job.retry':
        await api.post(`/api/v1/jobs/${encodeURIComponent(body.text('id') ?? '')}/retry`);
        break;
      default:
        throw new ApiError(400, 'bad_request', `unsupported action ${rawOp}`);
    }
  } catch (error) {
    const failure =
      error instanceof ApiError
        ? error
        : new ApiError(500, 'internal_error', (error as Error).message);
    if (!wantsRedirect) {
      return new Response(
        JSON.stringify({ error: { code: failure.code, message: failure.message } }),
        { status: failure.status, headers: { 'content-type': 'application/json' } },
      );
    }
    return new Response(null, {
      status: 303,
      headers: { location: withOutcome(target, 'error', `${failure.code}: ${failure.message}`) },
    });
  }

  if (!wantsRedirect) {
    return new Response(JSON.stringify({ ok: true, message }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }
  return new Response(null, {
    status: 303,
    headers: { location: withOutcome(target, 'ok', message) },
  });
};

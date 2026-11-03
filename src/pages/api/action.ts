import type { APIRoute } from 'astro';

import { api, ApiError } from '../../lib/api/client';

/**
 * Bounded form endpoint for dashboard actions.
 *
 * The browser never holds the API token and never calls the backend directly: every form posts here,
 * this route performs one allow-listed operation with the server-side token, then redirects back with
 * an outcome message. There is deliberately no generic proxy.
 */

const OPS = new Set([
  'opportunity.analyze',
  'opportunity.generate',
  'opportunity.delete',
  'comment.patch',
  'comment.status',
  'comment.approve',
  'comment.reject',
  'comment.publish',
  'engagement.create',
  'community.patch',
  'community.validate',
  'source.create',
  'source.patch',
  'source.test',
  'profile.create',
  'profile.patch',
  'profile.delete',
  'apify.actor.create',
  'apify.actor.patch',
  'apify.run.start',
  'apify.run.cancel',
  'provider.test',
  'benchmark.start',
  'settings.patch',
  'job.retry',
]);

function safeRedirect(raw: string | null): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return '/';
  return raw;
}

function withOutcome(target: string, key: 'ok' | 'error', message: string): string {
  const separator = target.includes('?') ? '&' : '?';
  return `${target}${separator}${key}=${encodeURIComponent(message)}`;
}

export const POST: APIRoute = async ({ request }) => {
  const form = await request.formData();
  const op = String(form.get('op') ?? '');
  const target = safeRedirect(form.get('redirect') as string | null);
  const text = (key: string): string | undefined => {
    const value = form.get(key);
    if (value === null) return undefined;
    const raw = String(value).trim();
    return raw === '' ? undefined : raw;
  };
  const flag = (key: string): boolean => {
    const value = form.get(key);
    return value === 'on' || value === 'true' || value === '1';
  };
  const list = (key: string): string[] =>
    (text(key) ?? '')
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
  const json = (key: string): Record<string, unknown> | undefined => {
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
  };

  if (!OPS.has(op)) {
    return new Response(null, {
      status: 303,
      headers: { location: withOutcome(target, 'error', `unknown action ${op || '(empty)'}`) },
    });
  }

  try {
    switch (op) {
      case 'opportunity.analyze':
        await api.post(`/api/v1/opportunities/${encodeURIComponent(text('id') ?? '')}/analyze`);
        break;
      case 'opportunity.generate':
        await api.post(
          `/api/v1/opportunities/${encodeURIComponent(text('id') ?? '')}/generate-comments`,
        );
        break;
      case 'opportunity.delete':
        if (!flag('confirm')) throw new ApiError(422, 'validation_failed', 'confirmation required');
        await api.delete(`/api/v1/opportunities/${encodeURIComponent(text('id') ?? '')}`);
        break;
      case 'comment.patch':
        await api.patch(`/api/v1/comments/${encodeURIComponent(text('id') ?? '')}`, {
          body: text('body'),
        });
        break;
      case 'comment.status':
        await api.patch(`/api/v1/comments/${encodeURIComponent(text('id') ?? '')}`, {
          status: text('status'),
        });
        break;
      case 'comment.approve':
        await api.post(`/api/v1/comments/${encodeURIComponent(text('id') ?? '')}/approve`, {
          note: text('note'),
        });
        break;
      case 'comment.reject':
        await api.post(`/api/v1/comments/${encodeURIComponent(text('id') ?? '')}/reject`, {
          note: text('note'),
        });
        break;
      case 'comment.publish':
        await api.post(
          `/api/v1/comments/${encodeURIComponent(text('id') ?? '')}/record-publication`,
          { note: text('note') },
        );
        break;
      case 'engagement.create':
        await api.post('/api/v1/engagements', {
          lead_id: text('lead_id'),
          comment_id: text('comment_id'),
          kind: text('kind'),
          note: text('note'),
        });
        break;
      case 'community.patch':
        await api.patch(`/api/v1/communities/${encodeURIComponent(text('id') ?? '')}`, {
          enabled: form.has('enabled') ? flag('enabled') : undefined,
          notes: text('notes'),
        });
        break;
      case 'community.validate':
        await api.post(`/api/v1/communities/${encodeURIComponent(text('id') ?? '')}/validate`, {
          outcome: text('outcome'),
          evidence: text('evidence'),
          notes: text('notes'),
        });
        break;
      case 'source.create':
        await api.post('/api/v1/sources', {
          name: text('name'),
          provider: text('provider'),
          source_type: text('source_type'),
          config: json('config') ?? {},
        });
        break;
      case 'source.patch':
        await api.patch(`/api/v1/sources/${encodeURIComponent(text('id') ?? '')}`, {
          enabled: form.has('enabled') ? flag('enabled') : undefined,
          config: json('config'),
        });
        break;
      case 'source.test':
        await api.post(`/api/v1/sources/${encodeURIComponent(text('id') ?? '')}/test`);
        break;
      case 'profile.create':
        await api.post('/api/v1/search-profiles', {
          name: text('name'),
          vertical: text('vertical'),
          enabled: true,
          keywords: list('keywords'),
          negative_keywords: list('negative_keywords'),
        });
        break;
      case 'profile.patch':
        await api.patch(`/api/v1/search-profiles/${encodeURIComponent(text('id') ?? '')}`, {
          keywords: form.has('keywords') ? list('keywords') : undefined,
          negative_keywords: form.has('negative_keywords') ? list('negative_keywords') : undefined,
          enabled: form.has('enabled') ? flag('enabled') : undefined,
        });
        break;
      case 'profile.delete':
        await api.delete(`/api/v1/search-profiles/${encodeURIComponent(text('id') ?? '')}`);
        break;
      case 'apify.actor.create':
        await api.post('/api/v1/providers/apify/actors', {
          actor_id: text('actor_id'),
          name: text('name'),
          description: text('description') ?? '',
          source_type: text('source_type'),
          input_template: json('input_template') ?? {},
          max_items_per_run: text('max_items_per_run')
            ? Number.parseInt(text('max_items_per_run') ?? '', 10)
            : undefined,
        });
        break;
      case 'apify.actor.patch':
        await api.patch(`/api/v1/providers/apify/actors/${encodeURIComponent(text('id') ?? '')}`, {
          validation_status: text('validation_status'),
          enabled: form.has('enabled') ? flag('enabled') : undefined,
          description: text('description'),
          max_items_per_run: text('max_items_per_run')
            ? Number.parseInt(text('max_items_per_run') ?? '', 10)
            : undefined,
        });
        break;
      case 'apify.run.start':
        if (!flag('confirm')) throw new ApiError(422, 'validation_failed', 'confirmation required');
        await api.post('/api/v1/providers/apify/runs', {
          actor_registry_id: text('actor_registry_id'),
          items_limit: text('items_limit')
            ? Number.parseInt(text('items_limit') ?? '', 10)
            : undefined,
        });
        break;
      case 'apify.run.cancel':
        await api.post(
          `/api/v1/providers/apify/runs/${encodeURIComponent(text('id') ?? '')}/cancel`,
        );
        break;
      case 'provider.test':
        await api.post(`/api/v1/providers/${encodeURIComponent(text('provider') ?? '')}/test`);
        break;
      case 'benchmark.start':
        await api.post('/api/v1/providers/benchmark', {
          dataset: text('dataset') ?? 'seed',
          providers: form.getAll('providers').map((value) => String(value)),
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
          const raw = text(field);
          if (raw !== undefined) budgets[key] = Number(raw);
        }
        if (form.has('kill_switch')) budgets.kill_switch = flag('kill_switch');
        await api.patch('/api/v1/settings', {
          retention_days: text('retention_days')
            ? Number.parseInt(text('retention_days') ?? '', 10)
            : undefined,
          budgets: Object.keys(budgets).length > 0 ? budgets : undefined,
        });
        break;
      }
      case 'job.retry':
        await api.post(`/api/v1/jobs/${encodeURIComponent(text('id') ?? '')}/retry`);
        break;
      default:
        throw new ApiError(400, 'bad_request', `unsupported action ${op}`);
    }
    return new Response(null, {
      status: 303,
      headers: { location: withOutcome(target, 'ok', 'saved') },
    });
  } catch (error) {
    const message =
      error instanceof ApiError
        ? `${error.code}: ${error.message}`
        : `unexpected error: ${(error as Error).message}`;
    return new Response(null, {
      status: 303,
      headers: { location: withOutcome(target, 'error', message) },
    });
  }
};

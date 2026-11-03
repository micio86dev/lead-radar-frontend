/**
 * The only module allowed to call `fetch`.
 *
 * Every request happens on the server: the bearer token is read from the runtime environment and
 * never exposed to the browser. The API is the single source of truth; this client does not compute
 * or invent values.
 */

import { buildQuery, type QueryValue } from '../query';
import type {
  Actor,
  ApifyRun,
  ApifyUsage,
  BenchmarkDetail,
  BenchmarkRun,
  CommentDetail,
  CommentSummary,
  Community,
  Dashboard,
  Engagement,
  Job,
  OpportunityDetail,
  OpportunityListItem,
  Paginated,
  ProviderCost,
  ProviderStatus,
  SearchProfile,
  Settings,
  Source,
} from '../types';

const DEFAULT_BASE_URL = 'http://localhost:8080';

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

type EnvKey = 'API_INTERNAL_URL' | 'PUBLIC_API_BASE_URL' | 'LEAD_RADAR_API_TOKEN';

function envValue(key: EnvKey): string | undefined {
  // Runtime environment first (Docker/Kubernetes), then the build-time value for `astro dev`.
  const fromProcess = typeof process !== 'undefined' && process.env ? process.env[key] : undefined;
  if (fromProcess && fromProcess.trim() !== '') return fromProcess;
  const fromVite = import.meta.env[key];
  return fromVite && String(fromVite).trim() !== '' ? String(fromVite) : undefined;
}

export function apiBaseUrl(): string {
  return (
    envValue('API_INTERNAL_URL') ??
    envValue('PUBLIC_API_BASE_URL') ??
    DEFAULT_BASE_URL
  ).replace(/\/$/, '');
}

function authToken(): string {
  const token = envValue('LEAD_RADAR_API_TOKEN');
  if (!token) {
    throw new ApiError(
      500,
      'configuration_error',
      'LEAD_RADAR_API_TOKEN is not configured on the server',
    );
  }
  return token;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** Abort slow provider calls instead of hanging the page. */
  timeoutMs?: number;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = options.method ?? 'GET';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 15_000);
  try {
    const response = await fetch(`${apiBaseUrl()}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${authToken()}`,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal,
    });
    const text = await response.text();
    const payload: unknown = text === '' ? null : safeJson(text);
    if (!response.ok) {
      const envelope = payload as {
        error?: { code?: string; message?: string; details?: unknown };
      } | null;
      throw new ApiError(
        response.status,
        envelope?.error?.code ?? 'http_error',
        envelope?.error?.message ?? `request failed with status ${response.status}`,
        envelope?.error?.details,
      );
    }
    return payload as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ApiError(504, 'timeout', 'the API did not answer in time');
    }
    throw new ApiError(502, 'unreachable', `the API is unreachable: ${(error as Error).message}`);
  } finally {
    clearTimeout(timeout);
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export const api = {
  dashboard: () => request<Dashboard>('/api/v1/dashboard'),

  opportunities: (params: Record<string, QueryValue>) =>
    request<Paginated<OpportunityListItem>>(`/api/v1/opportunities${buildQuery(params)}`),
  opportunity: (id: string) =>
    request<OpportunityDetail>(`/api/v1/opportunities/${encodeURIComponent(id)}`),

  comments: (params: Record<string, QueryValue>) =>
    request<Paginated<CommentSummary>>(`/api/v1/comments${buildQuery(params)}`),
  comment: (id: string) => request<CommentDetail>(`/api/v1/comments/${encodeURIComponent(id)}`),

  engagements: (params: Record<string, QueryValue>) =>
    request<Paginated<Engagement>>(`/api/v1/engagements${buildQuery(params)}`),

  profiles: () => request<Paginated<SearchProfile>>('/api/v1/search-profiles?per_page=100'),
  communities: (params: Record<string, QueryValue>) =>
    request<Paginated<Community>>(`/api/v1/communities${buildQuery(params)}`),
  sources: () => request<Paginated<Source>>('/api/v1/sources'),

  actors: () => request<Paginated<Actor>>('/api/v1/providers/apify/actors'),
  apifyRuns: (params: Record<string, QueryValue>) =>
    request<Paginated<ApifyRun>>(`/api/v1/providers/apify/runs${buildQuery(params)}`),
  apifyUsage: () => request<ApifyUsage>('/api/v1/providers/apify/usage'),

  providers: () => request<ProviderStatus[]>('/api/v1/providers'),
  usage: () =>
    request<{ items: ProviderCost[]; period: { from: string; to: string }; note: string }>(
      '/api/v1/providers/usage',
    ),
  benchmarks: () => request<Paginated<BenchmarkRun>>('/api/v1/providers/benchmark?per_page=50'),
  benchmark: (id: string) =>
    request<BenchmarkDetail>(`/api/v1/providers/benchmark/${encodeURIComponent(id)}`),

  jobs: (params: Record<string, QueryValue>) =>
    request<Paginated<Job>>(`/api/v1/jobs${buildQuery(params)}`),

  settings: () => request<Settings>('/api/v1/settings'),

  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown = {}) => request<T>(path, { method: 'POST', body }),
  patch: <T>(path: string, body: unknown) => request<T>(path, { method: 'PATCH', body }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};

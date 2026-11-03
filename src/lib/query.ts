export type QueryValue = string | number | boolean | null | undefined;

/** Build a query string, skipping empty values. Order is preserved so URLs are stable. */
export function buildQuery(params: Record<string, QueryValue>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined) continue;
    if (typeof value === 'string' && value.trim() === '') continue;
    search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : '';
}

/** Read a single query parameter from a URL, returning undefined for empty values. */
export function readParam(url: URL, key: string): string | undefined {
  const value = url.searchParams.get(key);
  return value === null || value.trim() === '' ? undefined : value;
}

/** Parse a positive integer parameter, falling back to the default. */
export function readIntParam(url: URL, key: string, fallback: number): number {
  const raw = readParam(url, key);
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

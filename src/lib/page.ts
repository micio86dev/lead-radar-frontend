import { ApiError } from './api/client';

/** Load data for a page without crashing the render: the error is shown, never hidden. */
export async function load<T>(
  loader: () => Promise<T>,
): Promise<{ data: T | null; error: string | null }> {
  try {
    return { data: await loader(), error: null };
  } catch (error) {
    const message =
      error instanceof ApiError
        ? `${error.code}: ${error.message}`
        : `unexpected error: ${(error as Error).message}`;
    return { data: null, error: message };
  }
}

/** Hidden redirect target for a form: the current page without transient outcome parameters. */
export function formTarget(url: URL): string {
  const params = new URLSearchParams(url.searchParams);
  params.delete('ok');
  params.delete('error');
  const query = params.toString();
  return query ? `${url.pathname}?${query}` : url.pathname;
}

/** Page link that keeps the current filters. */
export function pageLink(url: URL, page: number): string {
  const params = new URLSearchParams(url.searchParams);
  params.delete('ok');
  params.delete('error');
  params.set('page', String(page));
  return `${url.pathname}?${params.toString()}`;
}

/** Current query value, or an empty string for selects. */
export function param(url: URL, key: string): string {
  return url.searchParams.get(key) ?? '';
}

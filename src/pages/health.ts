import type { APIRoute } from 'astro';

/** Liveness probe for the frontend container; it does not depend on the API. */
export const GET: APIRoute = async () =>
  new Response(JSON.stringify({ status: 'ok', service: 'lead-radar-frontend' }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

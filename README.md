# Lead Radar frontend

Astro 5 (server output) + Vue 3 islands + TypeScript strict, built and run with Bun.

Every API call happens on the server (`src/lib/api/client.ts` is the only module allowed to call
`fetch`), so the bearer token never reaches the browser bundle. Forms post to one bounded action
endpoint (`src/pages/api/action.ts`) that performs an allow-listed backend operation and redirects
with an outcome message; there is no generic proxy.

## Commands

```bash
bun install
bun run dev          # development server on :4321
bun run typecheck    # astro check + vue-tsc --noEmit
bun run lint         # prettier --check .
bun run test         # vitest (helpers)
bun run test:e2e     # playwright, needs a running stack
bun run build && bun run start   # production server output
```

## Pages

Dashboard, Opportunities inbox and detail, Comment Studio and comment detail, Review Queue,
Search Profiles, Communities, Sources, Apify Control Center, AI Providers, Benchmarks, Usage and
Costs, Settings.

Unknown values (for example a provider cost that was never reported) render as `unknown`; they are
never shown as zero. Approval and manual publication are the only outbound actions, and both are
explicit human decisions. See `../docs/api.md` for the contract this app consumes.

## License

PolyForm Noncommercial License 1.0.0 (see `LICENSE`). Noncommercial use is free; commercial use needs a
paid license, described in the root repository's `COMMERCIAL.md`.

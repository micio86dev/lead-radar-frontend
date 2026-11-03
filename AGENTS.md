# AGENTS.md — lead-radar-frontend

Astro application shell + Vue 3 islands + TypeScript strict, package manager Bun.

## Boundaries

- `src/pages/**` — routes and page-level composition. Fetch through `src/lib/api`.
- `src/components/vue/**` — interactive islands only (tables, forms, editors).
  Keep them presentational; data comes from props or `src/lib/api`.
- `src/lib/api/**` — typed client. The only place allowed to call `fetch`.
- `src/lib/**` — pure helpers (formatting, filtering, sorting) with unit tests.

## Mandatory rules

1. **TypeScript strict, no `any`.** Unknown external payloads are narrowed by
   explicit parsing, not cast.
2. **No API keys, tokens or secrets in client code or bundles.** Only public API
   URLs come from `PUBLIC_*` variables.
3. **No invented data.** Every number shown comes from an API response; unknown
   cost is displayed as "unknown", never as `0`.
4. **Human control.** Approve/reject/publish controls are the only path to
   publication and must be explicit, confirmable and irreversible only by intent.
5. **Accessibility.** Every control has a label, focus is visible, keyboard
   navigation works, contrast is adequate, tables use proper headers.
6. **Responsive.** Pages must remain usable from 360px to wide desktop.
7. **No client-side authorization.** The UI hides what the server forbids; it
   never decides access.

## Testing

- `bun run typecheck` (`astro check` + `vue-tsc`), `bun run lint` (prettier check),
  `bun run test` (Vitest) and `bun run test:e2e` (Playwright) must pass.
- Vitest covers pure helpers and island logic; Playwright covers the end-to-end
  scenarios listed in `docs/testing.md`.

## Style

- Composition API with `<script setup lang="ts">`.
- No global state library; page-scoped state plus explicit props/events.
- Copy is English; user data keeps its original language.

## Commits

Local only. Conventional Commits, `Risk:` line in the body, never push.

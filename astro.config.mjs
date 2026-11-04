import node from '@astrojs/node';
import vue from '@astrojs/vue';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'astro/config';

// Server-rendered: every API call happens on the server, so the bearer token never reaches the
// browser bundle.
export default defineConfig({
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  integrations: [vue()],
  // Tailwind 4 runs as a Vite plugin and reads its tokens from src/styles/global.css.
  vite: { plugins: [tailwindcss()] },
  // Astro's blanket `checkOrigin` rejects every form POST that arrives without an Origin header,
  // which also blocks curl/Postman and other non-browser clients. `/api/action` enforces an explicit
  // policy instead: cross-site browser requests are refused, non-browser clients are allowed, and an
  // Origin header, when present, must match this host (see src/pages/api/action.ts).
  security: { checkOrigin: false },
  server: { host: true, port: Number(process.env.PORT ?? 4321) },
});

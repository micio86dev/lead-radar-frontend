import node from '@astrojs/node';
import vue from '@astrojs/vue';
import { defineConfig } from 'astro/config';

// Server-rendered: every API call happens on the server, so the bearer token never reaches the
// browser bundle.
export default defineConfig({
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  integrations: [vue()],
  server: { host: true, port: Number(process.env.PORT ?? 4321) },
});

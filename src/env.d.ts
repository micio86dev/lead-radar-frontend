/// <reference types="astro/client" />

interface ImportMetaEnv {
  /** Public base URL, used only for display links. */
  readonly PUBLIC_API_BASE_URL?: string;
  /** Server-side API base URL; falls back to PUBLIC_API_BASE_URL. */
  readonly API_INTERNAL_URL?: string;
  /** Server-only bearer token. Never prefixed with PUBLIC_. */
  readonly LEAD_RADAR_API_TOKEN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Base URL of the CrawlOps API. Unset in local dev (same-origin + Vite proxy);
   * set at build time in production to the Container Apps API URL.
   */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

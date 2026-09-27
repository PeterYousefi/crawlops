/**
 * Production build for the API.
 *
 * WHAT: Bundles apps/api + all @crawlops/* workspace packages into a single
 *       dist/server.js using esbuild.
 * WHY:  The container then needs only Node + the bundle + the Prisma client/
 *       engine — no pnpm, no workspace resolution, no tsx. Small, reliable image.
 * HOW:  esbuild follows the workspace `main -> src/*.ts` entries and inlines
 *       them. Prisma client stays EXTERNAL (it loads a native query-engine
 *       binary that cannot be bundled) and is installed in the runtime image.
 */

import { build } from 'esbuild';

await build({
  entryPoints: ['src/server.ts'],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  outfile: 'dist/server.js',
  // Prisma's generated client dynamically loads a native engine; keep it
  // external and install @prisma/client in the runtime image.
  external: ['@prisma/client', '.prisma/client'],
  // ESM interop: some deps (pino transports) resolve better with this banner.
  banner: {
    js: "import { createRequire as __cr } from 'module'; const require = __cr(import.meta.url);",
  },
  logLevel: 'info',
});

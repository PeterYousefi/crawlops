import { defineConfig } from 'prisma/config';

// Prisma 6 with a config file disables automatic .env loading, so load the
// repo-root .env ourselves. Look up from this package to the monorepo root.
// Only sets vars that are not already present in the environment.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function loadEnv(): void {
  for (const rel of ['.env', '../../.env']) {
    try {
      const contents = readFileSync(resolve(process.cwd(), rel), 'utf8');
      for (const line of contents.split('\n')) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
        if (m && m[1] && process.env[m[1]] === undefined) {
          process.env[m[1]] = m[2]!.replace(/^["']|["']$/g, '');
        }
      }
    } catch {
      // file not found at this location; try the next
    }
  }
}

loadEnv();

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    seed: 'tsx prisma/seed.ts',
  },
});

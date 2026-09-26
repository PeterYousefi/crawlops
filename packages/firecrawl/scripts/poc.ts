/**
 * Phase 0 — Firecrawl proof of concept.
 *
 * Runs ONE small search and ONE scrape against the REAL Firecrawl API to prove
 * the integration works from this environment. Costs a tiny number of credits.
 *
 * Usage:
 *   FIRECRAWL_API_KEY=fc-... pnpm --filter @crawlops/firecrawl poc
 *
 * It will:
 *   - refuse to run (cleanly) if FIRECRAWL_API_KEY is missing
 *   - measure latency
 *   - print normalized results
 *   - surface auth / rate-limit / API / network errors via the failure taxonomy
 */

import { CrawlOpsError, FailureCategory } from '@crawlops/shared';
import { FirecrawlAdapter } from '../src/index.js';

const SEARCH_QUERY = 'Firecrawl web data API';
const SCRAPE_URL = 'https://example.com';

async function main(): Promise<void> {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) {
    console.error('\n[BLOCKED] FIRECRAWL_API_KEY is not set.');
    console.error('Set it in your environment or .env and re-run:');
    console.error('  FIRECRAWL_API_KEY=fc-... pnpm --filter @crawlops/firecrawl poc\n');
    process.exit(2);
  }

  const client = new FirecrawlAdapter(apiKey, { defaultTimeoutMs: 30_000 });

  console.log('\n=== Phase 0: Firecrawl PoC ===\n');

  // --- Search ---
  console.log(`[1/2] search("${SEARCH_QUERY}", limit=3) ...`);
  const search = await client.search(SEARCH_QUERY, { limit: 3 });
  console.log(`  ✓ ${search.sources.length} sources in ${search.durationMs}ms`);
  for (const s of search.sources) {
    console.log(`    #${s.rank} ${s.title ?? '(no title)'}`);
    console.log(`        ${s.url}`);
  }

  // --- Scrape ---
  console.log(`\n[2/2] scrape("${SCRAPE_URL}") ...`);
  const scrape = await client.scrape(SCRAPE_URL);
  const preview = (scrape.markdown ?? '').slice(0, 200).replace(/\n+/g, ' ');
  console.log(`  ✓ status ${scrape.statusCode} in ${scrape.durationMs}ms`);
  console.log(`    title: ${scrape.title ?? '(none)'}`);
  console.log(`    markdown preview: ${preview}${preview.length === 200 ? '…' : ''}`);

  console.log('\n=== PoC succeeded against the real Firecrawl API ===\n');
}

main().catch((error: unknown) => {
  if (error instanceof CrawlOpsError) {
    console.error(`\n[FAILED] category=${error.category} retryable=${error.retryable}`);
    console.error(`  ${error.message}`);
    if (error.category === FailureCategory.AUTH_ERROR) {
      console.error('  → Verify FIRECRAWL_API_KEY is correct and active.');
    }
    process.exit(1);
  }
  console.error('\n[FAILED] Unexpected error:', error);
  process.exit(1);
});

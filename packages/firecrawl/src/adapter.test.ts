import { describe, it, expect } from 'vitest';
import { SdkError } from 'firecrawl';
import { FailureCategory } from '@crawlops/shared';
import { mapFirecrawlError } from './adapter.js';
import { MockFirecrawlClient } from './mock.js';

describe('mapFirecrawlError', () => {
  it('maps 401 to AUTH_ERROR (non-retryable)', () => {
    const mapped = mapFirecrawlError(new SdkError('unauthorized', 401));
    expect(mapped.category).toBe(FailureCategory.AUTH_ERROR);
    expect(mapped.retryable).toBe(false);
  });

  it('maps 429 to RATE_LIMIT (retryable)', () => {
    const mapped = mapFirecrawlError(new SdkError('slow down', 429));
    expect(mapped.category).toBe(FailureCategory.RATE_LIMIT);
    expect(mapped.retryable).toBe(true);
  });

  it('maps 5xx to FIRECRAWL_ERROR (retryable)', () => {
    const mapped = mapFirecrawlError(new SdkError('boom', 503));
    expect(mapped.category).toBe(FailureCategory.FIRECRAWL_ERROR);
    expect(mapped.retryable).toBe(true);
  });

  it('maps network errors to NETWORK_FAILURE', () => {
    const mapped = mapFirecrawlError(new Error('fetch failed: ECONNREFUSED'));
    expect(mapped.category).toBe(FailureCategory.NETWORK_FAILURE);
  });
});

describe('MockFirecrawlClient', () => {
  it('returns canned search results without network', async () => {
    const client = new MockFirecrawlClient();
    const result = await client.search('anything');
    expect(result.sources.length).toBeGreaterThan(0);
    expect(result.sources[0]!.url).toContain('http');
  });

  it('can be configured to throw for failure-path tests', async () => {
    const err = mapFirecrawlError(new SdkError('slow down', 429));
    const client = new MockFirecrawlClient({ throwOn: { search: err } });
    await expect(client.search('x')).rejects.toMatchObject({
      category: FailureCategory.RATE_LIMIT,
    });
  });
});

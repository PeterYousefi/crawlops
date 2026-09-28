import { describe, it, expect } from 'vitest';
import {
  classifySource,
  computeAuthorityMetrics,
  parseHostname,
  hostMatches,
  SourceAuthority,
} from './source-authority.js';

describe('parseHostname', () => {
  it('lowercases, strips www and port', () => {
    expect(parseHostname('https://WWW.GitHub.com:443/x')).toBe('github.com');
  });
  it('returns null for non-http(s) or unparsable', () => {
    expect(parseHostname('ftp://example.com')).toBeNull();
    expect(parseHostname('not a url')).toBeNull();
    expect(parseHostname('javascript:alert(1)')).toBeNull();
  });
});

describe('hostMatches (boundary-safe)', () => {
  it('matches exact and subdomains', () => {
    expect(hostMatches('github.com', 'github.com')).toBe(true);
    expect(hostMatches('docs.github.com', 'github.com')).toBe(true);
  });
  it('does NOT match lookalikes or suffix tricks', () => {
    expect(hostMatches('evilgithub.com', 'github.com')).toBe(false);
    expect(hostMatches('github.com.evil.com', 'github.com')).toBe(false);
    expect(hostMatches('notgithub.com', 'github.com')).toBe(false);
  });
});

describe('classifySource', () => {
  // A. official domain -> PRIMARY
  it('A: official organization domain -> PRIMARY', () => {
    const c = classifySource('https://github.com/openai');
    expect(c.authority).toBe(SourceAuthority.PRIMARY);
    expect(c.domain).toBe('github.com');
    expect(c.reason).toMatch(/official/i);
  });

  // B. official subdomain -> PRIMARY (only because the BASE domain is recognized)
  it('B: official documentation subdomain -> PRIMARY (recognized base)', () => {
    expect(classifySource('https://docs.github.com/en/actions').authority).toBe(SourceAuthority.PRIMARY);
    expect(classifySource('https://learn.microsoft.com/azure').authority).toBe(SourceAuthority.PRIMARY);
    expect(classifySource('https://cloud.google.com/run').authority).toBe(SourceAuthority.PRIMARY);
    expect(classifySource('https://docs.aws.amazon.com/lambda').authority).toBe(SourceAuthority.PRIMARY);
    expect(classifySource('https://docs.firecrawl.dev/introduction').authority).toBe(SourceAuthority.PRIMARY);
  });

  // Regression: a documentation-style subdomain must NOT become PRIMARY unless
  // its base domain is a recognized official/vendor/institutional domain. The
  // doc/learn/api label is not itself evidence of officialness.
  it('B-regression: doc-style subdomain of an UNRECOGNIZED base -> UNKNOWN', () => {
    expect(classifySource('https://docs.randomunknownsite.com/guide').authority).toBe(
      SourceAuthority.UNKNOWN,
    );
    expect(classifySource('https://api.some-random-blog.com/v1').authority).toBe(
      SourceAuthority.UNKNOWN,
    );
    expect(classifySource('https://learn.not-a-real-vendor.example/x').authority).toBe(
      SourceAuthority.UNKNOWN,
    );
    expect(classifySource('https://developer.totally-unknown.org/docs').authority).toBe(
      SourceAuthority.UNKNOWN,
    );
  });

  // C. lookalike domain -> must NOT be GitHub official
  it('C: lookalike domain is NOT classified as the official org', () => {
    const c = classifySource('https://fakegithub.com/login');
    expect(c.authority).not.toBe(SourceAuthority.PRIMARY);
    expect(c.authority).toBe(SourceAuthority.UNKNOWN);
    const c2 = classifySource('https://evilgithub.com');
    expect(c2.authority).toBe(SourceAuthority.UNKNOWN);
  });

  // D. reddit.com -> COMMUNITY
  it('D: reddit.com -> COMMUNITY', () => {
    const c = classifySource('https://www.reddit.com/r/programming');
    expect(c.authority).toBe(SourceAuthority.COMMUNITY);
    expect(c.reason).toMatch(/community/i);
  });

  // E. normal third-party article/blog -> SECONDARY (known) or UNKNOWN (unknown)
  it('E: known publication -> SECONDARY; unknown blog -> UNKNOWN', () => {
    expect(classifySource('https://techcrunch.com/2026/01/01/x').authority).toBe(SourceAuthority.SECONDARY);
    expect(classifySource('https://en.wikipedia.org/wiki/Falcon_9').authority).toBe(SourceAuthority.SECONDARY);
    expect(classifySource('https://some-personal-blog.example/post').authority).toBe(SourceAuthority.UNKNOWN);
  });

  it('gov/academic -> PRIMARY', () => {
    expect(classifySource('https://www.nasa.gov/mission').authority).toBe(SourceAuthority.PRIMARY);
    expect(classifySource('https://mit.edu/research').authority).toBe(SourceAuthority.PRIMARY);
    expect(classifySource('https://www.gov.uk/guidance').authority).toBe(SourceAuthority.PRIMARY);
  });

  it('unparsable url -> UNKNOWN with null domain', () => {
    const c = classifySource('not-a-url');
    expect(c.authority).toBe(SourceAuthority.UNKNOWN);
    expect(c.domain).toBeNull();
  });
});

describe('computeAuthorityMetrics', () => {
  // F. zero sources -> primaryShare null
  it('F: zero sources -> primaryShare null, all counts 0', () => {
    const m = computeAuthorityMetrics([]);
    expect(m.totalSources).toBe(0);
    expect(m.primarySources).toBe(0);
    expect(m.primaryShare).toBeNull();
  });

  // G. mix: 3 primary, 1 secondary, 1 community -> counts + share 0.6
  it('G: mix 3 primary / 1 secondary / 1 community -> primaryShare 0.6', () => {
    const m = computeAuthorityMetrics([
      'https://github.com/a',
      'https://docs.github.com/b',
      'https://nasa.gov/c',
      'https://techcrunch.com/d',
      'https://reddit.com/r/e',
    ]);
    expect(m.totalSources).toBe(5);
    expect(m.primarySources).toBe(3);
    expect(m.secondarySources).toBe(1);
    expect(m.communitySources).toBe(1);
    expect(m.unknownSources).toBe(0);
    expect(m.primaryShare).toBeCloseTo(0.6, 5);
  });

  it('lookalikes do not inflate primary count', () => {
    const m = computeAuthorityMetrics(['https://fakegithub.com', 'https://evilgithub.com']);
    expect(m.primarySources).toBe(0);
    expect(m.unknownSources).toBe(2);
    expect(m.primaryShare).toBe(0);
  });
});

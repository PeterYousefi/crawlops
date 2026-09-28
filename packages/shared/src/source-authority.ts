/**
 * Source authority classification (deterministic, no LLM, no network).
 *
 * WHAT: Given a source URL, estimate how close the source is to the original
 *       organization / official documentation, in four understandable buckets:
 *       PRIMARY | SECONDARY | COMMUNITY | UNKNOWN.
 * WHY:  CrawlOps should surface not just whether sources exist, but whether the
 *       research leaned on authoritative/first-party provenance. This is an
 *       estimate of PROVENANCE, not a truth score.
 * HOW:  Pure, rule-based hostname matching. All domain rules live in ONE place
 *       (this module) so they are auditable and never scattered across the app.
 *
 * HONEST LIMITATIONS (read before extending):
 * - This is NOT a truth score. PRIMARY does not mean "correct"; COMMUNITY does
 *   not mean "wrong". It estimates whether a source is close to the original
 *   organization or documentation.
 * - Classification is best-effort and deliberately conservative. When we cannot
 *   confidently place a domain, we return UNKNOWN rather than guessing.
 */

/** Authority buckets, ordered from most to least first-party. */
export const SourceAuthority = {
  /** First-party: the org/product itself, official docs, or gov/academic. */
  PRIMARY: 'PRIMARY',
  /** News, publications, blogs, comparison/aggregator sites. */
  SECONDARY: 'SECONDARY',
  /** Community/social discussion platforms (Q&A, forums, social). */
  COMMUNITY: 'COMMUNITY',
  /** Not confidently classifiable. */
  UNKNOWN: 'UNKNOWN',
} as const;
export type SourceAuthority = (typeof SourceAuthority)[keyof typeof SourceAuthority];

export interface AuthorityClassification {
  /** The original URL, unchanged. */
  url: string;
  /** The parsed registrable-ish hostname (lowercased, no port), or null if unparsable. */
  domain: string | null;
  authority: SourceAuthority;
  /** Short human-readable justification of the bucket. */
  reason: string;
}

/**
 * Safe hostname parsing.
 * - Uses the URL parser (never substring matching) so `evilgithub.com` is NOT
 *   confused with `github.com`.
 * - Lowercases, strips a leading `www.`, drops any port.
 * - Returns null when the value is not a parseable http(s) URL with a host.
 */
export function parseHostname(url: string): string | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  let host = u.hostname.toLowerCase();
  if (!host) return null;
  if (host.startsWith('www.')) host = host.slice(4);
  return host;
}

/**
 * Does `host` equal `base`, or is it a subdomain of `base`?
 * Boundary-safe: matches `base` and `*.base`, but NOT `evilbase` or
 * `notbase.com`. Comparison is on full label boundaries only.
 *
 *   hostMatches('docs.github.com', 'github.com')  -> true
 *   hostMatches('github.com',      'github.com')  -> true
 *   hostMatches('evilgithub.com',  'github.com')  -> false
 *   hostMatches('github.com.evil.com', 'github.com') -> false
 */
export function hostMatches(host: string, base: string): boolean {
  if (host === base) return true;
  return host.endsWith('.' + base);
}

/** Return the first base in `bases` that `host` matches, or null. */
function firstMatch(host: string, bases: readonly string[]): string | null {
  for (const base of bases) {
    if (hostMatches(host, base)) return base;
  }
  return null;
}

// ---------------------------------------------------------------------------
// RULE TABLES (the single source of truth for domain authority)
// ---------------------------------------------------------------------------

/**
 * Community / social discussion platforms. Checked FIRST so that, e.g., a
 * subdomain that is clearly community is never mislabeled.
 */
const COMMUNITY_DOMAINS: readonly string[] = [
  'reddit.com',
  'quora.com',
  'stackoverflow.com',
  'stackexchange.com',
  'news.ycombinator.com',
  'ycombinator.com',
  'medium.com', // open publishing / community authorship
  'dev.to',
  'hashnode.com',
  'substack.com',
  'x.com',
  'twitter.com',
  'facebook.com',
  'linkedin.com',
  'instagram.com',
  'tiktok.com',
  'youtube.com',
  'discord.com',
  'discord.gg',
  'telegram.org',
  't.me',
  'mastodon.social',
];

/**
 * Public-suffix-style groups that make a domain PRIMARY by provenance:
 * government and academic institutions. Matched on the trailing label(s).
 * (A conservative subset; extend as needed.)
 */
const PRIMARY_TLD_SUFFIXES: readonly string[] = [
  'gov', // e.g. nasa.gov, whitehouse.gov, gov.uk handled below
  'mil',
  'edu',
  'ac.uk',
  'gov.uk',
  'edu.au',
  'gov.au',
  'ac.jp',
  'go.jp',
  'europa.eu', // EU institutions
];

/**
 * Well-known official documentation / vendor domains that are first-party for
 * the products they represent. Subdomains included via hostMatches (so
 * `docs.github.com`, `learn.microsoft.com`, `cloud.google.com`, and
 * `docs.aws.amazon.com` all resolve to PRIMARY).
 */
const PRIMARY_OFFICIAL_DOMAINS: readonly string[] = [
  // Developer platforms / vendors commonly researched.
  'github.com',
  'gitlab.com',
  'microsoft.com',
  'apple.com',
  'google.com',
  'cloud.google.com',
  'amazon.com',
  'aws.amazon.com',
  'oracle.com',
  'ibm.com',
  'nvidia.com',
  'intel.com',
  'stripe.com',
  'adyen.com',
  'paypal.com',
  'openai.com',
  'anthropic.com',
  'firecrawl.dev',
  'postgresql.org',
  'mysql.com',
  'mongodb.com',
  'redis.io',
  'kubernetes.io',
  'docker.com',
  'python.org',
  'nodejs.org',
  'mozilla.org',
  'developer.mozilla.org',
  'spacex.com',
  'blueorigin.com',
  'rocketlabusa.com',
  'nasa.gov',
];

/**
 * News / publications / blogs / comparison & aggregator sites. Classified as
 * SECONDARY. This list is intentionally small; anything not matched here and
 * not primary/community falls through to UNKNOWN (we do not guess).
 */
const SECONDARY_DOMAINS: readonly string[] = [
  'wikipedia.org',
  'techcrunch.com',
  'theverge.com',
  'wired.com',
  'arstechnica.com',
  'zdnet.com',
  'cnet.com',
  'forbes.com',
  'bloomberg.com',
  'reuters.com',
  'nytimes.com',
  'wsj.com',
  'businessinsider.com',
  'g2.com',
  'capterra.com',
  'gartner.com',
  'trustradius.com',
  'stackshare.io',
  'infoworld.com',
  'venturebeat.com',
];

// ---------------------------------------------------------------------------
// CLASSIFIER
// ---------------------------------------------------------------------------

/** Does the host end with one of the PRIMARY tld suffixes (label-safe)? */
function matchesPrimaryTld(host: string): string | null {
  for (const suffix of PRIMARY_TLD_SUFFIXES) {
    // suffix may be single-label ('gov') or multi ('ac.uk'); match on boundary.
    if (host === suffix || host.endsWith('.' + suffix)) return suffix;
  }
  return null;
}

/**
 * Classify a single source URL into an authority bucket with a reason.
 * Order of precedence (deterministic):
 *   1. Unparsable / non-http(s)        -> UNKNOWN
 *   2. Community/social platforms      -> COMMUNITY
 *   3. Government / academic suffix    -> PRIMARY
 *   4. Known official/vendor domain    -> PRIMARY (subdomains included)
 *   5. Known news/publication/compare  -> SECONDARY
 *   6. Everything else                 -> UNKNOWN
 *
 * NOTE on documentation subdomains: `docs.`, `learn.`, `developer.`, `api.`
 * etc. are NOT a PRIMARY signal on their own. `docs.github.com` is PRIMARY only
 * because its BASE domain (github.com) is a recognized official domain, which
 * step 4 already matches via subdomain-safe `hostMatches`. An unrecognized base
 * such as `docs.randomunknownsite.com` or `api.some-random-blog.com` stays
 * UNKNOWN — we never treat a doc-style label as evidence of officialness.
 */
export function classifySource(url: string): AuthorityClassification {
  const domain = parseHostname(url);
  if (!domain) {
    return {
      url,
      domain: null,
      authority: SourceAuthority.UNKNOWN,
      reason: 'URL could not be parsed into a valid host.',
    };
  }

  // 2) Community first (so e.g. medium.com is never caught by a doc heuristic).
  const community = firstMatch(domain, COMMUNITY_DOMAINS);
  if (community) {
    return {
      url,
      domain,
      authority: SourceAuthority.COMMUNITY,
      reason: `Community discussion platform (${community}).`,
    };
  }

  // 3) Government / academic provenance.
  const tld = matchesPrimaryTld(domain);
  if (tld) {
    return {
      url,
      domain,
      authority: SourceAuthority.PRIMARY,
      reason: `Government/academic domain (.${tld}).`,
    };
  }

  // 4) Known official / vendor domain (subdomains included).
  const official = firstMatch(domain, PRIMARY_OFFICIAL_DOMAINS);
  if (official) {
    return {
      url,
      domain,
      authority: SourceAuthority.PRIMARY,
      reason: `Official organization/product domain (${official}).`,
    };
  }

  // 5) Known news/publication/comparison site.
  const secondary = firstMatch(domain, SECONDARY_DOMAINS);
  if (secondary) {
    return {
      url,
      domain,
      authority: SourceAuthority.SECONDARY,
      reason: `News/publication/comparison site (${secondary}).`,
    };
  }

  // 7) Not confidently classifiable.
  return {
    url,
    domain,
    authority: SourceAuthority.UNKNOWN,
    reason: 'Not confidently classifiable from the domain alone.',
  };
}

// ---------------------------------------------------------------------------
// METRICS
// ---------------------------------------------------------------------------

export interface AuthorityMetrics {
  totalSources: number;
  primarySources: number;
  secondarySources: number;
  communitySources: number;
  unknownSources: number;
  /** primarySources / totalSources; null when there are zero sources. */
  primaryShare: number | null;
}

/**
 * Compute authority metrics over a set of source URLs. Honest denominator:
 * when there are no sources, `primaryShare` is null (never a fake 0).
 */
export function computeAuthorityMetrics(urls: readonly string[]): AuthorityMetrics {
  let primary = 0;
  let secondary = 0;
  let community = 0;
  let unknown = 0;

  for (const url of urls) {
    switch (classifySource(url).authority) {
      case SourceAuthority.PRIMARY:
        primary++;
        break;
      case SourceAuthority.SECONDARY:
        secondary++;
        break;
      case SourceAuthority.COMMUNITY:
        community++;
        break;
      default:
        unknown++;
        break;
    }
  }

  const total = urls.length;
  return {
    totalSources: total,
    primarySources: primary,
    secondarySources: secondary,
    communitySources: community,
    unknownSources: unknown,
    primaryShare: total > 0 ? primary / total : null,
  };
}

/** Convenience: classify a list of URLs, preserving order. */
export function classifySources(urls: readonly string[]): AuthorityClassification[] {
  return urls.map((u) => classifySource(u));
}

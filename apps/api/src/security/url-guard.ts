/**
 * SSRF guard for user-supplied URLs.
 *
 * WHAT: Validates that a URL is safe to hand to Firecrawl for scraping/crawling.
 * WHY:  CrawlOps accepts URLs from users. Without validation, an attacker could
 *       point the server at internal services (cloud metadata endpoints, private
 *       IPs) — a Server-Side Request Forgery (SSRF) risk.
 * HOW:  Allow only http/https, reject obvious private/link-local/loopback hosts
 *       and the cloud metadata IP. DNS-level checks are a further hardening step
 *       for a later phase (documented in ARCHITECTURE.md).
 */

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '::1',
  '169.254.169.254', // cloud instance metadata
  'metadata.google.internal',
]);

function isPrivateIpv4(host: string): boolean {
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  return false;
}

export interface UrlValidationResult {
  ok: boolean;
  reason?: string;
}

export function validateUserUrl(raw: string): UrlValidationResult {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: 'not a valid URL' };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, reason: `unsupported protocol ${url.protocol}` };
  }
  const host = url.hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(host)) {
    return { ok: false, reason: 'host is not allowed' };
  }
  if (isPrivateIpv4(host)) {
    return { ok: false, reason: 'private IP addresses are not allowed' };
  }
  return { ok: true };
}

export function validateUserUrls(urls: string[]): UrlValidationResult {
  for (const u of urls) {
    const r = validateUserUrl(u);
    if (!r.ok) return { ok: false, reason: `${u}: ${r.reason}` };
  }
  return { ok: true };
}

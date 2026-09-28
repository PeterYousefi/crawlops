import { useState } from 'react';
import { ExternalLink, Globe } from 'lucide-react';
import type { Source, SourceQuality } from '@crawlops/shared';
import { Empty } from './primitives';
import { AuthorityBadge } from './authority-badge';

/** Extract a display domain from a URL, falling back to the raw string. */
function domainOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

// Real Firecrawl descriptions can be long (e.g. a README blob). Clamp to a few
// lines with a show-more/less toggle. Only clamp when it's actually long.
const CLAMP_CHARS = 240;

function SourceDescription({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = text.length > CLAMP_CHARS;
  return (
    <div className="mt-2.5 border-l-2 border-border pl-3">
      <p
        className={
          'text-xs leading-relaxed text-muted-foreground' + (isLong && !expanded ? ' line-clamp-3' : '')
        }
      >
        {text}
      </p>
      {isLong ? (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-1 rounded text-[11px] font-medium text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          aria-expanded={expanded}
        >
          {expanded ? 'Show less' : 'Show more'}
        </button>
      ) : null}
    </div>
  );
}

/**
 * Compact source-quality summary. Authority estimates whether a source is close
 * to the original organization/documentation (provenance), not correctness.
 */
function SourceQualitySummary({ quality }: { quality: SourceQuality }) {
  const sharePct = quality.primaryShare != null ? `${Math.round(quality.primaryShare * 100)}%` : '—';
  const rows: Array<[string, number | string]> = [
    ['Primary', quality.primarySources],
    ['Secondary', quality.secondarySources],
    ['Community', quality.communitySources],
    ['Unknown', quality.unknownSources],
    ['Primary share', sharePct],
  ];
  return (
    <div className="mb-3 rounded-lg border border-border bg-surface px-4 py-3">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
          Source quality
        </span>
        <span
          className="text-[10.5px] text-muted-foreground/70"
          title="Authority estimates whether a source is close to the original organization or documentation. It is not a truth score."
        >
          provenance estimate, not truth
        </span>
      </div>
      <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-5">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-baseline justify-between gap-2 sm:flex-col sm:items-start sm:justify-start">
            <dt className="text-[11px] text-muted-foreground">{label}</dt>
            <dd className="font-mono text-sm tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

// Uses ONLY real API Source fields: url, title, description, rank, and the
// read-time authority classification (domain/authority/authorityReason).
export function SourceList({ sources, quality }: { sources: Source[]; quality?: SourceQuality }) {
  if (sources.length === 0) {
    return <Empty>No sources retrieved.</Empty>;
  }
  return (
    <>
      {quality ? <SourceQualitySummary quality={quality} /> : null}
      <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
      {sources.map((s, i) => (
        <li key={s.id} className="group flex gap-3 px-4 py-3.5 transition-colors hover:bg-surface-raised">
          <span
            aria-label={`Source ${i + 1}`}
            className="mt-px w-5 shrink-0 font-mono text-[11px] text-muted-foreground/70 tabular-nums"
          >
            {String(s.rank ?? i + 1).padStart(2, '0')}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Globe className="h-3.5 w-3.5" />
                  <span className="font-mono">{domainOf(s.url)}</span>
                  <AuthorityBadge authority={s.authority} title={s.authorityReason} />
                </div>
                <div className="mt-1 truncate text-sm font-medium">{s.title ?? '(untitled)'}</div>
                <a
                  href={s.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="mt-0.5 block truncate font-mono text-xs text-muted-foreground hover:text-primary"
                >
                  {s.url}
                </a>
              </div>
              <a
                href={s.url}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground transition-colors hover:border-border-strong hover:bg-surface-raised hover:text-foreground"
              >
                Open <ExternalLink className="h-3 w-3" />
              </a>
            </div>
            {s.description ? <SourceDescription text={s.description} /> : null}
          </div>
        </li>
      ))}
      </ul>
    </>
  );
}

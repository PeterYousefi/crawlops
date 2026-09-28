import type { SourceAuthority } from '@crawlops/shared';
import { cn } from '@/lib/utils';

/**
 * Small badge for a source's authority bucket. Authority estimates whether a
 * source is close to the original organization/documentation (provenance) — it
 * is NOT a truth score. Tones are neutral-to-positive; COMMUNITY/UNKNOWN are
 * deliberately not styled as "bad".
 */
const TONES: Record<SourceAuthority, string> = {
  PRIMARY: 'border-success/35 bg-success/10 text-success',
  SECONDARY: 'border-info/35 bg-info/10 text-info',
  COMMUNITY: 'border-warning/35 bg-warning/10 text-warning',
  UNKNOWN: 'border-border-strong bg-muted text-muted-foreground',
};

export function AuthorityBadge({
  authority,
  title,
  className,
}: {
  authority: SourceAuthority;
  title?: string;
  className?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        'inline-flex items-center rounded border px-1.5 py-px font-mono text-[10px] tracking-wider uppercase',
        TONES[authority],
        className,
      )}
    >
      {authority}
    </span>
  );
}

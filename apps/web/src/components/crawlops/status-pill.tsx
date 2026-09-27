import { CheckCircle2, CircleDashed, Loader2, XCircle, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { RunStatus } from '@crawlops/shared';

// Maps the REAL CrawlOps RunStatus (PENDING/RUNNING/SUCCESS/PARTIAL/FAILED) to
// the approved Lovable pill styling. PARTIAL uses the warning tone.
const map: Record<RunStatus, { label: string; icon: typeof CheckCircle2; className: string }> = {
  SUCCESS: {
    label: 'SUCCESS',
    icon: CheckCircle2,
    className: 'border-success/35 bg-success/10 text-success',
  },
  PARTIAL: {
    label: 'PARTIAL',
    icon: AlertTriangle,
    className: 'border-warning/35 bg-warning/10 text-warning',
  },
  FAILED: {
    label: 'FAILED',
    icon: XCircle,
    className: 'border-destructive/35 bg-destructive/10 text-destructive',
  },
  RUNNING: {
    label: 'RUNNING',
    icon: Loader2,
    className: 'border-info/35 bg-info/10 text-info',
  },
  PENDING: {
    label: 'PENDING',
    icon: CircleDashed,
    className: 'border-border-strong bg-muted text-muted-foreground',
  },
};

export function StatusPill({
  status,
  size = 'sm',
  className,
}: {
  status: RunStatus;
  size?: 'sm' | 'lg';
  className?: string;
}) {
  const entry = map[status] ?? map.PENDING;
  const { label, icon: Icon, className: tone } = entry;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md border font-mono font-medium tracking-wider uppercase',
        size === 'lg' ? 'px-3 py-1.5 text-sm' : 'px-2 py-0.5 text-[11px]',
        tone,
        className,
      )}
    >
      <Icon className={cn(size === 'lg' ? 'h-4 w-4' : 'h-3 w-3', status === 'RUNNING' && 'animate-spin')} />
      {label}
    </span>
  );
}

/** Pass/fail pill for individual deterministic checks. */
export function CheckPill({ passed }: { passed: boolean }) {
  const tone = passed
    ? 'border-success/35 bg-success/10 text-success'
    : 'border-destructive/35 bg-destructive/10 text-destructive';
  const Icon = passed ? CheckCircle2 : XCircle;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 font-mono text-[11px] tracking-wider uppercase',
        tone,
      )}
    >
      <Icon className="h-3 w-3" />
      {passed ? 'pass' : 'fail'}
    </span>
  );
}

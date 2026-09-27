import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Section header used across detail screens — label + optional right slot. */
export function SectionHeader({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex items-end justify-between gap-4', className)}>
      <div>
        <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
        {description ? <p className="mt-0.5 text-xs text-muted-foreground">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

/** Flat bordered panel. Deliberately low-elevation — not a floating card. */
export function Panel({
  children,
  className,
  padded = true,
}: {
  children: ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <div
      className={cn(
        'rounded-lg border border-border bg-surface shadow-panel',
        padded && 'p-4',
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Dense key/value row for metadata lists. */
export function MetaRow({
  label,
  children,
  mono = true,
}: {
  label: string;
  children: ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-6 border-b border-border/70 py-2 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={cn('text-right text-xs', mono && 'font-mono')}>{children}</span>
    </div>
  );
}

/** Large stat presented as text, not a chart. */
export function Stat({
  label,
  value,
  hint,
  tone = 'default',
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: 'default' | 'success' | 'danger' | 'warning';
}) {
  const toneClass = {
    default: 'text-foreground',
    success: 'text-success',
    danger: 'text-destructive',
    warning: 'text-warning',
  }[tone];
  return (
    <div className="px-5 py-4">
      <div className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
        {label}
      </div>
      <div
        className={cn(
          'mt-2 font-mono text-[28px] leading-none font-semibold tracking-tight tabular-nums',
          toneClass,
        )}
      >
        {value}
      </div>
      {hint ? <div className="mt-2 text-xs text-muted-foreground">{hint}</div> : null}
    </div>
  );
}

/** Read-only code surface with optional line numbers. */
export function CodeBlock({
  code,
  lineNumbers = true,
  className,
  highlightLines = [],
}: {
  code: string;
  lineNumbers?: boolean;
  className?: string;
  highlightLines?: number[];
}) {
  const lines = code.split('\n');
  return (
    <pre
      className={cn(
        'scrollbar-thin overflow-x-auto rounded-md border border-border bg-background p-3 font-mono text-xs leading-relaxed',
        className,
      )}
    >
      <code>
        {lines.map((line, i) => (
          <div
            key={i}
            className={cn(
              'flex gap-4',
              highlightLines.includes(i + 1) &&
                '-mx-3 border-l-2 border-destructive bg-destructive/10 px-3 pl-[10px]',
            )}
          >
            {lineNumbers ? (
              <span className="w-6 shrink-0 text-right text-muted-foreground/50 select-none">
                {i + 1}
              </span>
            ) : null}
            <span className="whitespace-pre">{line || ' '}</span>
          </div>
        ))}
      </code>
    </pre>
  );
}

/** Dashed empty-state box. */
export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}

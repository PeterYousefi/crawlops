import { useState, type ReactNode } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { LayoutDashboard, FlaskConical, ListChecks, Menu, X, Spline } from 'lucide-react';
import { cn } from '@/lib/utils';

// Ported from the approved Lovable design. Uses react-router-dom NavLink instead
// of TanStack Link so it fits the existing app's routing.
const nav = [
  { to: '/', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/evaluations', label: 'Evaluations', icon: FlaskConical, end: false },
  { to: '/runs', label: 'Runs', icon: ListChecks, end: false },
] as const;

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="space-y-0.5">
      {nav.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              'flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors',
              isActive
                ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium ring-1 ring-inset ring-sidebar-border'
                : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
            )
          }
        >
          <Icon className="h-4 w-4 shrink-0 opacity-80" />
          {label}
        </NavLink>
      ))}
    </nav>
  );
}

function Brand() {
  return (
    <Link to="/" className="flex items-center gap-2.5">
      <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
        <Spline className="h-4 w-4" />
      </span>
      <span className="text-sm font-semibold tracking-tight">
        Crawl<span className="text-primary">Ops</span>
      </span>
    </Link>
  );
}

function SidebarBody({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-14 items-center border-b border-sidebar-border px-4">
        <Brand />
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        <div className="mb-2 px-2.5 text-[11px] tracking-wider text-muted-foreground uppercase">
          Workspace
        </div>
        <NavLinks onNavigate={onNavigate} />
      </div>
      <div className="flex items-center gap-2 border-t border-sidebar-border px-5 py-3 font-mono text-[11px] text-muted-foreground">
        <span className="h-1.5 w-1.5 rounded-full bg-success" />
        production
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="min-h-screen bg-background">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-56 border-r border-sidebar-border bg-sidebar lg:block">
        <SidebarBody />
      </aside>
      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            aria-label="Close navigation"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-background/80 backdrop-blur-sm"
          />
          <div className="absolute inset-y-0 left-0 w-64 border-r border-sidebar-border bg-sidebar shadow-float">
            <SidebarBody onNavigate={() => setOpen(false)} />
          </div>
        </div>
      ) : null}
      <div className="lg:pl-56">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border bg-background/85 px-4 backdrop-blur lg:hidden">
          <button
            aria-label="Open navigation"
            onClick={() => setOpen(true)}
            className="rounded-md border border-border p-1.5 hover:bg-surface"
          >
            {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
          <Brand />
        </header>
        <main>{children}</main>
      </div>
    </div>
  );
}

export function PageHeader({
  title,
  description,
  breadcrumb,
  actions,
}: {
  title: ReactNode;
  description?: ReactNode;
  breadcrumb?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="border-b border-border bg-surface/40">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-5 py-6 sm:flex-row sm:items-start sm:justify-between lg:px-8">
        <div className="min-w-0">
          {breadcrumb ? <div className="mb-2 text-xs text-muted-foreground">{breadcrumb}</div> : null}
          <h1 className="truncate text-xl font-semibold tracking-tight">{title}</h1>
          {description ? <div className="mt-1 text-sm text-muted-foreground">{description}</div> : null}
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </div>
    </div>
  );
}

export function PageBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('mx-auto max-w-6xl px-5 py-6 lg:px-8', className)}>{children}</div>;
}

import { Surface } from './Surface';

interface SkeletonProps {
  className?: string;
}

/** Base shimmering block. Compose these into page-shaped skeletons. */
export function Skeleton({ className = '' }: SkeletonProps) {
  return (
    <div
      className={`animate-pulse rounded-lg bg-slate-200/80 dark:bg-slate-700/50 ${className}`}
    />
  );
}

// The skeletons are the reference consumer for <Surface>: they used to
// hand-write `rounded-2xl border border-office-border bg-white ...`, which
// is exactly why a loading card never quite matched the real card it stood
// in for. Going through the primitive means they can no longer drift.
export function SkeletonStatCards({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <Surface key={i} className="p-5">
          <Skeleton className="h-11 w-11 rounded-xl mb-4" />
          <Skeleton className="h-7 w-16 mb-2" />
          <Skeleton className="h-4 w-24" />
        </Surface>
      ))}
    </div>
  );
}

export function SkeletonTable({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <Surface className="p-4">
      <div className="mb-4 flex items-center justify-between">
        <Skeleton className="h-9 w-64 rounded-xl" />
      </div>
      <div className="space-y-2">
        <div className="flex gap-3 pb-2">
          {Array.from({ length: cols }).map((_, i) => (
            <Skeleton key={i} className="h-4 flex-1" />
          ))}
        </div>
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="flex gap-3 py-2">
            {Array.from({ length: cols }).map((_, c) => (
              <Skeleton key={c} className="h-5 flex-1" />
            ))}
          </div>
        ))}
      </div>
    </Surface>
  );
}

export function SkeletonPage() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-28 w-full rounded-panel" />
      <SkeletonStatCards />
      <SkeletonTable />
    </div>
  );
}

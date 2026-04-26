import clsx from 'clsx';

/**
 * A subtle pulsing placeholder for loading states. Use this in place of bare
 * spinner + "loading…" text so empty UI doesn't flash.
 *
 * Usage:
 *   <Skeleton className="h-6 w-40" />
 *   <SkeletonRow />
 *   <SkeletonGrid count={3} />
 */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={clsx(
        'animate-pulse rounded-xl bg-gradient-to-r from-slate-100 via-slate-200 to-slate-100',
        className,
      )}
    />
  );
}

export function SkeletonRow() {
  return (
    <div className="flex items-center gap-3 p-3">
      <Skeleton className="h-10 w-10 flex-none rounded-full" />
      <div className="flex flex-1 flex-col gap-1.5">
        <Skeleton className="h-3.5 w-1/3" />
        <Skeleton className="h-3 w-2/3" />
      </div>
      <Skeleton className="h-3.5 w-16 flex-none" />
    </div>
  );
}

export function SkeletonGrid({ count = 4 }: { count?: number }) {
  return (
    <div className="flex flex-col">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonRow key={i} />
      ))}
    </div>
  );
}

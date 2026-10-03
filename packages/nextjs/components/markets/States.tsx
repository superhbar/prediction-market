import Link from "next/link";

type EmptyStateProps = {
  title: string;
  body: string;
  actionHref?: string;
  actionLabel?: string;
};

export function EmptyState({ title, body, actionHref, actionLabel }: EmptyStateProps) {
  return (
    <div className="panel border-dashed p-10 text-center">
      <p className="text-lg font-semibold m-0">{title}</p>
      <p className="text-sm text-base-content/60 mt-2 mb-0">{body}</p>
      {actionHref && actionLabel && (
        <Link href={actionHref} className="btn btn-primary btn-sm mt-5">
          {actionLabel}
        </Link>
      )}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="panel border-error/40 p-10 text-center">
      <p className="text-lg font-semibold m-0">Something failed to load</p>
      <p className="text-sm text-base-content/60 mt-2 mb-0">{message}</p>
      {onRetry && (
        <button className="btn btn-sm btn-outline mt-5" onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  );
}

export function MarketCardSkeleton() {
  return (
    <div className="panel p-5" aria-hidden>
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-base-300 animate-pulse" />
        <div className="h-4 w-28 rounded bg-base-300 animate-pulse" />
      </div>
      <div className="h-5 w-full rounded bg-base-300 animate-pulse mt-5" />
      <div className="h-2 w-full rounded-full bg-base-300 animate-pulse mt-6" />
      <div className="grid grid-cols-2 gap-2 mt-5">
        <div className="h-10 rounded-xl bg-base-300 animate-pulse" />
        <div className="h-10 rounded-xl bg-base-300 animate-pulse" />
      </div>
    </div>
  );
}

export function MarketDetailSkeleton() {
  return (
    <div aria-hidden className="mt-8">
      <div className="h-4 w-48 rounded bg-base-300 animate-pulse" />
      <div className="h-10 w-full max-w-2xl rounded bg-base-300 animate-pulse mt-4" />
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mt-8">
        <div className="lg:col-span-8 h-72 panel animate-pulse" />
        <div className="lg:col-span-4 h-72 panel animate-pulse" />
      </div>
    </div>
  );
}

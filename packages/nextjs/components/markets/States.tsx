import Link from "next/link";

type EmptyStateProps = {
  title: string;
  body: string;
  actionHref?: string;
  actionLabel?: string;
};

export function EmptyState({ title, body, actionHref, actionLabel }: EmptyStateProps) {
  return (
    <div className="border border-dashed border-base-300 p-10 text-center">
      <p className="font-editorial italic text-2xl m-0">{title}</p>
      <p className="text-sm text-base-content/70 mt-2">{body}</p>
      {actionHref && actionLabel && (
        <Link href={actionHref} className="btn btn-primary btn-sm mt-4">
          {actionLabel}
        </Link>
      )}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="border border-error/40 bg-error/5 p-10 text-center">
      <p className="font-editorial italic text-2xl m-0">Something failed to load</p>
      <p className="text-sm text-base-content/70 mt-2">{message}</p>
      {onRetry && (
        <button className="btn btn-sm btn-outline mt-4" onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  );
}

export function MarketCardSkeleton() {
  return (
    <div className="border border-base-300 bg-base-100 p-6" aria-hidden>
      <div className="h-3 w-24 bg-base-300 animate-pulse" />
      <div className="h-7 w-full bg-base-300 animate-pulse mt-3" />
      <div className="h-7 w-2/3 bg-base-300 animate-pulse mt-2" />
      <div className="h-[3px] w-full bg-base-300 animate-pulse mt-6" />
      <div className="h-4 w-32 bg-base-300 animate-pulse mt-4" />
    </div>
  );
}

export function MarketDetailSkeleton() {
  return (
    <div aria-hidden>
      <div className="h-3 w-48 bg-base-300 animate-pulse mt-10" />
      <div className="h-12 w-full bg-base-300 animate-pulse mt-4" />
      <div className="grid grid-cols-2 gap-6 mt-8">
        <div className="h-24 bg-base-300 animate-pulse" />
        <div className="h-24 bg-base-300 animate-pulse" />
      </div>
    </div>
  );
}

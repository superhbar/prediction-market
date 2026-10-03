import type { UiStatus } from "~~/utils/markets/types";

/** Asset tile for a feed like "BTC/USD": the base symbol on a brand gradient. */
export function AssetBadge({ feedLabel, size = "md" }: { feedLabel: string; size?: "md" | "lg" }) {
  const symbol = feedLabel.split("/")[0] ?? feedLabel;
  const box = size === "lg" ? "w-14 h-14 text-sm" : "w-10 h-10 text-[11px]";
  return (
    <span
      aria-hidden
      className={`${box} shrink-0 grid place-items-center rounded-full font-bold text-white bg-gradient-to-br from-hedera-purple to-hedera-cobalt ring-1 ring-white/10`}
    >
      {symbol.slice(0, 4)}
    </span>
  );
}

const STATUS_STYLE: Record<UiStatus, string> = {
  open: "bg-success/15 text-success",
  "awaiting-settlement": "bg-warning/15 text-warning",
  retrying: "bg-warning/15 text-warning",
  "settle-available": "bg-accent/15 text-accent",
  voidable: "bg-error/15 text-error",
  settled: "bg-primary/15 text-primary",
  voided: "bg-base-content/10 text-base-content/70",
};

/** Small colored pill for a market status; pass the label to show. */
export function StatusPill({ status, label }: { status: UiStatus; label: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${STATUS_STYLE[status]}`}
    >
      {status === "open" && <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" aria-hidden />}
      {label}
    </span>
  );
}

/** Two-tone YES/NO share bar. `yes` is a percentage from 0 to 100. */
export function OutcomeBar({ yes, height = "h-2" }: { yes: number; height?: string }) {
  return (
    <div className={`${height} w-full flex overflow-hidden rounded-full bg-base-300`} aria-hidden>
      <div className="bg-yes" style={{ width: `${yes}%` }} />
      <div className="bg-no flex-1" />
    </div>
  );
}

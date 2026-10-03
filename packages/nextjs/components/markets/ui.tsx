import type { PricePoint } from "~~/hooks/markets/useChainlinkHistory";
import { ASSET_COLORS } from "~~/utils/brand";
import type { UiStatus } from "~~/utils/markets/types";

/** Round coin tile for a feed like "BTC/USD": the base symbol on the asset's color. */
export function AssetBadge({ feedLabel, size = "md" }: { feedLabel: string; size?: "md" | "lg" }) {
  const symbol = feedLabel.split("/")[0] ?? feedLabel;
  const box = size === "lg" ? "w-12 h-12 text-xs" : "w-9 h-9 text-[10px]";
  const colors = ASSET_COLORS[symbol];
  return (
    <span
      aria-hidden
      style={colors}
      className={`${box} shrink-0 grid place-items-center rounded-full font-bold ${colors ? "" : "bg-base-300"}`}
    >
      {symbol.slice(0, 4)}
    </span>
  );
}

const STATUS_COLOR: Record<UiStatus, string> = {
  open: "text-success",
  "awaiting-settlement": "text-warning",
  retrying: "text-warning",
  "settle-available": "text-info",
  voidable: "text-error",
  settled: "text-primary",
  voided: "text-base-content/60",
};

/** Colored dot and label for a market status. */
export function StatusPill({ status, label }: { status: UiStatus; label: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs font-semibold whitespace-nowrap ${STATUS_COLOR[status]}`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current" aria-hidden />
      {label}
    </span>
  );
}

/** Two-tone YES/NO share bar. `yes` is a percentage from 0 to 100. */
export function OutcomeBar({ yes, height = "h-1.5" }: { yes: number; height?: string }) {
  return (
    <div className={`${height} w-full flex gap-0.5 overflow-hidden rounded-full`} aria-hidden>
      <div className="bg-yes rounded-full" style={{ width: `${yes}%` }} />
      <div className="bg-no rounded-full flex-1" />
    </div>
  );
}

/** Tiny line of recent Chainlink prices, green when the latest is at or above the first, red below. */
export function Sparkline({ points, className = "" }: { points: PricePoint[]; className?: string }) {
  if (points.length < 2) return <span className={`w-28 h-8 ${className}`} aria-hidden />;
  const values = points.map(point => Number(point.normalized / 10n ** 10n));
  const min = Math.min(...values);
  const span = Math.max(...values) - min || 1;
  const path = values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * 110;
      const y = 28 - ((value - min) / span) * 24;
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const rising = values[values.length - 1] >= values[0];
  return (
    <svg viewBox="0 0 110 32" className={`w-28 h-8 ${rising ? "text-yes" : "text-no"} ${className}`} aria-hidden>
      <path d={path} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" />
    </svg>
  );
}

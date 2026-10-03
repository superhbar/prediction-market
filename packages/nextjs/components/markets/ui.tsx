import type { ReactNode } from "react";
import type { PricePoint } from "~~/hooks/markets/useChainlinkHistory";
import { ASSET_ICONS } from "~~/utils/brand";
import type { UiStatus } from "~~/utils/markets/types";

/** Coin icon for a feed like "BTC/USD": the base asset, with the quote currency as a small badge. */
export function AssetBadge({ feedLabel, size = "md" }: { feedLabel: string; size?: "md" | "lg" }) {
  const [base = feedLabel, quote] = feedLabel.split("/");
  const box = size === "lg" ? "w-12 h-12" : "w-9 h-9";
  const badge = size === "lg" ? "w-5 h-5" : "w-4 h-4";
  return (
    <span aria-hidden className={`${box} relative shrink-0`}>
      <CoinIcon symbol={base} className="w-full h-full" />
      {quote && (
        <CoinIcon symbol={quote} className={`${badge} absolute -right-0.5 -bottom-0.5 outline-2 outline-base-100`} />
      )}
    </span>
  );
}

export function CoinIcon({ symbol, className }: { symbol: string; className: string }) {
  const src = ASSET_ICONS[symbol];
  if (!src) {
    return (
      <span className={`${className} grid place-items-center rounded-full bg-base-300 text-[10px] font-bold`}>
        {symbol.slice(0, 4)}
      </span>
    );
  }
  // Static local SVGs: a plain img keeps them out of the image optimizer.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" className={`${className} rounded-full ring-1 ring-base-content/15`} />;
}

const STATUS_COLOR: Record<UiStatus, string> = {
  open: "text-success",
  "awaiting-settlement": "text-info",
  retrying: "text-info",
  "settle-available": "text-info",
  "no-price": "text-warning",
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

type Tab<T extends string> = { value: T; label: ReactNode; count?: number };

/** Segmented tab strip: the market list's status filter and the market page's Stake / Trade switch. */
export function SegmentedTabs<T extends string>({
  tabs,
  value,
  onChange,
  ariaLabel,
  fill = false,
}: {
  tabs: Tab<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
  /** Stretch the tabs to share the full width, as inside a card. */
  fill?: boolean;
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={`flex max-w-full overflow-x-auto rounded-xl border border-base-300 p-1 ${fill ? "w-full" : ""}`}
    >
      {tabs.map(tab => {
        const selected = tab.value === value;
        return (
          <button
            key={tab.value}
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(tab.value)}
            className={`flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3.5 py-1.5 text-[13.5px] font-semibold transition-colors ${
              fill ? "flex-1" : ""
            } ${selected ? "bg-base-100 text-base-content" : "text-base-content/60 hover:text-base-content"}`}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span className={`text-xs tabular-nums ${selected ? "text-base-content/60" : "text-base-content/40"}`}>
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

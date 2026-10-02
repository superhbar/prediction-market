import Link from "next/link";
import { Countdown } from "./Countdown";
import { bytes32ToFeedKey } from "~~/utils/markets/feeds";
import { hashscanLink } from "~~/utils/markets/hashscan";
import { marketQuestion, shortExpiry } from "~~/utils/markets/question";
import { type MarketFilter, statusLabel } from "~~/utils/markets/status";
import type { Market, UiStatus } from "~~/utils/markets/types";
import { formatHbar, yesPercent } from "~~/utils/markets/units";

type MarketCardProps = {
  marketId: number;
  market: Market;
  status: UiStatus;
  chainId: number;
};

/** Compact market summary for the list grid with Hashscan token links. */
export function MarketCard({ marketId, market, status, chainId }: MarketCardProps) {
  const feedLabel = bytes32ToFeedKey(market.feedKey);
  const yes = yesPercent(market.yesPool, market.noPool);

  return (
    // The card is a div with a stretched title link, so the Hashscan links are not nested inside another link.
    <div className="relative border border-base-300 bg-base-100 p-6 flex flex-col gap-3 hover:border-primary transition-colors">
      <p className="text-[11px] uppercase tracking-[0.2em] text-base-content/60 m-0">
        No. {marketId} &middot; {feedLabel} &middot; {shortExpiry(market.expiry)}
      </p>
      <h2 className="font-editorial font-bold text-xl leading-snug m-0">
        <Link href={`/markets/${marketId}`} className="after:absolute after:inset-0">
          {marketQuestion(feedLabel, market.strike, market.expiry)}
        </Link>
      </h2>
      <div className="flex-1" />
      <div className="flex-1 h-[3px] flex overflow-hidden rounded-full bg-base-300" aria-hidden>
        <div className="bg-primary" style={{ width: `${yes}%` }} />
      </div>
      <div className="flex items-center justify-between text-sm">
        <span>
          YES <strong>{Math.round(yes)}%</strong> &middot; NO <strong>{100 - Math.round(yes)}%</strong>
        </span>
        <span className="badge badge-outline">{statusLabel(status)}</span>
      </div>
      <div className="flex items-center justify-between text-sm text-base-content/70">
        <span>{formatHbar(market.yesPool + market.noPool)} pooled</span>
        {status === "open" ? (
          <Countdown targetSec={market.expiry} label="Closes in" />
        ) : (
          <span className="flex gap-2">
            <a
              href={hashscanLink(chainId, "token", market.yesToken)}
              target="_blank"
              rel="noreferrer"
              className="link relative z-10"
            >
              YES token
            </a>
            <a
              href={hashscanLink(chainId, "token", market.noToken)}
              target="_blank"
              rel="noreferrer"
              className="link relative z-10"
            >
              NO token
            </a>
          </span>
        )}
      </div>
    </div>
  );
}

export const FILTERS: { value: MarketFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "open", label: "Open" },
  { value: "awaiting", label: "Awaiting settlement" },
  { value: "settled", label: "Settled" },
  { value: "voided", label: "Voided" },
];

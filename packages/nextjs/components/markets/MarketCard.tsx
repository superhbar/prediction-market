import Link from "next/link";
import { Countdown } from "./Countdown";
import { AssetBadge, OutcomeBar, StatusPill } from "./ui";
import { bytes32ToFeedKey } from "~~/utils/markets/feeds";
import { hashscanLink } from "~~/utils/markets/hashscan";
import { marketQuestion, shortExpiry } from "~~/utils/markets/question";
import { type MarketFilter, resolutionLabel, statusLabel } from "~~/utils/markets/status";
import type { Market, UiStatus } from "~~/utils/markets/types";
import { formatHbar, yesPercent } from "~~/utils/markets/units";

type MarketCardProps = {
  marketId: number;
  market: Market;
  status: UiStatus;
  chainId: number;
};

/** Market summary for the list grid: asset, question, YES/NO split, volume and timing. */
export function MarketCard({ marketId, market, status, chainId }: MarketCardProps) {
  const feedLabel = bytes32ToFeedKey(market.feedKey);
  const yes = yesPercent(market.yesPool, market.noPool);
  const yesRounded = Math.round(yes);
  const closed = status !== "open";

  return (
    // The card is a div with a stretched title link, so the Hashscan links are not nested inside another link.
    <div className="panel relative p-5 flex flex-col gap-4 transition hover:border-primary/60 hover:shadow-[0_0_0_1px_var(--color-primary),0_20px_60px_-30px_var(--color-primary)]">
      <div className="flex items-center gap-3">
        <AssetBadge feedLabel={feedLabel} />
        <div className="min-w-0">
          <p className="text-sm font-semibold m-0">{feedLabel}</p>
          <p className="text-xs text-base-content/50 m-0">
            #{marketId} &middot; {shortExpiry(market.expiry)}
          </p>
        </div>
        <span className="ml-auto">
          <StatusPill status={status} label={status === "settled" ? resolutionLabel(market) : statusLabel(status)} />
        </span>
      </div>

      <h2 className="text-[17px] font-semibold leading-snug m-0">
        <Link href={`/markets/${marketId}`} className="after:absolute after:inset-0">
          {marketQuestion(feedLabel, market.strike, market.expiry)}
        </Link>
      </h2>

      <div className="flex-1" />
      <OutcomeBar yes={yes} />
      <div className="grid grid-cols-2 gap-2 text-sm font-semibold">
        <span className="rounded-xl bg-yes/10 text-yes px-3 py-2 flex justify-between">
          <span>YES</span>
          <span className="tabular-nums">{yesRounded}%</span>
        </span>
        <span className="rounded-xl bg-no/10 text-no px-3 py-2 flex justify-between">
          <span>NO</span>
          <span className="tabular-nums">{100 - yesRounded}%</span>
        </span>
      </div>

      <div className="flex items-center justify-between text-xs text-base-content/60">
        <span className="tabular-nums">{formatHbar(market.yesPool + market.noPool)} volume</span>
        {closed ? (
          <span className="flex gap-3">
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
        ) : (
          <Countdown targetSec={market.expiry} label="Closes in" />
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

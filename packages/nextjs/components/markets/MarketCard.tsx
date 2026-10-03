import Link from "next/link";
import { Countdown } from "./Countdown";
import { AssetBadge, OutcomeBar, Sparkline, StatusPill } from "./ui";
import type { PricePoint } from "~~/hooks/markets/useChainlinkHistory";
import { bytes32ToFeedKey } from "~~/utils/markets/feeds";
import { marketQuestion, shortExpiry } from "~~/utils/markets/question";
import { type MarketFilter, isRefund, resolutionLabel, sourceLabel, statusLabel } from "~~/utils/markets/status";
import type { Market, UiStatus } from "~~/utils/markets/types";
import { formatExactPrice, formatHbar, formatMultiple, tokenPaysBps, yesPercent } from "~~/utils/markets/units";

type MarketCardProps = {
  marketId: number;
  market: Market;
  status: UiStatus;
  /** Recent Chainlink rounds for this market's feed, drawn as a sparkline. */
  points?: PricePoint[];
};

/** "1.60x" if that side wins, or a dash while nobody has staked on it. */
function multipleLabel(market: Market, yes: boolean): string {
  const bps = tokenPaysBps(market, yes);
  return bps === undefined ? "-" : bps === 0n ? "0x" : formatMultiple(bps);
}

/** What a closed market is waiting for, or how it ended. */
function closedNote(market: Market, status: UiStatus): { tone: "warning" | "neutral"; text: string } {
  switch (status) {
    case "awaiting-settlement":
    case "retrying":
      return { tone: "neutral", text: "Expired. Settles on its own from the first Chainlink price after expiry." };
    case "settle-available":
      return { tone: "warning", text: "Expired. Anyone can settle once a Chainlink round is in." };
    case "no-price":
      return {
        tone: "warning",
        text: "Chainlink published no price within 2 hours of expiry. It settles with Pyth, or voids for 1:1 refunds.",
      };
    case "voidable":
      return { tone: "warning", text: "No price in time. Anyone can void it for 1:1 refunds." };
    default:
      return {
        tone: "neutral",
        text: isRefund(market)
          ? `${resolutionLabel(market)}. Every position redeems 1:1.`
          : `${resolutionLabel(market)} at ${formatExactPrice(market.settlementPrice)} (${sourceLabel(market.source)}).`,
      };
  }
}

/** Market summary for the list grid: question, what each side pays, stake buttons and timing. */
export function MarketCard({ marketId, market, status, points = [] }: MarketCardProps) {
  const feedLabel = bytes32ToFeedKey(market.feedKey);
  const yes = yesPercent(market.yesPool, market.noPool);
  const href = `/markets/${marketId}`;
  const note = status === "open" ? undefined : closedNote(market, status);

  return (
    <article className="panel p-5 flex flex-col gap-4 transition-colors hover:border-primary/50">
      <div className="flex items-center gap-3">
        <AssetBadge feedLabel={feedLabel} />
        <span className="text-sm text-base-content/70">{feedLabel.replace("/", " / ")}</span>
        <span className="ml-auto">
          <StatusPill status={status} label={status === "settled" ? resolutionLabel(market) : statusLabel(status)} />
        </span>
      </div>

      <h2 className="text-base font-semibold leading-snug m-0">
        <Link href={href} className="hover:text-primary">
          {marketQuestion(feedLabel, market.strike, market.expiry)}
        </Link>
      </h2>

      <div className="flex items-end justify-between gap-3 mt-auto">
        <dl className="m-0 grid grid-cols-2 gap-x-4 text-sm">
          <dt className="text-base-content/60">Yes pays</dt>
          <dt className="text-base-content/60">No pays</dt>
          <dd className="m-0 text-2xl font-bold tabular-nums text-yes">{multipleLabel(market, true)}</dd>
          <dd className="m-0 text-2xl font-bold tabular-nums text-no">{multipleLabel(market, false)}</dd>
        </dl>
        <Sparkline points={points} />
      </div>
      <OutcomeBar yes={yes} />

      {note ? (
        <p
          className={`m-0 rounded-[10px] border px-3 py-2.5 text-sm ${
            note.tone === "warning"
              ? "border-warning/30 bg-warning/10 text-base-content/80"
              : "border-base-300 bg-base-200 text-base-content/80"
          }`}
        >
          {note.text}{" "}
          <Link href={href} className="font-semibold text-primary whitespace-nowrap">
            {status === "settled" || status === "voided" ? "Redeem" : "Details"}
          </Link>
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <Link
            href={`${href}?side=yes`}
            className="btn btn-sm h-10 text-sm font-semibold border-yes/30 bg-yes/10 text-yes hover:bg-yes/20 hover:border-yes/50"
          >
            Stake Yes
          </Link>
          <Link
            href={`${href}?side=no`}
            className="btn btn-sm h-10 text-sm font-semibold border-no/30 bg-no/10 text-no hover:bg-no/20 hover:border-no/50"
          >
            Stake No
          </Link>
        </div>
      )}

      <div className="flex items-center justify-between gap-2 pt-3 border-t border-base-300 text-xs text-base-content/60">
        <span>
          <span className="font-semibold text-base-content tabular-nums">
            {formatHbar(market.yesPool + market.noPool)}
          </span>{" "}
          vol
        </span>
        <span className="font-mono">
          {status === "open" ? (
            <Countdown targetSec={market.expiry} label="Closes in" />
          ) : (
            `Closed ${shortExpiry(market.expiry)}`
          )}
        </span>
      </div>
    </article>
  );
}

export const FILTERS: { value: MarketFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "open", label: "Open" },
  { value: "awaiting", label: "Resolving" },
  { value: "settled", label: "Settled" },
  { value: "voided", label: "Voided" },
];

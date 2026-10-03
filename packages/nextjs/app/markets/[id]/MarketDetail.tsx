"use client";

import { useState } from "react";
import Link from "next/link";
import { ActivityPanel } from "~~/components/markets/ActivityPanel";
import { Countdown } from "~~/components/markets/Countdown";
import { OddsBar } from "~~/components/markets/OddsBar";
import { PriceChart } from "~~/components/markets/PriceChart";
import { RedeemPanel } from "~~/components/markets/RedeemPanel";
import { SettlementTimeline } from "~~/components/markets/SettlementTimeline";
import { StakePanel } from "~~/components/markets/StakePanel";
import { ErrorState, MarketDetailSkeleton } from "~~/components/markets/States";
import { AssetBadge, StatusPill } from "~~/components/markets/ui";
import { useChainlinkHistory } from "~~/hooks/markets/useChainlinkHistory";
import { useMarket } from "~~/hooks/markets/useMarket";
import { useMarketConfig } from "~~/hooks/markets/useMarketConfig";
import { bytes32ToFeedKey } from "~~/utils/markets/feeds";
import { marketQuestion, shortExpiry } from "~~/utils/markets/question";
import { deriveStatus, isRefund, resolutionLabel, sourceLabel, statusLabel } from "~~/utils/markets/status";
import { type Market, MarketOutcome, MarketState } from "~~/utils/markets/types";
import { formatExactPrice } from "~~/utils/markets/units";

/** Market detail: headline, odds, chart, stake, settlement timeline, activity and redeem. */
export function MarketDetail({ id, initialSide = "YES" }: { id: string; initialSide?: "YES" | "NO" }) {
  const { market, invalid, notFound, isLoading, error, refetch } = useMarket(id);
  const { config } = useMarketConfig();
  const feedLabel = market ? bytes32ToFeedKey(market.feedKey) : "HBAR/USD";
  const { points, isLoading: chartLoading } = useChainlinkHistory(feedLabel);
  const [nowSec] = useState(() => BigInt(Math.floor(Date.now() / 1000)));

  if (isLoading) {
    return (
      <div className="shell page">
        <MarketDetailSkeleton />
      </div>
    );
  }

  if (error && !market) {
    return (
      <div className="shell page">
        <ErrorState
          message="The market could not be read from the network. Check the RPC and retry."
          onRetry={refetch}
        />
      </div>
    );
  }

  if (invalid || notFound || !market) {
    return (
      <div className="shell page">
        <p className="text-sm text-base-content/60 m-0">Market #{id}</p>
        <h1 className="mt-3 text-3xl md:text-4xl font-bold tracking-tight">Market not found</h1>
        <p className="mt-4 text-[15px] opacity-80">No market with this id exists on this network.</p>
        <Link href="/" className="btn btn-primary btn-sm mt-6">
          Back to markets
        </Link>
      </div>
    );
  }

  const status = config ? deriveStatus(market, nowSec, config) : "open";
  // A Chainlink round the contract can settle on: at or after expiry and within maxRoundLag of it.
  const roundAvailable = points.some(
    point =>
      point.timestamp >= market.expiry &&
      (config === undefined || point.timestamp <= market.expiry + config.maxRoundLag),
  );

  return (
    <div className="shell page">
      <Link href="/" className="inline-block text-sm text-base-content/60 hover:text-base-content">
        &larr; Markets
      </Link>
      <div className="mt-4 flex items-start gap-4">
        <AssetBadge feedLabel={feedLabel} size="lg" />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-sm text-base-content/60">
            <span className="font-semibold text-base-content">{feedLabel}</span>
            <span>&middot; Market #{id}</span>
            <StatusPill status={status} label={status === "settled" ? resolutionLabel(market) : statusLabel(status)} />
          </div>
          <h1 className="mt-1.5 text-2xl md:text-3xl font-bold leading-tight max-w-3xl">
            {marketQuestion(feedLabel, market.strike, market.expiry)}
          </h1>
        </div>
      </div>

      <Resolution market={market} />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 mt-6">
        <div className="lg:col-span-8 flex flex-col gap-4">
          <OddsBar
            yesPool={market.yesPool}
            noPool={market.noPool}
            winner={winnerOf(market)}
            footer={
              status === "open" ? (
                <Countdown targetSec={market.expiry} label="Closes in" />
              ) : market.state === MarketState.Open ? (
                <span>Trading closed &middot; {statusLabel(status)}</span>
              ) : undefined
            }
          />
          {chartLoading && points.length === 0 ? (
            <div className="panel p-5">
              <div className="h-56 rounded-xl bg-base-300 animate-pulse" />
            </div>
          ) : (
            <PriceChart
              points={points}
              strike={market.strike}
              feedLabel={feedLabel}
              expiry={market.expiry}
              expired={nowSec >= market.expiry}
            />
          )}
          <SettlementTimeline marketId={Number(id)} market={market} roundAvailable={roundAvailable} />
          <ActivityPanel marketId={id} />
        </div>
        <div className="lg:col-span-4 order-first lg:order-none">
          <div className="lg:sticky lg:top-24 flex flex-col gap-4">
            <StakePanel marketId={Number(id)} market={market} initialSide={initialSide} />
            <RedeemPanel marketId={Number(id)} market={market} />
          </div>
        </div>
      </div>
    </div>
  );
}

function winnerOf(market: Market): "YES" | "NO" | undefined {
  if (market.state !== MarketState.Settled) return undefined;
  if (market.outcome === MarketOutcome.Yes) return "YES";
  if (market.outcome === MarketOutcome.No) return "NO";
  return undefined;
}

/** Outcome strip for settled and voided markets: what the oracle read and what holders do next. */
function Resolution({ market }: { market: Market }) {
  if (market.state === MarketState.Open) return null;

  const voided = market.state === MarketState.Voided;
  return (
    <section className="panel mt-6 p-5 border-primary/40 bg-primary/10 flex flex-col md:flex-row md:items-center gap-x-6 gap-y-1">
      <p className="text-2xl font-bold m-0 whitespace-nowrap">{resolutionLabel(market)}</p>
      <p className="text-sm m-0 text-base-content/75">
        {voided
          ? "No oracle price settled this market in time. Every position redeems 1:1 for the HBAR staked."
          : isRefund(market)
            ? "Only one side had stakes, so there was nothing to win. Every position redeems 1:1 for the HBAR staked."
            : `${sourceLabel(market.source)} read ${formatExactPrice(market.settlementPrice)} at ${shortExpiry(market.settlementTime)}, against a strike of ${formatExactPrice(market.strike)}. Holders of the winning token redeem on the right.`}
      </p>
    </section>
  );
}

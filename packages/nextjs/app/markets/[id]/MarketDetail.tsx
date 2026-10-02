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
import { MarketDetailSkeleton } from "~~/components/markets/States";
import { useChainlinkHistory } from "~~/hooks/markets/useChainlinkHistory";
import { useMarket } from "~~/hooks/markets/useMarket";
import { useMarketConfig } from "~~/hooks/markets/useMarketConfig";
import { bytes32ToFeedKey } from "~~/utils/markets/feeds";
import { marketQuestion, shortExpiry } from "~~/utils/markets/question";
import { deriveStatus, isRefund, resolutionLabel, sourceLabel, statusLabel } from "~~/utils/markets/status";
import { type Market, MarketOutcome, MarketState } from "~~/utils/markets/types";
import { formatPrice } from "~~/utils/markets/units";

/** Market detail in the editorial layout: headline, odds, chart, stake, settlement, redeem. */
export function MarketDetail({ id }: { id: string }) {
  const { market, invalid, notFound, isLoading } = useMarket(id);
  const { config } = useMarketConfig();
  const feedLabel = market ? bytes32ToFeedKey(market.feedKey) : "HBAR/USD";
  const { points, isLoading: chartLoading } = useChainlinkHistory(feedLabel);
  const [nowSec] = useState(() => BigInt(Math.floor(Date.now() / 1000)));

  if (isLoading) {
    return (
      <div className="max-w-[1200px] mx-auto px-6 w-full pb-16">
        <MarketDetailSkeleton />
      </div>
    );
  }

  if (invalid || notFound || !market) {
    return (
      <div className="max-w-[1200px] mx-auto px-6 w-full pb-16">
        <p className="text-[12px] uppercase tracking-[0.2em] mt-10 text-base-content/60 m-0">No. {id}</p>
        <h1 className="font-editorial font-black leading-[1.02] mt-3 text-4xl md:text-5xl">Market not found</h1>
        <p className="mt-4 text-[15px] opacity-80">No market with this id exists on this network.</p>
        <Link href="/" className="btn btn-primary btn-sm mt-6">
          Back to markets
        </Link>
      </div>
    );
  }

  const status = config ? deriveStatus(market, nowSec, config) : "open";
  const roundAvailable = points.some(point => point.timestamp >= market.expiry);

  return (
    <div className="max-w-[1200px] mx-auto px-6 w-full pb-16">
      <p className="text-[12px] uppercase tracking-[0.2em] mt-10 text-base-content/60 m-0">
        No. {id} &middot; {feedLabel} &middot; {statusLabel(status)}
      </p>
      <h1 className="font-editorial font-black leading-[1.02] mt-3 text-4xl md:text-6xl max-w-4xl">
        {marketQuestion(feedLabel, market.strike, market.expiry)}
      </h1>

      <div className="mt-8">
        <Resolution market={market} />
        <OddsBar yesPool={market.yesPool} noPool={market.noPool} winner={winnerOf(market)} />
        <div className="flex items-center gap-4 py-1 text-sm">
          {status === "open" && <Countdown targetSec={market.expiry} label="Closes in" />}
          {status !== "open" && market.state === MarketState.Open && (
            <span>Trading closed &middot; {statusLabel(status)}</span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 mt-6">
        <div className="lg:col-span-7">
          <p className="text-[12px] uppercase tracking-[0.2em] text-base-content/60 mb-2 m-0">
            Fig. 1 &middot; {feedLabel} price
          </p>
          {chartLoading && points.length === 0 ? (
            <div className="border border-base-300 bg-base-100 p-5">
              <div className="h-40 bg-base-300 animate-pulse" />
            </div>
          ) : (
            <PriceChart points={points} strike={market.strike} feedLabel={feedLabel} expiry={market.expiry} />
          )}
          <SettlementTimeline marketId={Number(id)} market={market} roundAvailable={roundAvailable} />
          <ActivityPanel marketId={id} />
        </div>
        <div className="lg:col-span-5">
          <div className="lg:sticky lg:top-6">
            <StakePanel marketId={Number(id)} market={market} />
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
    <section className="mb-8 border-y-2 border-base-content py-4 flex flex-col md:flex-row md:items-baseline gap-x-6 gap-y-1">
      <p className="font-editorial font-black text-3xl m-0 whitespace-nowrap">{resolutionLabel(market)}</p>
      <p className="text-sm m-0 opacity-80">
        {voided
          ? "No oracle price settled this market in time. Every position redeems 1:1 for the HBAR staked."
          : isRefund(market)
            ? "Only one side had stakes, so there was nothing to win. Every position redeems 1:1 for the HBAR staked."
            : `${sourceLabel(market.source)} read ${formatPrice(market.settlementPrice)} at ${shortExpiry(market.settlementTime)}, against a strike of ${formatPrice(market.strike)}. Holders of the winning token redeem below.`}
      </p>
    </section>
  );
}

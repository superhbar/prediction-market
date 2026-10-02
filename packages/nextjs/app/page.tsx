"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { FILTERS, MarketCard } from "~~/components/markets/MarketCard";
import { EmptyState, ErrorState, MarketCardSkeleton } from "~~/components/markets/States";
import { useMarketConfig } from "~~/hooks/markets/useMarketConfig";
import { useMarkets } from "~~/hooks/markets/useMarkets";
import { useTargetNetwork } from "~~/hooks/scaffold-hbar";
import { type MarketFilter, deriveStatus, matchesFilter } from "~~/utils/markets/status";

const Home = () => {
  const { targetNetwork } = useTargetNetwork();
  const { marketIds, markets, count, isLoading, error } = useMarkets();
  const { config } = useMarketConfig();
  const [filter, setFilter] = useState<MarketFilter>("all");

  const [nowSec] = useState(() => BigInt(Math.floor(Date.now() / 1000)));
  const visible = useMemo(
    () =>
      marketIds
        .map((id, index) => ({ id, market: markets[index] ?? null }))
        .filter(entry => entry.market !== null)
        .filter(entry => {
          if (!config || !entry.market) return true;
          return matchesFilter(deriveStatus(entry.market, nowSec, config), filter);
        }),
    [marketIds, markets, config, nowSec, filter],
  );

  return (
    <div className="max-w-[1200px] mx-auto px-6 w-full">
      <p className="text-[12px] uppercase tracking-[0.2em] mt-10 text-base-content/60 m-0">
        Price predictions &middot; Chainlink settlement &middot; Hedera
      </p>
      <h1 className="font-editorial font-black leading-[1.02] mt-3 text-4xl md:text-6xl max-w-4xl">
        Markets on what prices do next
      </h1>
      <p className="mt-4 text-[15px] leading-relaxed max-w-2xl opacity-80">
        Stake HBAR on YES or NO. A scheduled transaction settles each market on the first Chainlink price at or after
        expiry.
      </p>

      <div className="flex flex-wrap items-center gap-2 mt-8">
        {FILTERS.map(entry => (
          <button
            key={entry.value}
            onClick={() => setFilter(entry.value)}
            className={`btn btn-sm rounded-full ${filter === entry.value ? "btn-primary" : "btn-ghost border border-base-300"}`}
          >
            {entry.label}
          </button>
        ))}
        <Link href="/markets/new" className="btn btn-sm rounded-full bg-neutral text-neutral-content ml-auto">
          Create market
        </Link>
      </div>

      <div className="mt-6 pb-12">
        {isLoading && count === undefined ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <MarketCardSkeleton />
            <MarketCardSkeleton />
          </div>
        ) : error ? (
          <ErrorState
            message="Markets could not be loaded. Check your connection and retry."
            onRetry={() => window.location.reload()}
          />
        ) : count === 0 ? (
          <EmptyState
            title="No markets yet"
            body="Be the first to open a market on HBAR, BTC or ETH."
            actionHref="/markets/new"
            actionLabel="Create a market"
          />
        ) : visible.length === 0 ? (
          <EmptyState
            title="Nothing in this filter"
            body="Try another filter, or create a market."
            actionHref="/markets/new"
            actionLabel="Create a market"
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {visible.map(entry =>
              entry.market ? (
                <MarketCard
                  key={entry.id}
                  marketId={entry.id}
                  market={entry.market}
                  status={config ? deriveStatus(entry.market, nowSec, config) : "open"}
                  chainId={targetNetwork.id}
                />
              ) : null,
            )}
          </div>
        )}
      </div>

      <section className="border-t-2 border-base-content pt-6 pb-16" aria-labelledby="how-it-works">
        <h2 id="how-it-works" className="text-[12px] uppercase tracking-[0.2em] text-base-content/60 m-0 font-normal">
          How it works
        </h2>
        <ol className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-4 list-none p-0">
          {HOW_IT_WORKS.map((step, index) => (
            <li key={step.title}>
              <p className="font-editorial font-black text-4xl leading-none m-0 text-primary">{index + 1}</p>
              <p className="font-editorial font-bold text-xl mt-3 mb-0">{step.title}</p>
              <p className="text-sm leading-relaxed mt-2 mb-0 opacity-80">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
};

const HOW_IT_WORKS = [
  {
    title: "Stake on a side",
    body: "Every stake mints YES or NO position tokens on the Hedera Token Service, one token per HBAR, held in your own account.",
  },
  {
    title: "Hedera settles it",
    body: "Creating a market books a scheduled call (HIP-1215). After expiry the network runs it and reads the first Chainlink price at or after expiry. No keeper, no admin.",
  },
  {
    title: "Winners redeem",
    body: "Winning tokens redeem for a share of the whole pool. If no price arrives within the grace period, the market voids and every stake refunds 1:1.",
  },
];

export default Home;

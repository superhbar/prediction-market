"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { FILTERS, MarketCard } from "~~/components/markets/MarketCard";
import { EmptyState, ErrorState, MarketCardSkeleton } from "~~/components/markets/States";
import { useMarketConfig } from "~~/hooks/markets/useMarketConfig";
import { useMarkets } from "~~/hooks/markets/useMarkets";
import { useTargetNetwork } from "~~/hooks/scaffold-hbar";
import { type MarketFilter, deriveStatus, matchesFilter } from "~~/utils/markets/status";
import { formatHbar } from "~~/utils/markets/units";

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

  const loaded = marketIds.flatMap((id, index) => (markets[index] ? [{ id, market: markets[index]! }] : []));
  const stats = [
    {
      label: "Open markets",
      value: config
        ? String(loaded.filter(({ market }) => deriveStatus(market, nowSec, config) === "open").length)
        : "-",
    },
    {
      label: "Total volume",
      value: formatHbar(loaded.reduce((sum, { market }) => sum + market.yesPool + market.noPool, 0n)),
    },
    { label: "Settled on-chain", value: String(loaded.filter(({ market }) => market.state !== 0).length) },
  ];

  return (
    <div className="max-w-[1200px] mx-auto px-4 sm:px-6 w-full">
      <section className="pt-12 pb-10 md:pt-16">
        <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
          <span className="w-1.5 h-1.5 rounded-full bg-primary" aria-hidden />
          Settled by Hedera scheduled transactions (HIP-1215)
        </span>
        <h1 className="mt-5 text-4xl md:text-6xl font-bold tracking-tight leading-[1.05] max-w-3xl">
          Predict prices. <span className="text-brand">Hedera settles.</span>
        </h1>
        <p className="mt-5 text-base md:text-lg leading-relaxed max-w-2xl text-base-content/70">
          Stake HBAR on YES or NO. Each market books its own settlement when it is created, then reads the first
          Chainlink price at or after expiry. No keeper, no admin.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/markets/new" className="btn btn-primary">
            Create a market
          </Link>
          <a href="#markets" className="btn btn-ghost border border-base-content/15">
            Browse markets
          </a>
        </div>
        <dl className="mt-10 grid grid-cols-3 gap-3 max-w-xl">
          {stats.map(stat => (
            <div key={stat.label} className="panel px-4 py-3">
              <dt className="label-caps">{stat.label}</dt>
              <dd className="m-0 mt-1 text-xl font-semibold tabular-nums">{stat.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section id="markets" className="scroll-mt-24">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-semibold m-0">Markets</h2>
          <div role="tablist" className="flex flex-wrap gap-1 rounded-xl bg-base-content/5 p-1">
            {FILTERS.map(entry => (
              <button
                key={entry.value}
                role="tab"
                aria-selected={filter === entry.value}
                onClick={() => setFilter(entry.value)}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                  filter === entry.value
                    ? "bg-base-100 text-base-content shadow-sm"
                    : "text-base-content/60 hover:text-base-content"
                }`}
              >
                {entry.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-5 pb-12">
          {isLoading && count === undefined ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <MarketCardSkeleton />
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
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
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
      </section>

      <section aria-labelledby="how-it-works" className="pb-8">
        <h2 id="how-it-works" className="text-xl font-semibold m-0">
          How it works
        </h2>
        <ol className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-5 list-none p-0">
          {HOW_IT_WORKS.map((step, index) => (
            <li key={step.title} className="panel p-5">
              <span className="grid place-items-center w-8 h-8 rounded-lg bg-primary/15 text-primary text-sm font-bold">
                {index + 1}
              </span>
              <p className="font-semibold mt-4 mb-0">{step.title}</p>
              <p className="text-sm leading-relaxed mt-2 mb-0 text-base-content/65">{step.body}</p>
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

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { MagnifyingGlassIcon } from "@heroicons/react/20/solid";
import { FILTERS, MarketCard } from "~~/components/markets/MarketCard";
import { EmptyState, ErrorState, MarketCardSkeleton } from "~~/components/markets/States";
import { type PricePoint, useChainlinkHistory } from "~~/hooks/markets/useChainlinkHistory";
import { useMarketConfig } from "~~/hooks/markets/useMarketConfig";
import { useMarkets } from "~~/hooks/markets/useMarkets";
import { useNow } from "~~/hooks/markets/useNow";
import { FEED_KEYS, bytes32ToFeedKey } from "~~/utils/markets/feeds";
import { priceAge, priceReadState } from "~~/utils/markets/freshness";
import { marketQuestion } from "~~/utils/markets/question";
import { type MarketFilter, deriveStatus, matchesFilter } from "~~/utils/markets/status";
import { formatPrice } from "~~/utils/markets/units";

/** Reads one feed's recent rounds and reports them up, so the page reads each feed once. */
function FeedReader({
  feed,
  onPoints,
  nowSec,
}: {
  feed: string;
  onPoints: (feed: string, points: PricePoint[]) => void;
  nowSec: bigint;
}) {
  const { points, error } = useChainlinkHistory(feed);
  useEffect(() => onPoints(feed, points), [feed, points, onPoints]);
  const latest = points.at(-1);
  const readState = priceReadState(!!latest, error);
  return (
    <span>
      {feed} <span className="font-mono text-base-content">{latest ? formatPrice(latest.normalized) : "..."}</span>{" "}
      {latest && <span>{priceAge(latest.timestamp, nowSec)}</span>}
      {readState && <span className="text-warning"> · {readState}</span>}
    </span>
  );
}

const Home = () => {
  const { marketIds, markets, count, isLoading, error, refetch } = useMarkets();
  const { config } = useMarketConfig();
  const [filter, setFilter] = useState<MarketFilter>("all");
  const [asset, setAsset] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [history, setHistory] = useState<Record<string, PricePoint[]>>({});
  const onPoints = useCallback(
    (feed: string, points: PricePoint[]) =>
      setHistory(previous => {
        // The history hook can hand back a fresh empty array on every render; only store real changes.
        const current = previous[feed];
        const same =
          current !== undefined &&
          current.length === points.length &&
          current.at(-1)?.roundId === points.at(-1)?.roundId;
        return same ? previous : { ...previous, [feed]: points };
      }),
    [],
  );

  const nowSec = useNow();
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return marketIds.flatMap((id, index) => {
      const market = markets[index];
      if (!market) return [];
      const feed = bytes32ToFeedKey(market.feedKey);
      const status = config ? deriveStatus(market, nowSec, config) : "open";
      if (!matchesFilter(status, filter)) return [];
      if (asset !== "all" && feed !== asset) return [];
      if (needle && !marketQuestion(feed, market.strike, market.expiry).toLowerCase().includes(needle)) return [];
      return [{ id, market, feed, status }];
    });
  }, [marketIds, markets, config, nowSec, filter, asset, query]);

  return (
    <div className="shell page">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <h1 className="text-2xl font-bold m-0">Markets</h1>
          {count !== undefined && (
            <span className="rounded-full border border-base-300 px-2 text-xs font-semibold text-base-content/60">
              {count}
            </span>
          )}
        </div>
        <Link href="/markets/new" className="btn btn-primary btn-sm h-9 px-4">
          Create market
        </Link>
      </div>

      <p className="mt-2 mb-0 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-base-content/60">
        <span>Chainlink</span>
        {FEED_KEYS.map(feed => (
          <FeedReader key={feed} feed={feed} onPoints={onPoints} nowSec={nowSec} />
        ))}
      </p>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <div role="tablist" aria-label="Asset" className="flex gap-1">
          {["all", ...FEED_KEYS].map(feed => (
            <button
              key={feed}
              role="tab"
              aria-selected={asset === feed}
              onClick={() => setAsset(feed)}
              className={`rounded-full border px-3 py-1.5 text-[13px] font-semibold transition-colors ${
                asset === feed
                  ? "border-base-content bg-base-content text-base-200"
                  : "border-base-300 text-base-content/60 hover:text-base-content"
              }`}
            >
              {feed === "all" ? "All assets" : feed.split("/")[0]}
            </button>
          ))}
        </div>
        <label className="ml-auto flex w-full sm:w-72 items-center gap-2 rounded-[10px] border border-base-300 px-3 h-9 focus-within:border-primary">
          <MagnifyingGlassIcon className="w-4 h-4 text-base-content/50" aria-hidden />
          <input
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="Search markets"
            aria-label="Search markets"
            className="w-full bg-transparent text-sm outline-none placeholder:text-base-content/40"
          />
        </label>
      </div>

      <div role="tablist" aria-label="Status" className="mt-4 flex gap-5 overflow-x-auto border-b border-base-300">
        {FILTERS.map(entry => (
          <button
            key={entry.value}
            role="tab"
            aria-selected={filter === entry.value}
            onClick={() => setFilter(entry.value)}
            className={`-mb-px whitespace-nowrap border-b-2 pb-2.5 text-sm font-semibold transition-colors ${
              filter === entry.value
                ? "border-primary text-base-content"
                : "border-transparent text-base-content/55 hover:text-base-content"
            }`}
          >
            {entry.label}
          </button>
        ))}
      </div>

      <div className="mt-5">
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <MarketCardSkeleton />
            <MarketCardSkeleton />
            <MarketCardSkeleton />
          </div>
        ) : error ? (
          <ErrorState message="Markets could not be loaded. Check your connection and retry." onRetry={refetch} />
        ) : count === 0 ? (
          <EmptyState
            title="No markets yet"
            body="Open the first one on HBAR, BTC or ETH."
            actionHref="/markets/new"
            actionLabel="Create market"
          />
        ) : visible.length === 0 ? (
          <EmptyState title="No matching markets" body="Change the filters or the search." />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {visible.map(entry => (
              <MarketCard
                key={entry.id}
                marketId={entry.id}
                market={entry.market}
                status={entry.status}
                points={history[entry.feed]}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Home;

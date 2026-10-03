"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { MagnifyingGlassIcon } from "@heroicons/react/20/solid";
import { FILTERS, MarketCard } from "~~/components/markets/MarketCard";
import { EmptyState, ErrorState, MarketCardSkeleton } from "~~/components/markets/States";
import { CoinIcon, SegmentedTabs } from "~~/components/markets/ui";
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

/** Markets read per page; "Show more" reads the next page instead of polling every market ever created. */
const PAGE_SIZE = 24;

const Home = () => {
  const [limit, setLimit] = useState(PAGE_SIZE);
  const { marketIds, markets, count, isLoading, error, refetch } = useMarkets(limit);
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
  // Markets that match the asset and search; the status tabs count and filter within these.
  const matching = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return marketIds.flatMap((id, index) => {
      const market = markets[index];
      if (!market) return [];
      const feed = bytes32ToFeedKey(market.feedKey);
      if (asset !== "all" && feed !== asset) return [];
      if (needle && !marketQuestion(feed, market.strike, market.expiry).toLowerCase().includes(needle)) return [];
      const status = config ? deriveStatus(market, nowSec, config) : "open";
      return [{ id, market, feed, status }];
    });
  }, [marketIds, markets, config, nowSec, asset, query]);
  const visible = matching.filter(entry => matchesFilter(entry.status, filter));

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

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <SegmentedTabs
          ariaLabel="Status"
          value={filter}
          onChange={setFilter}
          tabs={FILTERS.map(entry => ({
            value: entry.value,
            label: entry.label,
            count: matching.filter(item => matchesFilter(item.status, entry.value)).length,
          }))}
        />
        <label className="ml-auto flex w-full sm:w-72 items-center gap-2 rounded-xl border border-base-300 px-3 h-[42px] focus-within:border-primary">
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

      <div role="tablist" aria-label="Asset" className="mt-3 flex flex-wrap gap-2">
        {["all", ...FEED_KEYS].map(feed => {
          const selected = asset === feed;
          const symbol = feed.split("/")[0];
          return (
            <button
              key={feed}
              role="tab"
              aria-selected={selected}
              onClick={() => setAsset(feed)}
              className={`flex items-center gap-1.5 rounded-full border py-1 text-[13px] font-semibold transition-colors ${
                feed === "all" ? "px-3" : "pl-1 pr-3"
              } ${
                selected
                  ? "border-primary/60 bg-primary/15 text-base-content"
                  : "border-base-300 text-base-content/60 hover:text-base-content"
              }`}
            >
              {feed !== "all" && <CoinIcon symbol={symbol} className="w-5 h-5" />}
              {feed === "all" ? "All assets" : symbol}
            </button>
          );
        })}
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
        {count !== undefined && count > marketIds.length && !error && (
          <div className="mt-6 flex flex-col items-center gap-2">
            <button className="btn btn-sm h-9 px-5" onClick={() => setLimit(current => current + PAGE_SIZE)}>
              Show older markets
            </button>
            <p className="m-0 text-xs text-base-content/50">
              Showing the newest {marketIds.length} of {count}. Filters and search apply to the markets shown.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Home;

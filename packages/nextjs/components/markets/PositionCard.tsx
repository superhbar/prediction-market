"use client";

import { useState } from "react";
import { StakePanel } from "~~/components/markets/StakePanel";
import { TradePanel } from "~~/components/markets/TradePanel";
import { SegmentedTabs } from "~~/components/markets/ui";
import { useTargetNetwork } from "~~/hooks/scaffold-hbar";
import { SAUCERSWAP } from "~~/utils/markets/saucerswap";
import { type Market, MarketState, type UiStatus } from "~~/utils/markets/types";

type Tab = "stake" | "trade";

type PositionCardProps = {
  marketId: number;
  market: Market;
  status: UiStatus;
  initialSide?: "YES" | "NO";
};

/**
 * One card for taking a position. Stake adds HBAR to a side's pool at the pool-share rate; Trade swaps
 * position tokens with other traders on SaucerSwap. Trade only exists while the market is open on a network
 * with a SaucerSwap deployment, so otherwise the card is the stake panel alone.
 */
export function PositionCard({ marketId, market, status, initialSide }: PositionCardProps) {
  const { targetNetwork } = useTargetNetwork();
  const canTrade = Boolean(SAUCERSWAP[targetNetwork.id]) && market.state === MarketState.Open;
  // Staking closes at expiry while swaps continue until settlement, so an expired market opens on Trade.
  const [tab, setTab] = useState<Tab>(() =>
    Date.now() < Number(market.expiry) * 1000 || !canTrade ? "stake" : "trade",
  );
  const active: Tab = canTrade ? tab : "stake";

  return (
    <section className="panel p-5">
      {canTrade && (
        <div className="mb-4">
          <SegmentedTabs
            ariaLabel="Take a position"
            fill
            value={active}
            onChange={setTab}
            tabs={[
              { value: "stake", label: "Stake" },
              { value: "trade", label: "Trade" },
            ]}
          />
        </div>
      )}
      <div role={canTrade ? "tabpanel" : undefined}>
        {active === "stake" ? (
          <StakePanel marketId={marketId} market={market} status={status} initialSide={initialSide} embedded />
        ) : (
          <TradePanel market={market} embedded />
        )}
      </div>
    </section>
  );
}

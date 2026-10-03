"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useAccount, useReadContracts } from "wagmi";
import { EmptyState } from "~~/components/markets/States";
import { AssetBadge } from "~~/components/markets/ui";
import { useMarkets } from "~~/hooks/markets/useMarkets";
import { usePositions } from "~~/hooks/markets/usePositions";
import { useDeployedContractInfo, useTargetNetwork } from "~~/hooks/scaffold-hbar";
import { bytes32ToFeedKey } from "~~/utils/markets/feeds";
import { marketQuestion } from "~~/utils/markets/question";
import { formatHbar } from "~~/utils/markets/units";

const PortfolioView = () => {
  const { address: account } = useAccount();
  const { targetNetwork } = useTargetNetwork();
  const { data: deployed } = useDeployedContractInfo({ contractName: "PredictionMarkets" });
  const { positions, isLoading: positionsLoading } = usePositions(account);
  const { markets, marketIds, isLoading: marketsLoading } = useMarkets();

  const marketById = useMemo(() => {
    const map = new Map<number, (typeof markets)[number]>();
    marketIds.forEach((id, index) => map.set(id, markets[index] ?? null));
    return map;
  }, [marketIds, markets]);

  const contracts = useMemo(() => {
    if (!deployed || positions.length === 0) return [];
    return positions.flatMap(position => [
      {
        address: deployed.address,
        abi: deployed.abi,
        functionName: "quotePayout" as const,
        args: [BigInt(position.marketId), true, position.yesBalance] as const,
        chainId: targetNetwork.id,
      },
      {
        address: deployed.address,
        abi: deployed.abi,
        functionName: "quotePayout" as const,
        args: [BigInt(position.marketId), false, position.noBalance] as const,
        chainId: targetNetwork.id,
      },
    ]);
  }, [deployed, positions, targetNetwork.id]);

  const { data: quotes } = useReadContracts({ contracts, query: { enabled: contracts.length > 0 } });

  if (!account) {
    return (
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 w-full pb-8">
        <p className="text-sm text-base-content/60 mt-8 m-0">Portfolio</p>
        <h1 className="mt-2 text-3xl md:text-4xl font-bold tracking-tight">Your positions</h1>
        <div className="mt-8">
          <EmptyState title="No wallet connected" body="Connect a wallet to see positions across markets." />
        </div>
      </div>
    );
  }

  const loading = positionsLoading || marketsLoading;

  return (
    <div className="max-w-[1200px] mx-auto px-4 sm:px-6 w-full pb-8">
      <p className="text-sm text-base-content/60 mt-8 m-0">Portfolio</p>
      <h1 className="mt-2 text-3xl md:text-4xl font-bold tracking-tight">Your positions</h1>
      <div className="mt-8">
        {loading ? (
          <div className="h-32 panel animate-pulse" aria-hidden />
        ) : positions.length === 0 ? (
          <EmptyState
            title="No positions yet"
            body="Stake on a market to receive YES or NO position tokens."
            actionHref="/"
            actionLabel="Browse markets"
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {positions.map((position, index) => {
              const market = marketById.get(position.marketId);
              const yesQuote =
                quotes?.[index * 2]?.status === "success" ? BigInt(quotes[index * 2].result as bigint) : 0n;
              const noQuote =
                quotes?.[index * 2 + 1]?.status === "success" ? BigInt(quotes[index * 2 + 1].result as bigint) : 0n;
              return (
                <Link
                  key={position.marketId}
                  href={`/markets/${position.marketId}`}
                  className="panel p-5 hover:border-primary/60 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    {market && <AssetBadge feedLabel={bytes32ToFeedKey(market.feedKey)} />}
                    <p className="text-sm text-base-content/60 m-0">
                      {market ? `${bytes32ToFeedKey(market.feedKey)} · ` : ""}#{position.marketId}
                    </p>
                  </div>
                  <h2 className="text-lg font-semibold leading-snug mt-3 mb-0">
                    {market
                      ? marketQuestion(bytes32ToFeedKey(market.feedKey), market.strike, market.expiry)
                      : `Market ${position.marketId}`}
                  </h2>
                  <div className="grid grid-cols-2 gap-2 mt-4 text-sm">
                    <div className="rounded-xl bg-yes/10 px-3 py-2">
                      <p className="m-0 font-semibold text-yes">YES {formatHbar(position.yesBalance)}</p>
                      <p className="m-0 text-base-content/60 tabular-nums">Redeemable {formatHbar(yesQuote)}</p>
                    </div>
                    <div className="rounded-xl bg-no/10 px-3 py-2">
                      <p className="m-0 font-semibold text-no">NO {formatHbar(position.noBalance)}</p>
                      <p className="m-0 text-base-content/60 tabular-nums">Redeemable {formatHbar(noQuote)}</p>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default PortfolioView;

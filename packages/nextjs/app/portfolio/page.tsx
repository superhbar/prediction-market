"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useAccount, useReadContracts } from "wagmi";
import { EmptyState } from "~~/components/markets/States";
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
      <div className="max-w-[1200px] mx-auto px-6 w-full pb-16">
        <p className="text-[12px] uppercase tracking-[0.2em] mt-10 text-base-content/60 m-0">Portfolio</p>
        <h1 className="font-editorial font-black leading-[1.02] mt-3 text-4xl md:text-5xl">Your positions</h1>
        <div className="mt-8">
          <EmptyState title="No wallet connected" body="Connect a wallet to see positions across markets." />
        </div>
      </div>
    );
  }

  const loading = positionsLoading || marketsLoading;

  return (
    <div className="max-w-[1200px] mx-auto px-6 w-full pb-16">
      <p className="text-[12px] uppercase tracking-[0.2em] mt-10 text-base-content/60 m-0">Portfolio</p>
      <h1 className="font-editorial font-black leading-[1.02] mt-3 text-4xl md:text-5xl">Your positions</h1>
      <div className="mt-8">
        {loading ? (
          <div className="h-24 bg-base-300 animate-pulse" aria-hidden />
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
                  className="border border-base-300 bg-base-100 p-6 hover:border-primary transition-colors"
                >
                  <p className="text-[11px] uppercase tracking-[0.2em] text-base-content/60 m-0">
                    No. {position.marketId}
                    {market ? ` · ${bytes32ToFeedKey(market.feedKey)}` : ""}
                  </p>
                  <h2 className="font-editorial font-bold text-xl leading-snug mt-2">
                    {market
                      ? marketQuestion(bytes32ToFeedKey(market.feedKey), market.strike, market.expiry)
                      : `Market ${position.marketId}`}
                  </h2>
                  <div className="text-sm mt-4 space-y-1">
                    <p className="m-0">
                      YES {formatHbar(position.yesBalance)} &middot; redeemable {formatHbar(yesQuote)}
                    </p>
                    <p className="m-0">
                      NO {formatHbar(position.noBalance)} &middot; redeemable {formatHbar(noQuote)}
                    </p>
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

"use client";

import { useMemo } from "react";
import Link from "next/link";
import { HederaPortalFaucet } from "@scaffold-hbar-ui/components";
import { useAccount, useReadContracts } from "wagmi";
import { EmptyState, ErrorState } from "~~/components/markets/States";
import { AssetBadge } from "~~/components/markets/ui";
import { useMarkets } from "~~/hooks/markets/useMarkets";
import { usePositions } from "~~/hooks/markets/usePositions";
import { useDeployedContractInfo, useTargetNetwork } from "~~/hooks/scaffold-hbar";
import scaffoldConfig from "~~/scaffold.config";
import { bytes32ToFeedKey } from "~~/utils/markets/feeds";
import { marketQuestion } from "~~/utils/markets/question";
import { batchReadError } from "~~/utils/markets/readResults";
import { formatHbar } from "~~/utils/markets/units";

const PortfolioView = () => {
  const { address: account } = useAccount();
  const { targetNetwork } = useTargetNetwork();
  const { data: deployed } = useDeployedContractInfo({ contractName: "PredictionMarkets" });
  const {
    positions,
    isLoading: positionsLoading,
    error: positionsError,
    noAccount,
    refetch: refetchPositions,
  } = usePositions(account);
  const { markets, marketIds, isLoading: marketsLoading, error: marketsError } = useMarkets();

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

  const {
    data: quotes,
    isPending: quotesPending,
    error: quotesError,
    refetch: refetchQuotes,
  } = useReadContracts({
    contracts,
    query: { enabled: contracts.length > 0, refetchInterval: scaffoldConfig.pollingInterval },
  });

  if (!account) {
    return (
      <div className="shell page">
        <h1 className="text-2xl font-bold m-0">Portfolio</h1>
        <div className="mt-6">
          <EmptyState title="No wallet connected" body="Connect a wallet to see positions across markets." />
        </div>
      </div>
    );
  }

  const error = positionsError ?? marketsError ?? quotesError ?? batchReadError(quotes);
  const loading = !error && (positionsLoading || marketsLoading || (positions.length > 0 && quotesPending));
  const retry = () => {
    refetchPositions();
    if (contracts.length > 0) void refetchQuotes();
  };

  return (
    <div className="shell page">
      <h1 className="text-2xl font-bold m-0">Portfolio</h1>
      <div className="mt-6">
        {noAccount ? (
          <div className="panel border-dashed p-10 text-center">
            <p className="text-lg font-semibold m-0">This address is not a Hedera account yet</p>
            <p className="text-sm text-base-content/60 mt-2 mb-5">
              A new wallet or burner address becomes an account when it first receives HBAR. Send it testnet HBAR, for
              example from the Hedera Portal faucet, and this page updates on its own.
            </p>
            <HederaPortalFaucet showIcon />
          </div>
        ) : error ? (
          <ErrorState
            message="Positions or payouts could not be loaded. Check your connection and retry."
            onRetry={retry}
          />
        ) : loading ? (
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
                quotes?.[index * 2]?.status === "success" ? BigInt(quotes[index * 2].result as bigint) : undefined;
              const noQuote =
                quotes?.[index * 2 + 1]?.status === "success"
                  ? BigInt(quotes[index * 2 + 1].result as bigint)
                  : undefined;
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
                      <p className="m-0 text-base-content/60 tabular-nums">
                        Redeemable {yesQuote === undefined ? "Unavailable" : formatHbar(yesQuote)}
                      </p>
                    </div>
                    <div className="rounded-xl bg-no/10 px-3 py-2">
                      <p className="m-0 font-semibold text-no">NO {formatHbar(position.noBalance)}</p>
                      <p className="m-0 text-base-content/60 tabular-nums">
                        Redeemable {noQuote === undefined ? "Unavailable" : formatHbar(noQuote)}
                      </p>
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

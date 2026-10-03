"use client";

import { useMemo } from "react";
import { toMarket } from "./abis";
import { useReadContracts } from "wagmi";
import { useDeployedContractInfo, useScaffoldReadContract, useTargetNetwork } from "~~/hooks/scaffold-hbar";
import scaffoldConfig from "~~/scaffold.config";
import { batchReadError } from "~~/utils/markets/readResults";
import type { Market } from "~~/utils/markets/types";

/**
 * Reads marketCount then every getMarket in one batched call, newest first.
 * Renders safely without a wallet.
 */
export function useMarkets(): {
  marketIds: number[];
  markets: (Market | null)[];
  count: number | undefined;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
} {
  const { targetNetwork } = useTargetNetwork();
  const { data: deployed } = useDeployedContractInfo({ contractName: "PredictionMarkets" });
  const {
    data: count,
    isPending: countPending,
    error: countError,
    refetch: refetchCount,
  } = useScaffoldReadContract({ contractName: "PredictionMarkets", functionName: "marketCount" });

  const marketIds = useMemo(() => {
    if (count === undefined) return [];
    const total = Number(count);
    return Array.from({ length: total }, (_, index) => total - 1 - index);
  }, [count]);

  const contracts = useMemo(() => {
    if (!deployed || marketIds.length === 0) return [];
    return marketIds.map(id => ({
      address: deployed.address,
      abi: deployed.abi,
      functionName: "getMarket" as const,
      args: [BigInt(id)] as const,
      chainId: targetNetwork.id,
    }));
  }, [deployed, marketIds, targetNetwork.id]);

  const {
    data: results,
    error: marketsError,
    isPending: marketsPending,
    refetch: refetchMarkets,
  } = useReadContracts({
    contracts,
    query: { enabled: contracts.length > 0, refetchInterval: scaffoldConfig.pollingInterval },
  });

  const markets = useMemo<(Market | null)[]>(() => {
    if (marketIds.length === 0) return [];
    if (!results) return marketIds.map(() => null);
    return results.map(entry => {
      if (entry.status !== "success" || entry.result === undefined || entry.result === null) return null;
      try {
        return toMarket(entry.result as Parameters<typeof toMarket>[0]);
      } catch {
        return null;
      }
    });
  }, [marketIds, results]);

  const error =
    countError ??
    marketsError ??
    batchReadError(results) ??
    (results && markets.some(market => market === null) ? new Error("A market could not be decoded.") : null);

  return {
    marketIds,
    markets,
    count: count === undefined ? undefined : Number(count),
    // isPending, not isLoading: the count read stays disabled until the contract address resolves, and a
    // disabled query is not "loading", which would flash the empty state before the first fetch.
    isLoading: !error && (countPending || (marketIds.length > 0 && marketsPending)),
    error,
    refetch: () => {
      void refetchCount();
      if (contracts.length > 0) void refetchMarkets();
    },
  };
}

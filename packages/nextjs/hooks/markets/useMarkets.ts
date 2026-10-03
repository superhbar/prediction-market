"use client";

import { useMemo } from "react";
import { toMarket } from "./abis";
import { useReadContracts } from "wagmi";
import { useDeployedContractInfo, useScaffoldReadContract, useTargetNetwork } from "~~/hooks/scaffold-hbar";
import scaffoldConfig from "~~/scaffold.config";
import { batchReadError } from "~~/utils/markets/readResults";
import type { Market } from "~~/utils/markets/types";

/**
 * Reads marketCount then getMarket for the newest markets in one batched call, newest first.
 * `limit` bounds how many markets are read and polled; omit it to read every market (the portfolio
 * needs all of them to find positions). Renders safely without a wallet.
 */
export function useMarkets(limit?: number): {
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
    const shown = limit === undefined ? total : Math.min(total, limit);
    return Array.from({ length: shown }, (_, index) => total - 1 - index);
  }, [count, limit]);

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

  // One unreadable market is skipped by the list; only a failure of every read is an error.
  const allFailed = !!results && results.length > 0 && markets.every(market => market === null);
  const error =
    countError ??
    marketsError ??
    (allFailed ? (batchReadError(results) ?? new Error("Markets could not be read.")) : null);

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

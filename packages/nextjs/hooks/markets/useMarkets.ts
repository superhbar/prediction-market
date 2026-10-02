"use client";

import { useMemo } from "react";
import { toMarket } from "./abis";
import { useReadContracts } from "wagmi";
import { useDeployedContractInfo, useScaffoldReadContract, useTargetNetwork } from "~~/hooks/scaffold-hbar";
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
} {
  const { targetNetwork } = useTargetNetwork();
  const { data: deployed } = useDeployedContractInfo({ contractName: "PredictionMarkets" });
  const {
    data: count,
    isLoading: countLoading,
    error: countError,
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
    isLoading: marketsLoading,
    error: marketsError,
  } = useReadContracts({ contracts, query: { enabled: contracts.length > 0 } });

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

  return {
    marketIds,
    markets,
    count: count === undefined ? undefined : Number(count),
    isLoading: countLoading || (marketIds.length > 0 && marketsLoading && !results),
    error: ((countError ?? marketsError) as Error | null) ?? null,
  };
}

"use client";

import { useMemo } from "react";
import { useReadContracts } from "wagmi";
import { useDeployedContractInfo, useTargetNetwork } from "~~/hooks/scaffold-hbar";
import type { MarketConfig } from "~~/utils/markets/types";

/**
 * Reads the PredictionMarkets timing and reserve config in one batch.
 * Renders safely without a wallet.
 */
export function useMarketConfig(): {
  config: MarketConfig | undefined;
  isLoading: boolean;
  error: Error | null;
} {
  const { targetNetwork } = useTargetNetwork();
  const { data: deployed } = useDeployedContractInfo({ contractName: "PredictionMarkets" });

  const contracts = useMemo(() => {
    if (!deployed) return [];
    const base = { address: deployed.address, abi: deployed.abi, chainId: targetNetwork.id } as const;
    return (
      [
        "settlementDelay",
        "retryDelay",
        "maxRetries",
        "maxRoundLag",
        "gracePeriod",
        "minDuration",
        "maxDuration",
        "minReserve",
        "retryCostEstimate",
        "SETTLE_GAS",
        "SCHEDULED_EXECUTION_COST",
      ] as const
    ).map(functionName => ({ ...base, functionName }));
  }, [deployed, targetNetwork.id]);

  const { data, isLoading, error } = useReadContracts({
    contracts,
    query: { enabled: contracts.length > 0 },
  });

  const config = useMemo<MarketConfig | undefined>(() => {
    if (!data || data.some(entry => entry.status !== "success" || entry.result === undefined)) return undefined;
    const values = data.map(entry => (entry.status === "success" ? entry.result : undefined));
    if (values.some(value => value === undefined)) return undefined;
    const [
      settlementDelay,
      retryDelay,
      maxRetries,
      maxRoundLag,
      gracePeriod,
      minDuration,
      maxDuration,
      minReserve,
      retryCostEstimate,
      settleGas,
      scheduledExecutionCost,
    ] = values as bigint[];
    return {
      settlementDelay,
      retryDelay,
      maxRetries: Number(maxRetries),
      maxRoundLag,
      gracePeriod,
      minDuration,
      maxDuration,
      minReserve,
      retryCostEstimate,
      settleGas,
      scheduledExecutionCost,
    };
  }, [data]);

  return { config, isLoading: isLoading || (!config && !error), error: (error as Error | null) ?? null };
}

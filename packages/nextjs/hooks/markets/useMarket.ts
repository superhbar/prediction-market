"use client";

import { useMemo } from "react";
import { toMarket } from "./abis";
import { useScaffoldReadContract } from "~~/hooks/scaffold-hbar";
import type { Market } from "~~/utils/markets/types";

/** True for non-negative integer id strings. */
export function isValidMarketId(id: string): boolean {
  return /^\d+$/.test(id);
}

/**
 * Reads one market by id. Invalid ids and ids past marketCount report
 * notFound with HTTP 200 content handled by the page.
 *
 * Loading uses `isPending`, not `isLoading`: the read stays disabled until the deployed contract
 * address resolves, and a disabled query reports isLoading false with no data, which would
 * otherwise flash "not found" before the first fetch. A failed read is reported as `error`.
 */
export function useMarket(id: string): {
  market: Market | undefined;
  invalid: boolean;
  notFound: boolean;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
} {
  const valid = isValidMarketId(id);
  const {
    data: raw,
    isPending: marketPending,
    error: marketError,
    refetch: refetchMarket,
  } = useScaffoldReadContract({
    contractName: "PredictionMarkets",
    functionName: "getMarket",
    args: [valid ? BigInt(id) : undefined],
  });
  const {
    data: count,
    isPending: countPending,
    error: countError,
    refetch: refetchCount,
  } = useScaffoldReadContract({
    contractName: "PredictionMarkets",
    functionName: "marketCount",
  });

  const market = useMemo(() => {
    if (!raw) return undefined;
    try {
      return toMarket(raw as Parameters<typeof toMarket>[0]);
    } catch {
      return undefined;
    }
  }, [raw]);

  const pastEnd = valid && count !== undefined && BigInt(id) >= (count as bigint);
  // getMarket reverts for ids past the end, so that error means "not found", not a failed read.
  const error = pastEnd ? null : (countError ?? marketError ?? null);
  const pending = valid && !error && (countPending || (!pastEnd && marketPending));
  return {
    market: pastEnd ? undefined : market,
    invalid: !valid,
    notFound: valid && !pending && !error && (pastEnd || !market),
    isLoading: pending,
    error,
    refetch: () => {
      void refetchCount();
      void refetchMarket();
    },
  };
}

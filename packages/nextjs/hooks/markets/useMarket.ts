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
 */
export function useMarket(id: string): {
  market: Market | undefined;
  invalid: boolean;
  notFound: boolean;
  isLoading: boolean;
} {
  const valid = isValidMarketId(id);
  const { data: raw, isLoading: marketLoading } = useScaffoldReadContract({
    contractName: "PredictionMarkets",
    functionName: "getMarket",
    args: [valid ? BigInt(id) : undefined],
  });
  const { data: count, isLoading: countLoading } = useScaffoldReadContract({
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
  return {
    market: pastEnd ? undefined : market,
    invalid: !valid,
    notFound: valid && !marketLoading && !countLoading && (pastEnd || (!!count && !market)),
    isLoading: valid && (marketLoading || countLoading),
  };
}

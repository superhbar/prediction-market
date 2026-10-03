"use client";

import { useScaffoldReadContract } from "~~/hooks/scaffold-hbar";
import { feedKeyToBytes32 } from "~~/utils/markets/feeds";

/** Reads the Chainlink address and Pyth id registered for a feed label. */
export function useFeedInfo(feedLabel: string): {
  chainlink: `0x${string}` | undefined;
  pythId: `0x${string}` | undefined;
  isLoading: boolean;
  error: Error | null;
} {
  const { data, isPending, error } = useScaffoldReadContract({
    contractName: "PredictionMarkets",
    functionName: "feeds",
    args: [feedKeyToBytes32(feedLabel)],
  });
  // A public mapping getter with several outputs returns a positional tuple, not an object.
  const [chainlink, pythId] = (data ?? []) as readonly [`0x${string}`?, `0x${string}`?];
  return { chainlink, pythId, isLoading: isPending && !error, error };
}

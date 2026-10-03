"use client";

import { useEffect, useState } from "react";
import { aggregatorAbi } from "./abis";
import { useFeedInfo } from "./useFeedInfo";
import { usePublicClient } from "wagmi";
import { useTargetNetwork } from "~~/hooks/scaffold-hbar";

export type PricePoint = {
  roundId: bigint;
  /** Raw Chainlink answer in feed decimals. */
  price: bigint;
  /** Price normalised to 1e18 fixed point. */
  normalized: bigint;
  timestamp: bigint;
};

const MAX_ROUNDS = 30;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

type HistorySnapshot = {
  key: string;
  points: PricePoint[];
  decimals: number | undefined;
  error: string | null;
};

/** How often the history is re-read, so new rounds (and "Settle now") appear without a reload. */
const REFRESH_MS = 60_000;

/**
 * Walks back at most 30 Chainlink rounds from latestRoundData, stopping at a
 * phase boundary (round id top 16 bits change) or a zero updatedAt. Re-reads every minute and keeps
 * showing the previous rounds while a refresh is in flight.
 */
export function useChainlinkHistory(feedLabel: string): {
  points: PricePoint[];
  decimals: number | undefined;
  currentPrice: PricePoint | undefined;
  isLoading: boolean;
  error: string | null;
} {
  const { targetNetwork } = useTargetNetwork();
  const { chainlink, error: feedError, isLoading: feedLoading } = useFeedInfo(feedLabel);
  const publicClient = usePublicClient({ chainId: targetNetwork.id });
  const [tick, setTick] = useState(0);
  const base = chainlink && chainlink !== ZERO_ADDRESS ? `${targetNetwork.id}:${chainlink}` : "";
  const key = base === "" ? "" : `${base}:${tick}`;
  const [snapshot, setSnapshot] = useState<HistorySnapshot>({ key: "", points: [], decimals: undefined, error: null });

  useEffect(() => {
    if (!publicClient || !chainlink || key === "" || snapshot.key === key) return;
    let cancelled = false;
    const load = async () => {
      try {
        const feedDecimals = (await publicClient.readContract({
          address: chainlink,
          abi: aggregatorAbi,
          functionName: "decimals",
        })) as number;
        const scale = 10n ** BigInt(18 - Number(feedDecimals));
        const latest = (await publicClient.readContract({
          address: chainlink,
          abi: aggregatorAbi,
          functionName: "latestRoundData",
        })) as unknown as [bigint, bigint, bigint, bigint, bigint];
        const collected: PricePoint[] = [];
        const roundId = latest[0];
        const answer = latest[1];
        const updatedAt = latest[3];
        if (updatedAt !== 0n && answer > 0) {
          collected.push({ roundId, price: answer, normalized: answer * scale, timestamp: updatedAt });
        }
        // Round ids within one phase are consecutive, so fetch the previous rounds in parallel and
        // keep the contiguous run that stays in the latest round's phase.
        const phase = roundId >> 64n;
        const depth = Math.min(MAX_ROUNDS - 1, Number(roundId & 0xffffffffffffffffn) - 1);
        const previous = await Promise.allSettled(
          Array.from({ length: Math.max(depth, 0) }, (_, i) =>
            publicClient.readContract({
              address: chainlink,
              abi: aggregatorAbi,
              functionName: "getRoundData",
              args: [roundId - BigInt(i + 1)],
            }),
          ),
        );
        for (const result of previous) {
          if (result.status !== "fulfilled") break;
          const prev = result.value as unknown as [bigint, bigint, bigint, bigint, bigint];
          if (prev[0] >> 64n !== phase || prev[3] === 0n || prev[1] <= 0) break;
          collected.push({ roundId: prev[0], price: prev[1], normalized: prev[1] * scale, timestamp: prev[3] });
        }
        if (!cancelled) {
          setSnapshot({ key, points: collected.reverse(), decimals: Number(feedDecimals), error: null });
        }
      } catch {
        if (!cancelled) {
          // Keep useful cached rounds, but report the failed refresh until a read succeeds.
          setSnapshot(previous =>
            previous.key.startsWith(`${base}:`) && previous.points.length > 0
              ? { ...previous, key, error: "Price refresh failed." }
              : { key, points: [], decimals: undefined, error: "Price history is unavailable." },
          );
        }
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [publicClient, chainlink, key, base, snapshot.key]);

  useEffect(() => {
    if (base === "") return;
    const timer = setInterval(() => setTick(count => count + 1), REFRESH_MS);
    return () => clearInterval(timer);
  }, [base]);

  const current = snapshot.key === key;
  // While a refresh is in flight, keep the previous rounds of the same feed on screen.
  const sameFeed = base !== "" && snapshot.key.startsWith(`${base}:`);
  const points = sameFeed ? snapshot.points : [];
  return {
    points,
    decimals: sameFeed ? snapshot.decimals : undefined,
    currentPrice: points.length > 0 ? points[points.length - 1] : undefined,
    isLoading: feedLoading || (base !== "" && !current && !sameFeed),
    error: feedError ? "Oracle feed could not be read." : sameFeed ? snapshot.error : null,
  };
}

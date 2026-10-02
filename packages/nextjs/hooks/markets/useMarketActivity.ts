"use client";

import { useCallback, useEffect, useState } from "react";
import { isValidMarketId } from "./useMarket";
import { useDeployedContractInfo, useTargetNetwork } from "~~/hooks/scaffold-hbar";
import { type ActivityEntry, decodeActivity } from "~~/utils/markets/activity";
import { mirrorBaseForChain } from "~~/utils/markets/hashscan";
import { fetchContractLogs } from "~~/utils/markets/mirror";

const REFRESH_MS = 30_000;

type ActivitySnapshot = {
  key: string;
  entries: ActivityEntry[];
  error: string | null;
};

/** True when the log indexes the given market id as topics[1] (compared as BigInt). */
export function logMatchesMarket(topics: `0x${string}`[] | undefined, marketId: string): boolean {
  try {
    return !!topics && topics.length > 1 && BigInt(topics[1] as string) === BigInt(marketId);
  } catch {
    return false;
  }
}

/**
 * Market history from the mirror node: fetches contract logs, keeps the ones
 * for this market (every PredictionMarkets event indexes marketId as
 * topics[1]) and decodes them. Refreshes every 30 seconds while showing the
 * previous entries. Never throws: a failed fetch surfaces as `error` and the
 * page keeps working.
 */
export function useMarketActivity(marketId: string): {
  entries: ActivityEntry[];
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
} {
  const { targetNetwork } = useTargetNetwork();
  const { data: contract } = useDeployedContractInfo({ contractName: "PredictionMarkets" });
  const [snapshot, setSnapshot] = useState<ActivitySnapshot | null>(null);
  const [nonce, setNonce] = useState(0);

  const refetch = useCallback(() => setNonce(count => count + 1), []);

  const address = contract?.address;
  const abi = contract?.abi;
  const valid = isValidMarketId(marketId);
  const base = valid && address ? `${targetNetwork.id}:${address}:${marketId}` : "";
  const key = base === "" ? "" : `${base}:${nonce}`;

  useEffect(() => {
    if (key === "" || !abi || !address || snapshot?.key === key) return;
    let cancelled = false;
    fetchContractLogs(mirrorBaseForChain(targetNetwork.id), address)
      .then(logs => {
        if (cancelled) return;
        setSnapshot({
          key,
          entries: decodeActivity(
            logs.filter(log => logMatchesMarket(log.topics, marketId)),
            abi,
          ),
          error: null,
        });
      })
      .catch(() => {
        if (cancelled) return;
        setSnapshot({ key, entries: [], error: "Activity is unavailable right now." });
      });
    return () => {
      cancelled = true;
    };
  }, [key, abi, address, marketId, targetNetwork.id, snapshot?.key]);

  useEffect(() => {
    if (key === "") return;
    const timer = setInterval(() => setNonce(count => count + 1), REFRESH_MS);
    return () => clearInterval(timer);
  }, [key]);

  const current = key !== "" && snapshot?.key === key;
  const previous = !current && snapshot !== null && base !== "" && snapshot.key.startsWith(`${base}:`);
  const entries = current ? (snapshot?.entries ?? []) : previous && snapshot ? snapshot.entries : [];
  return {
    entries,
    isLoading: key !== "" && !current,
    error: current ? (snapshot?.error ?? null) : null,
    refetch,
  };
}

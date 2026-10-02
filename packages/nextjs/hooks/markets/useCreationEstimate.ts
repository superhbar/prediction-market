"use client";

import { useEffect, useState } from "react";
import { useTargetNetwork } from "~~/hooks/scaffold-hbar";
import { mirrorBaseForChain } from "~~/utils/markets/hashscan";
import { fetchExchangeRate } from "~~/utils/markets/mirror";
import { tinybarToHbar } from "~~/utils/markets/units";

/**
 * Estimates the HBAR cost of creating a market: two HTS token creations
 * (~$1 each, converted at the mirror node rate with a 1.25 buffer) plus the
 * minimum reserve plus 1 HBAR of headroom.
 */
export function useCreationEstimate(minReserve: bigint | undefined): {
  hbarPerUsd: number | undefined;
  suggestedHbar: string;
  isLoading: boolean;
  error: string | null;
} {
  const { targetNetwork } = useTargetNetwork();
  const [snapshot, setSnapshot] = useState<{ key: number | null; rate: number | undefined; error: string | null }>({
    key: null,
    rate: undefined,
    error: null,
  });

  useEffect(() => {
    if (snapshot.key === targetNetwork.id) return;
    const key = targetNetwork.id;
    let cancelled = false;
    fetchExchangeRate(mirrorBaseForChain(key))
      .then(rate => {
        if (!cancelled) setSnapshot({ key, rate: rate.hbarPerUsd, error: null });
      })
      .catch(() => {
        if (!cancelled) setSnapshot({ key, rate: undefined, error: "Exchange rate is unavailable." });
      });
    return () => {
      cancelled = true;
    };
  }, [targetNetwork.id, snapshot.key]);

  const current = snapshot.key === targetNetwork.id;
  const hbarPerUsd = current ? snapshot.rate : undefined;
  const reserveHbar = minReserve === undefined ? 0 : Number(tinybarToHbar(minReserve));
  const suggestedHbar = hbarPerUsd === undefined ? "" : (2 * hbarPerUsd * 1.25 + reserveHbar + 1).toFixed(2);

  return {
    hbarPerUsd,
    suggestedHbar,
    isLoading: !current && snapshot.error === null,
    error: current ? snapshot.error : null,
  };
}

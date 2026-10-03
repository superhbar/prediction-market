"use client";

import { type Address, formatEther } from "viem";
import { useBalance } from "wagmi";
import { useTargetNetwork } from "~~/hooks/scaffold-hbar/useTargetNetwork";

/**
 * Connected account's HBAR balance, read through the JSON-RPC relay (which reports weibar, 18 decimals).
 * Replaces the scaffold-hbar-ui Balance component, which also fetches a USD price from CoinGecko and logs
 * a console error whenever that third-party request fails.
 */
export const HbarBalance = ({ address }: { address: Address }) => {
  const { targetNetwork } = useTargetNetwork();
  const { data, isError } = useBalance({
    address,
    chainId: targetNetwork.id,
    query: { refetchInterval: 15_000 },
  });

  if (isError) return <span className="text-xs text-error">Balance unavailable</span>;
  if (!data) return <span className="text-xs opacity-60">...</span>;

  const hbar = Number(formatEther(data.value));
  return (
    <span className="font-semibold tabular-nums">
      {hbar.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{" "}
      <span className="font-normal text-base-content/50">HBAR</span>
    </span>
  );
};

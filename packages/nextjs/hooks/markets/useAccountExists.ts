"use client";

import { useQuery } from "@tanstack/react-query";
import type { Address } from "viem";
import { useTargetNetwork } from "~~/hooks/scaffold-hbar";
import { fetchAccountExists } from "~~/utils/markets/mirror";

/**
 * Whether the connected address is a Hedera account yet. Undefined while unknown or without an address.
 * Rechecks every 15 seconds while missing, so funding a fresh burner from the faucet shows up on its own.
 */
export function useAccountExists(address: Address | undefined): boolean | undefined {
  const { targetNetwork } = useTargetNetwork();
  const { data } = useQuery({
    queryKey: ["accountExists", targetNetwork.id, address],
    enabled: !!address,
    queryFn: () => fetchAccountExists(targetNetwork.id, address!),
    refetchInterval: query => (query.state.data === false ? 15_000 : false),
  });
  return address ? data : undefined;
}

import { useEffect, useState } from "react";
import { chainIdToHederaNetwork, getHederaAccountId } from "~~/utils/scaffold-hbar";

export function useHederaAccountId(evmAddress: string | undefined, chainId?: number) {
  const [resolved, setResolved] = useState<{ address: string | undefined; chainId?: number; accountId: string | null }>(
    {
      address: undefined,
      chainId: undefined,
      accountId: null,
    },
  );

  useEffect(() => {
    if (!evmAddress) {
      return;
    }

    let cancelled = false;
    const network = chainIdToHederaNetwork(chainId ?? 296);

    // State updates happen in the async fetch callbacks, not synchronously in the effect.
    getHederaAccountId(evmAddress, network)
      .then(id => {
        if (!cancelled) setResolved({ address: evmAddress, chainId, accountId: id });
      })
      .catch(() => {
        if (!cancelled) setResolved({ address: evmAddress, chainId, accountId: null });
      });

    return () => {
      cancelled = true;
    };
  }, [evmAddress, chainId]);

  if (!evmAddress) {
    return { accountId: null as string | null, isLoading: false };
  }

  // Derived during render: a result belongs to the current request only when it resolved for it.
  const isLoading = resolved.address !== evmAddress || resolved.chainId !== chainId;
  return { accountId: resolved.accountId, isLoading };
}

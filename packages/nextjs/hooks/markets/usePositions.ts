"use client";

import { useMemo } from "react";
import { erc20BalanceAbi } from "./abis";
import { useMarkets } from "./useMarkets";
import type { Address } from "viem";
import { useReadContracts } from "wagmi";
import { useTargetNetwork } from "~~/hooks/scaffold-hbar";
import scaffoldConfig from "~~/scaffold.config";
import { batchReadError } from "~~/utils/markets/readResults";

export type Position = {
  marketId: number;
  yesBalance: bigint;
  noBalance: bigint;
};

/**
 * Reads balanceOf on every market's YES and NO position token for an
 * account, in one batch. Empty without an account.
 */
export function usePositions(account: Address | undefined): {
  positions: Position[];
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
} {
  const { targetNetwork } = useTargetNetwork();
  const { marketIds, markets, isLoading: marketsLoading, error: marketsError, refetch: refetchMarkets } = useMarkets();

  // Only markets that loaded get balance reads, so results are paired with this list, never with
  // marketIds by position: a failed market read would otherwise shift every later market's balances.
  const loaded = useMemo(
    () =>
      marketIds.flatMap((id, index) => {
        const market = markets[index];
        return market ? [{ id, market }] : [];
      }),
    [marketIds, markets],
  );

  const contracts = useMemo(() => {
    if (!account) return [];
    return loaded.flatMap(({ market }) =>
      [market.yesToken, market.noToken].map(token => ({
        address: token,
        abi: erc20BalanceAbi,
        functionName: "balanceOf" as const,
        args: [account] as const,
        chainId: targetNetwork.id,
      })),
    );
  }, [account, loaded, targetNetwork.id]);

  const {
    data: results,
    isPending,
    error: balancesError,
    refetch: refetchBalances,
  } = useReadContracts({
    contracts,
    query: { enabled: contracts.length > 0, refetchInterval: scaffoldConfig.pollingInterval },
  });

  const positions = useMemo<Position[]>(() => {
    if (!account || !results) return [];
    return loaded.flatMap(({ id }, index) => {
      const yes = results[index * 2];
      const no = results[index * 2 + 1];
      if (yes?.status !== "success" || no?.status !== "success" || yes.result === undefined || no.result === undefined)
        return [];
      const yesBalance = BigInt(yes.result as bigint);
      const noBalance = BigInt(no.result as bigint);
      if (yesBalance === 0n && noBalance === 0n) return [];
      return [{ marketId: id, yesBalance, noBalance }];
    });
  }, [account, results, loaded]);

  const error = account ? (marketsError ?? balancesError ?? batchReadError(results)) : null;
  return {
    positions,
    isLoading: !!account && !error && (marketsLoading || (loaded.length > 0 && isPending)),
    error,
    refetch: () => {
      refetchMarkets();
      if (contracts.length > 0) void refetchBalances();
    },
  };
}

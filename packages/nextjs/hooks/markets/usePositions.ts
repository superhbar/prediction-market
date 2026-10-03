"use client";

import { useMemo } from "react";
import { erc20BalanceAbi } from "./abis";
import { useAccountExists } from "./useAccountExists";
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
 * account, in one batch. Empty without an address, and empty (not an error) for an address
 * that has no Hedera account yet, since HTS balance reads revert for those.
 */
export function usePositions(account: Address | undefined): {
  positions: Position[];
  isLoading: boolean;
  error: Error | null;
  /** True when the address has no Hedera account yet (for example a fresh, unfunded burner). */
  noAccount: boolean;
  refetch: () => void;
} {
  const { targetNetwork } = useTargetNetwork();
  const { marketIds, markets, isLoading: marketsLoading, error: marketsError, refetch: refetchMarkets } = useMarkets();
  const accountExists = useAccountExists(account);

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
    if (!account || accountExists !== true) return [];
    return loaded.flatMap(({ market }) =>
      [market.yesToken, market.noToken].map(token => ({
        address: token,
        abi: erc20BalanceAbi,
        functionName: "balanceOf" as const,
        args: [account] as const,
        chainId: targetNetwork.id,
      })),
    );
  }, [account, accountExists, loaded, targetNetwork.id]);

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

  const noAccount = !!account && accountExists === false;
  const error = account && !noAccount ? (marketsError ?? balancesError ?? batchReadError(results)) : null;
  return {
    positions: noAccount ? [] : positions,
    isLoading:
      !!account &&
      !noAccount &&
      !error &&
      (accountExists === undefined || marketsLoading || (loaded.length > 0 && isPending)),
    error,
    noAccount,
    refetch: () => {
      refetchMarkets();
      if (contracts.length > 0) void refetchBalances();
    },
  };
}

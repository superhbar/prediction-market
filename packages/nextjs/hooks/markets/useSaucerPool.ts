"use client";

import type { Address } from "viem";
import { useReadContract, useReadContracts } from "wagmi";
import { useTargetNetwork } from "~~/hooks/scaffold-hbar";
import scaffoldConfig from "~~/scaffold.config";
import {
  type PoolReserves,
  SAUCERSWAP,
  orientReserves,
  saucerFactoryAbi,
  saucerPairAbi,
  spotPrice,
} from "~~/utils/markets/saucerswap";

const ZERO = "0x0000000000000000000000000000000000000000";

/**
 * The SaucerSwap V1 pool for a position token against HBAR, if one exists: pair address, reserves oriented as
 * HBAR/token, and the marginal price of one whole token in tinybar. Polls with the app's polling interval.
 */
export function useSaucerPool(token: Address | undefined): {
  supported: boolean;
  pair: Address | undefined;
  reserves: PoolReserves | undefined;
  price: bigint | undefined;
  /** `none` only once the factory has answered that no pair exists; a pending or failed read is never `none`. */
  status: "loading" | "none" | "ready" | "error";
  isLoading: boolean;
  refetch: () => void;
} {
  const { targetNetwork } = useTargetNetwork();
  const deployment = SAUCERSWAP[targetNetwork.id];
  const {
    data: pairAddress,
    isPending: pairPending,
    isError: pairError,
    refetch: refetchPair,
  } = useReadContract({
    address: deployment?.factory,
    abi: saucerFactoryAbi,
    functionName: "getPair",
    args: token && deployment ? [token, deployment.whbarToken] : undefined,
    chainId: targetNetwork.id,
    query: { enabled: !!token && !!deployment, refetchInterval: scaffoldConfig.pollingInterval },
  });
  const pair = pairAddress && pairAddress !== ZERO ? (pairAddress as Address) : undefined;

  const {
    data: pairState,
    isPending: statePending,
    isError: stateError,
    refetch: refetchState,
  } = useReadContracts({
    contracts: pair
      ? [
          { address: pair, abi: saucerPairAbi, functionName: "token0", chainId: targetNetwork.id },
          { address: pair, abi: saucerPairAbi, functionName: "getReserves", chainId: targetNetwork.id },
        ]
      : [],
    query: { enabled: !!pair, refetchInterval: scaffoldConfig.pollingInterval },
  });

  let reserves: PoolReserves | undefined;
  const [token0, rawReserves] = pairState ?? [];
  if (deployment && token0?.status === "success" && rawReserves?.status === "success") {
    const [reserve0, reserve1] = rawReserves.result as readonly [bigint, bigint, number];
    reserves = orientReserves(token0.result as Address, reserve0, reserve1, deployment.whbarToken);
  }

  const stateFailed = stateError || pairState?.some(entry => entry.status === "failure") === true;
  const status = reserves
    ? "ready"
    : pairPending || (pair && statePending)
      ? "loading"
      : pairError || stateFailed
        ? "error"
        : pair
          ? "loading"
          : "none";

  return {
    supported: !!deployment,
    status,
    pair,
    reserves,
    price: reserves ? spotPrice(reserves) : undefined,
    isLoading: !!deployment && !!token && pairPending,
    refetch: () => {
      void refetchPair();
      if (pair) void refetchState();
    },
  };
}

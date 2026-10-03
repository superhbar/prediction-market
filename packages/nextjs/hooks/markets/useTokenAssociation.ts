"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Address } from "viem";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import { associateAbi } from "~~/hooks/markets/abis";
import { useTargetNetwork } from "~~/hooks/scaffold-hbar";
import { longZeroToEntityId, mirrorBaseForChain } from "~~/utils/markets/hashscan";
import {
  type TokenReceivable,
  classifyAssociation,
  fetchAccount,
  fetchAccountExists,
  fetchIsTokenAssociated,
} from "~~/utils/markets/mirror";
import { GAS } from "~~/utils/markets/units";
import { notification } from "~~/utils/scaffold-hbar";

/** `unknown`: the mirror node could not be read; the check keeps retrying and the UI offers association anyway. */
export type Association = "checking" | TokenReceivable | "unknown";

/** Lookups repeat this often while the account may be unable to receive the token. */
const RECHECK_MS = 15_000;
/** After associate() succeeds, how long to wait for the mirror node to show the association. */
const CONFIRM_ATTEMPTS = 10;
const CONFIRM_INTERVAL_MS = 2_000;

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Whether the connected account can receive `token`, and a one-click HIP-719 association when it may not. A stake
 * or a SaucerSwap buy sends the account the token, so both check first. `enabled` gates the mirror lookups to the
 * moments a transfer is actually possible; every time it turns on, and on every mount or reconnect, the answer is
 * looked up again before a transfer is allowed.
 */
export function useTokenAssociation(token: Address, enabled: boolean) {
  const { address: account } = useAccount();
  const { targetNetwork } = useTargetNetwork();
  const publicClient = usePublicClient({ chainId: targetNetwork.id });
  const queryClient = useQueryClient();
  const { writeContractAsync } = useWriteContract();
  const [isAssociating, setIsAssociating] = useState(false);
  const tokenId = longZeroToEntityId(token);
  const queryKey = ["token-association", targetNetwork.id, account, token] as const;

  const query = useQuery({
    queryKey,
    enabled: enabled && !!account && !!tokenId,
    staleTime: 0,
    refetchOnMount: "always",
    retry: 2,
    queryFn: async (): Promise<TokenReceivable> => {
      if (!account || !tokenId) return "ok";
      // An address with no Hedera account yet gets one with unlimited automatic associations when it is first
      // funded, so there is nothing to associate, and its mirror lookups would only 404.
      if (!(await fetchAccountExists(targetNetwork.id, account))) return "ok";
      const mirror = mirrorBaseForChain(targetNetwork.id);
      const [info, associated] = await Promise.all([
        fetchAccount(mirror, account),
        fetchIsTokenAssociated(mirror, account, tokenId),
      ]);
      return classifyAssociation(info.maxAutomaticTokenAssociations, associated);
    },
    refetchInterval: current =>
      current.state.status === "error" || (current.state.data !== undefined && current.state.data !== "ok")
        ? RECHECK_MS
        : false,
  });

  let association: Association;
  if (!enabled || !account) association = "unknown";
  else if (query.data === undefined) association = query.isError ? "unknown" : "checking";
  // A cached "ok" is re-proven on every mount, reconnect and re-enable before a transfer is allowed. A warning
  // stays on screen during its periodic recheck so the prompt does not flicker.
  else if (query.data === "ok" && query.isFetching) association = "checking";
  else association = query.data;

  const associate = async () => {
    if (!account || !tokenId || !publicClient) return;
    setIsAssociating(true);
    try {
      const hash = await writeContractAsync({
        chainId: targetNetwork.id,
        account,
        address: token,
        abi: associateAbi,
        functionName: "associate",
        gas: BigInt(GAS.associate),
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error("Association reverted");
      // associate() reports HTS failures as a return code inside a successful EVM call, so only the account's
      // token relationship on the mirror node proves it worked.
      const mirror = mirrorBaseForChain(targetNetwork.id);
      for (let attempt = 0; attempt < CONFIRM_ATTEMPTS; attempt++) {
        if (await fetchIsTokenAssociated(mirror, account, tokenId).catch(() => false)) {
          queryClient.setQueryData(queryKey, "ok");
          notification.success("Token associated. You can continue now.");
          return;
        }
        await sleep(CONFIRM_INTERVAL_MS);
      }
      throw new Error("Association not visible on the mirror node");
    } catch {
      notification.error("Association did not go through. Try again.");
      void queryClient.invalidateQueries({ queryKey });
    } finally {
      setIsAssociating(false);
    }
  };

  return { association, associate, isAssociating };
}

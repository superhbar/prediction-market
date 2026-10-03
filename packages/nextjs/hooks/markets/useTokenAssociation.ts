"use client";

import { useEffect, useState } from "react";
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

export type Association = "checking" | TokenReceivable | "unknown";

/** Mirror lookups repeat this often while an association is outstanding, to notice one made elsewhere. */
const RECHECK_MS = 15_000;

/**
 * Whether the connected account can receive `token`, and a one-click HIP-719 association when it may not. A stake
 * or a SaucerSwap buy sends the account the token, so both check first. `enabled` gates the mirror lookups to the
 * moments a transfer is actually possible.
 */
export function useTokenAssociation(token: Address, enabled: boolean) {
  const { address: account } = useAccount();
  const { targetNetwork } = useTargetNetwork();
  const publicClient = usePublicClient({ chainId: targetNetwork.id });
  const { writeContractAsync, isPending } = useWriteContract();
  const [isConfirming, setIsConfirming] = useState(false);
  // Bumped to force a fresh lookup: on a timer while an association is outstanding, and after associating.
  const [round, setRound] = useState(0);
  const baseKey = account && enabled ? `${account}:${token}:${targetNetwork.id}` : "";
  const lookupKey = baseKey ? `${baseKey}:${round}` : "";
  const [snapshot, setSnapshot] = useState<{ baseKey: string; key: string; value: Association }>({
    baseKey: "",
    key: "",
    value: "unknown",
  });

  useEffect(() => {
    if (!lookupKey || snapshot.key === lookupKey) return;
    const tokenId = longZeroToEntityId(token);
    if (!tokenId || !account) return;
    let cancelled = false;
    const mirror = mirrorBaseForChain(targetNetwork.id);
    const accountAddress = account;
    // An address with no Hedera account yet gets one with unlimited automatic associations when it is first
    // funded, so there is nothing to associate, and its mirror lookups would only 404.
    fetchAccountExists(targetNetwork.id, accountAddress)
      .then(exists =>
        exists
          ? Promise.all([fetchAccount(mirror, accountAddress), fetchIsTokenAssociated(mirror, accountAddress, tokenId)])
          : null,
      )
      .then(result => {
        if (cancelled) return;
        const value = result === null ? "ok" : classifyAssociation(result[0].maxAutomaticTokenAssociations, result[1]);
        setSnapshot({ baseKey, key: lookupKey, value });
      })
      .catch(() => {
        if (!cancelled) setSnapshot({ baseKey, key: lookupKey, value: "unknown" });
      });
    return () => {
      cancelled = true;
    };
  }, [lookupKey, baseKey, snapshot.key, token, account, targetNetwork.id]);

  // Keep the last answer for the same account and token while a repeat lookup runs, so the prompt does not flicker.
  const association: Association = !baseKey
    ? "unknown"
    : snapshot.key === lookupKey || snapshot.baseKey === baseKey
      ? snapshot.value
      : "checking";
  const outstanding = association === "needs-association" || association === "may-need-association";

  useEffect(() => {
    if (!outstanding) return;
    const timer = setInterval(() => setRound(value => value + 1), RECHECK_MS);
    return () => clearInterval(timer);
  }, [outstanding]);

  const associate = async () => {
    if (!baseKey || !publicClient) return;
    try {
      const hash = await writeContractAsync({
        address: token,
        abi: associateAbi,
        functionName: "associate",
        gas: BigInt(GAS.associate),
      });
      setIsConfirming(true);
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error("Association reverted");
      setSnapshot({ baseKey, key: lookupKey, value: "ok" });
      notification.success("Token associated. You can continue now.");
    } catch {
      notification.error("Association failed. Try again.");
      setRound(value => value + 1);
    } finally {
      setIsConfirming(false);
    }
  };

  return { association, associate, isAssociating: isPending || isConfirming };
}

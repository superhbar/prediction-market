"use client";

import { useEffect, useState } from "react";
import type { Address } from "viem";
import { useAccount, useWriteContract } from "wagmi";
import { associateAbi } from "~~/hooks/markets/abis";
import { useTargetNetwork } from "~~/hooks/scaffold-hbar";
import { longZeroToEntityId, mirrorBaseForChain } from "~~/utils/markets/hashscan";
import { fetchAccount, fetchAccountExists, fetchIsTokenAssociated } from "~~/utils/markets/mirror";
import { GAS } from "~~/utils/markets/units";
import { notification } from "~~/utils/scaffold-hbar";

export type Association = "checking" | "ok" | "needs-association" | "unknown";

/**
 * Whether the connected account can receive `token`, and a one-click HIP-719 association when it cannot. An
 * account with no free automatic-association slot must associate before a stake or a SaucerSwap buy can send it
 * the token. `enabled` gates the mirror lookups to the moments a transfer is actually possible.
 */
export function useTokenAssociation(token: Address, enabled: boolean) {
  const { address: account } = useAccount();
  const { targetNetwork } = useTargetNetwork();
  const assocKey = account && enabled ? `${account}:${token}:${targetNetwork.id}` : "";
  const [snapshot, setSnapshot] = useState<{ key: string; value: Association }>({ key: "", value: "unknown" });
  const { writeContractAsync, isPending: isAssociating } = useWriteContract();

  useEffect(() => {
    if (!assocKey || snapshot.key === assocKey) return;
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
        const needsAssociation = result !== null && result[0].maxAutomaticTokenAssociations === 0 && !result[1];
        setSnapshot({ key: assocKey, value: needsAssociation ? "needs-association" : "ok" });
      })
      .catch(() => {
        if (!cancelled) setSnapshot({ key: assocKey, value: "unknown" });
      });
    return () => {
      cancelled = true;
    };
  }, [assocKey, snapshot.key, token, account, targetNetwork.id]);

  const association: Association =
    snapshot.key === assocKey && assocKey !== "" ? snapshot.value : assocKey !== "" ? "checking" : "unknown";

  const associate = async () => {
    if (!assocKey) return;
    try {
      await writeContractAsync({
        address: token,
        abi: associateAbi,
        functionName: "associate",
        gas: BigInt(GAS.associate),
      });
      setSnapshot({ key: assocKey, value: "ok" });
      notification.success("Token associated. You can continue now.");
    } catch {
      notification.error("Association failed. Try again.");
    }
  };

  return { association, associate, isAssociating };
}

"use client";

import { useEffect, useState } from "react";
import type { Address } from "viem";
import { useAccount, useWriteContract } from "wagmi";
import { associateAbi } from "~~/hooks/markets/abis";
import { useScaffoldWriteContract, useTargetNetwork } from "~~/hooks/scaffold-hbar";
import { useScaffoldReadContract } from "~~/hooks/scaffold-hbar";
import { longZeroToEntityId, mirrorBaseForChain } from "~~/utils/markets/hashscan";
import { fetchAccount, fetchIsTokenAssociated } from "~~/utils/markets/mirror";
import { type Market, MarketState } from "~~/utils/markets/types";
import { GAS, formatHbar, hbarToTinybar, hbarToWeibar, isPositiveDecimal, yesPercent } from "~~/utils/markets/units";
import { notification } from "~~/utils/scaffold-hbar";

type StakePanelProps = {
  marketId: number;
  market: Market;
};

type Association = "checking" | "ok" | "needs-association" | "unknown";

/** Stake YES/NO with quote preview, association check and explicit gas. */
export function StakePanel({ marketId, market }: StakePanelProps) {
  const { address: account } = useAccount();
  const { targetNetwork } = useTargetNetwork();
  const [side, setSide] = useState<"YES" | "NO">("YES");
  const [amount, setAmount] = useState("100");

  const yes = side === "YES";
  const token: Address = yes ? market.yesToken : market.noToken;
  const [nowMs] = useState(() => Date.now());
  const tradingOpen = market.state === MarketState.Open && nowMs < Number(market.expiry) * 1000;
  const amountValid = isPositiveDecimal(amount);
  const amountTinybar = amountValid ? hbarToTinybar(amount) : undefined;
  const assocKey = account && tradingOpen ? `${account}:${token}:${targetNetwork.id}` : "";
  const [assocSnapshot, setAssocSnapshot] = useState<{ key: string; value: Association }>({
    key: "",
    value: "unknown",
  });

  const { data: quote } = useScaffoldReadContract({
    contractName: "PredictionMarkets",
    functionName: "quotePayout",
    args: [BigInt(marketId), yes, amountTinybar ?? undefined],
  });

  const { writeContractAsync, isMining: isStaking } = useScaffoldWriteContract({
    contractName: "PredictionMarkets",
    disableSimulate: true,
  });
  const { writeContractAsync: writeTokenAsync, isPending: isAssociating } = useWriteContract();

  useEffect(() => {
    if (!assocKey || assocSnapshot.key === assocKey) return;
    const tokenId = longZeroToEntityId(token);
    if (!tokenId || !account) return;
    let cancelled = false;
    const mirror = mirrorBaseForChain(targetNetwork.id);
    const accountAddress = account;
    Promise.all([fetchAccount(mirror, accountAddress), fetchIsTokenAssociated(mirror, accountAddress, tokenId)])
      .then(([info, associated]) => {
        if (cancelled) return;
        setAssocSnapshot({
          key: assocKey,
          value: info.maxAutomaticTokenAssociations === 0 && !associated ? "needs-association" : "ok",
        });
      })
      .catch(() => {
        if (!cancelled) setAssocSnapshot({ key: assocKey, value: "unknown" });
      });
    return () => {
      cancelled = true;
    };
  }, [assocKey, assocSnapshot.key, token, account, targetNetwork.id]);

  const association: Association =
    assocSnapshot.key === assocKey && assocKey !== "" ? assocSnapshot.value : assocKey !== "" ? "checking" : "unknown";

  const stake = async () => {
    if (!amountValid || amountTinybar === undefined) {
      notification.error("Enter a stake amount greater than zero.");
      return;
    }
    try {
      await writeContractAsync({
        functionName: "stake",
        args: [BigInt(marketId), yes],
        value: hbarToWeibar(amount),
        gas: BigInt(GAS.stake),
      });
    } catch {
      // Notification is handled by the scaffold transactor.
    }
  };

  const associate = async () => {
    if (!assocKey) return;
    try {
      await writeTokenAsync({
        address: token,
        abi: associateAbi,
        functionName: "associate",
        gas: BigInt(GAS.associate),
      });
      setAssocSnapshot({ key: assocKey, value: "ok" });
      notification.success("Token associated. You can stake now.");
    } catch {
      notification.error("Association failed. Try again.");
    }
  };

  const yesPct = Math.round(yesPercent(market.yesPool, market.noPool));

  if (!tradingOpen) {
    return (
      <div className="border border-base-300 bg-base-100 p-7">
        <p className="text-[12px] uppercase tracking-[0.2em] text-base-content/60 m-0">Trading closed</p>
        <p className="font-editorial text-xl leading-snug mt-3 mb-0">
          {market.state === MarketState.Settled
            ? "This market is resolved. Winning tokens redeem for a share of the whole pool."
            : market.state === MarketState.Voided
              ? "This market was voided. Every position redeems 1:1 for the HBAR staked."
              : "Expiry has passed. The scheduled settlement reads the first oracle price at or after expiry."}
        </p>
        <p className="text-sm opacity-70 mt-3 mb-0">
          {formatHbar(market.yesPool + market.noPool)} pooled: {formatHbar(market.yesPool)} on YES,{" "}
          {formatHbar(market.noPool)} on NO.
        </p>
      </div>
    );
  }

  return (
    <div className="border border-base-300 bg-base-100 p-7">
      <p className="text-[12px] uppercase tracking-[0.2em] text-base-content/60 m-0">Take a side</p>
      <div className="grid grid-cols-2 gap-2 mt-3">
        <button
          className={`py-3 font-semibold rounded-full ${yes ? "bg-primary text-primary-content" : "border border-base-300"}`}
          onClick={() => setSide("YES")}
        >
          YES {yesPct}%
        </button>
        <button
          className={`py-3 font-semibold rounded-full ${!yes ? "bg-primary text-primary-content" : "border border-base-300"}`}
          onClick={() => setSide("NO")}
        >
          NO {100 - yesPct}%
        </button>
      </div>

      <label className="text-sm font-medium block mt-6 mb-2" htmlFor={`stake-amount-${marketId}`}>
        Amount
      </label>
      <div className="flex items-center border border-base-300 rounded-lg px-4 py-3">
        <input
          id={`stake-amount-${marketId}`}
          value={amount}
          onChange={event => setAmount(event.target.value)}
          inputMode="decimal"
          className="flex-1 bg-transparent outline-none font-editorial text-2xl min-w-0"
          aria-label="Stake amount"
        />
        <span className="text-sm font-semibold ml-2">HBAR</span>
      </div>
      <div className="flex gap-2 mt-2 text-sm">
        {["10", "50", "100"].map(quick => (
          <button
            key={quick}
            className="flex-1 border border-base-300 rounded-full py-1.5"
            onClick={() => setAmount(quick)}
          >
            {quick}
          </button>
        ))}
      </div>

      <div className="editorial-rule my-5" />
      <dl className="text-sm space-y-2">
        <div className="flex justify-between">
          <dt className="opacity-70">You receive</dt>
          <dd className="font-semibold">{amountValid ? `${amount} ${side} tokens` : "-"}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="opacity-70">Redeem value now</dt>
          <dd className="font-semibold">{quote !== undefined ? formatHbar(quote as bigint) : "-"}</dd>
        </div>
      </dl>

      {!account && <p className="text-[13px] mt-3 opacity-70">Connect a wallet to stake.</p>}
      {association === "needs-association" && (
        <div className="mt-3 text-sm">
          <p className="opacity-70">This account is not associated with the {side} token.</p>
          <button className="btn btn-sm btn-outline mt-2" onClick={associate} disabled={isAssociating}>
            {isAssociating ? "Associating…" : "Associate token"}
          </button>
        </div>
      )}

      <button
        className="btn w-full mt-4 bg-neutral text-neutral-content rounded-full"
        onClick={stake}
        disabled={!account || !amountValid || isStaking || association === "needs-association"}
      >
        {isStaking ? "Staking…" : `Stake ${amountValid ? amount : "-"} HBAR on ${side}`}
      </button>
      <p className="text-[13px] mt-3 opacity-70 font-editorial italic">
        First stake on a token triggers a one-time auto-association fee.
      </p>
    </div>
  );
}

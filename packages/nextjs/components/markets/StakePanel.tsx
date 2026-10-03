"use client";

import { useEffect, useState } from "react";
import type { Address } from "viem";
import { useAccount, useWriteContract } from "wagmi";
import { associateAbi } from "~~/hooks/markets/abis";
import { useScaffoldWriteContract, useTargetNetwork } from "~~/hooks/scaffold-hbar";
import { longZeroToEntityId, mirrorBaseForChain } from "~~/utils/markets/hashscan";
import { fetchAccount, fetchAccountExists, fetchIsTokenAssociated } from "~~/utils/markets/mirror";
import { isRefund } from "~~/utils/markets/status";
import { type Market, MarketState, type UiStatus } from "~~/utils/markets/types";
import {
  GAS,
  formatHbar,
  hbarToTinybar,
  hbarToWeibar,
  isPositiveDecimal,
  projectedPayout,
} from "~~/utils/markets/units";
import { notification } from "~~/utils/scaffold-hbar";

type StakePanelProps = {
  marketId: number;
  market: Market;
  /** Derived status, so the closed state can say what the market is waiting for. */
  status: UiStatus;
  /** Side selected on first render, from the market card's Stake Yes or Stake No link. */
  initialSide?: "YES" | "NO";
};

type Association = "checking" | "ok" | "needs-association" | "unknown";

/** Stake YES/NO with a projected payout, association check and explicit gas. */
export function StakePanel({ marketId, market, status, initialSide = "YES" }: StakePanelProps) {
  const { address: account } = useAccount();
  const { targetNetwork } = useTargetNetwork();
  const [side, setSide] = useState<"YES" | "NO">(initialSide);
  const [amount, setAmount] = useState("100");

  const yes = side === "YES";
  const token: Address = yes ? market.yesToken : market.noToken;
  // Re-check the clock so the form closes when the market expires while the page is open.
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 5_000);
    return () => clearInterval(timer);
  }, []);
  const tradingOpen = market.state === MarketState.Open && nowMs < Number(market.expiry) * 1000;
  const amountValid = isPositiveDecimal(amount);
  const amountTinybar = amountValid ? hbarToTinybar(amount) : undefined;
  const assocKey = account && tradingOpen ? `${account}:${token}:${targetNetwork.id}` : "";
  const [assocSnapshot, setAssocSnapshot] = useState<{ key: string; value: Association }>({
    key: "",
    value: "unknown",
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
        setAssocSnapshot({ key: assocKey, value: needsAssociation ? "needs-association" : "ok" });
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

  if (!tradingOpen) {
    return (
      <div className="panel p-5">
        <p className="text-sm font-semibold text-base-content/70 m-0">Staking closed</p>
        <p className="text-base font-medium leading-snug mt-2 mb-0">
          {isRefund(market)
            ? "Every position in this market redeems 1:1 for the HBAR staked."
            : market.state === MarketState.Settled
              ? "This market is resolved. Winning tokens redeem for a share of the whole pool."
              : status === "no-price" || status === "voidable"
                ? "Chainlink published no price within 2 hours of expiry, so this market cannot settle on Chainlink. It settles with the first Pyth price after expiry, or anyone can void it after the grace period for 1:1 refunds."
                : "Waiting for the oracle. The first Chainlink price published after expiry decides the outcome, and the market settles itself when it arrives. Until then YES and NO tokens can still change hands on SaucerSwap."}
        </p>
        <p className="text-sm text-base-content/60 mt-3 mb-0">
          {formatHbar(market.yesPool + market.noPool)} pooled: {formatHbar(market.yesPool)} on YES,{" "}
          {formatHbar(market.noPool)} on NO.
        </p>
      </div>
    );
  }

  return (
    <div className="panel p-5">
      <p className="text-sm font-semibold text-base-content/70 m-0">Take a side</p>
      <div className="grid grid-cols-2 gap-2 mt-3" role="radiogroup" aria-label="Outcome">
        <button
          role="radio"
          aria-checked={yes}
          className={`py-3 rounded-xl font-semibold transition-colors ${yes ? "bg-yes text-base-200" : "bg-yes/10 text-yes hover:bg-yes/20"}`}
          onClick={() => setSide("YES")}
        >
          Yes
        </button>
        <button
          role="radio"
          aria-checked={!yes}
          className={`py-3 rounded-xl font-semibold transition-colors ${!yes ? "bg-no text-base-200" : "bg-no/10 text-no hover:bg-no/20"}`}
          onClick={() => setSide("NO")}
        >
          No
        </button>
      </div>

      <label className="text-sm font-medium block mt-5 mb-2" htmlFor={`stake-amount-${marketId}`}>
        Amount
      </label>
      <div className="flex items-center rounded-xl bg-base-200 border border-base-content/10 px-4 py-3 focus-within:border-primary">
        <input
          id={`stake-amount-${marketId}`}
          value={amount}
          onChange={event => setAmount(event.target.value)}
          inputMode="decimal"
          className="flex-1 bg-transparent outline-none text-2xl font-semibold tabular-nums min-w-0"
          aria-label="Stake amount"
        />
        <span className="text-sm font-semibold text-base-content/60 ml-2">HBAR</span>
      </div>
      <div className="flex gap-2 mt-2 text-sm">
        {["10", "50", "100"].map(quick => (
          <button
            key={quick}
            className="flex-1 rounded-lg bg-base-content/5 hover:bg-base-content/10 py-1.5 tabular-nums"
            onClick={() => setAmount(quick)}
          >
            {quick}
          </button>
        ))}
      </div>

      <dl className="text-sm space-y-2 mt-5 pt-4 border-t border-base-content/10">
        <div className="flex justify-between">
          <dt className="text-base-content/60">You receive</dt>
          <dd className="font-semibold">{amountValid ? `${amount} ${side} tokens` : "-"}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-base-content/60">Pays if {side} wins (estimate)</dt>
          <dd className="font-semibold tabular-nums">
            {amountTinybar !== undefined
              ? formatHbar(
                  projectedPayout(
                    amountTinybar,
                    yes ? market.yesPool : market.noPool,
                    yes ? market.noPool : market.yesPool,
                  ),
                )
              : "-"}
          </dd>
        </div>
      </dl>

      {!account && <p className="text-sm mt-3 text-base-content/60">Connect a wallet to stake.</p>}
      {association === "needs-association" && (
        <div className="mt-3 text-sm rounded-xl bg-warning/10 p-3">
          <p className="m-0 text-base-content/80">This account is not associated with the {side} token yet.</p>
          <button className="btn btn-sm btn-outline mt-2" onClick={associate} disabled={isAssociating}>
            {isAssociating ? "Associating…" : "Associate token"}
          </button>
        </div>
      )}

      <button
        className={`btn w-full mt-4 border-0 text-base-200 ${yes ? "bg-yes hover:bg-yes/90" : "bg-no hover:bg-no/90"}`}
        onClick={stake}
        disabled={!account || !amountValid || isStaking || association === "needs-association"}
      >
        {isStaking ? "Staking…" : `Stake ${side} for ${amountValid ? amount : "-"} HBAR`}
      </button>
      <p className="text-xs mt-3 mb-0 text-base-content/50">
        The payout preview is an estimate that assumes no further stakes; later stakes move it. Your first stake on a
        token also pays a one-time auto-association fee.
      </p>
    </div>
  );
}

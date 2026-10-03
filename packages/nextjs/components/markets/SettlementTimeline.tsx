"use client";

import { type ReactNode, useEffect, useState } from "react";
import { parseEther } from "viem";
import { useAccount } from "wagmi";
import { useFeedInfo } from "~~/hooks/markets/useFeedInfo";
import { useMarketConfig } from "~~/hooks/markets/useMarketConfig";
import { useNow } from "~~/hooks/markets/useNow";
import { useScheduleStatus } from "~~/hooks/markets/useScheduleStatus";
import { useScaffoldWriteContract, useTargetNetwork } from "~~/hooks/scaffold-hbar";
import { bytes32ToFeedKey } from "~~/utils/markets/feeds";
import { hashscanLink } from "~~/utils/markets/hashscan";
import { shortExpiry } from "~~/utils/markets/question";
import { deriveStatus, outcomeLabel, sourceLabel } from "~~/utils/markets/status";
import { type Market, MarketState, PriceSource } from "~~/utils/markets/types";
import { GAS, formatExactPrice } from "~~/utils/markets/units";
import { notification } from "~~/utils/scaffold-hbar";

type SettlementTimelineProps = {
  marketId: number;
  market: Market;
  /** Latest Chainlink round at or after expiry exists. */
  roundAvailable: boolean;
};

/** Scheduled settlement, retries, outcome and fallback actions with Hashscan links. */
export function SettlementTimeline({ marketId, market, roundAvailable }: SettlementTimelineProps) {
  const { address: account } = useAccount();
  const { targetNetwork } = useTargetNetwork();
  const { config } = useMarketConfig();
  const {
    schedule,
    scheduleId,
    status: scheduleStatus,
    isLoading: scheduleLoading,
  } = useScheduleStatus(market.schedule);
  const feedLabel = bytes32ToFeedKey(market.feedKey);
  const { pythId } = useFeedInfo(feedLabel);
  const [pythEnabled, setPythEnabled] = useState(false);
  const nowSec = useNow();

  useEffect(() => {
    let cancelled = false;
    fetch("/api/pyth?status=1")
      .then(response => response.json() as Promise<{ enabled: boolean }>)
      .then(data => {
        if (!cancelled) setPythEnabled(data.enabled === true);
      })
      .catch(() => {
        if (!cancelled) setPythEnabled(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const { writeContractAsync, isMining } = useScaffoldWriteContract({
    contractName: "PredictionMarkets",
    disableSimulate: true,
  });

  const status = config === undefined ? "awaiting-settlement" : deriveStatus(market, nowSec, config, roundAvailable);
  const expired = nowSec >= market.expiry;
  // The contract opens the Pyth fallback only after maxRoundLag, and only when Chainlink has no eligible round.
  const pythWindowOpen = config !== undefined && nowSec >= market.expiry + config.maxRoundLag;
  const isOpen = market.state === MarketState.Open;
  const isSettled = market.state === MarketState.Settled;
  const isVoided = market.state === MarketState.Voided;
  const voidable = status === "voidable";
  const retriesUsed = config ? config.maxRetries - market.retriesLeft : 0;

  const settleNow = async () => {
    try {
      await writeContractAsync({ functionName: "settle", args: [BigInt(marketId)], gas: BigInt(GAS.settle) });
    } catch {
      // Notification is handled by the scaffold transactor.
    }
  };

  const settleWithPyth = async () => {
    if (!pythId) {
      notification.error("Pyth feed is not configured for this market.");
      return;
    }
    try {
      const response = await fetch(`/api/pyth?id=${pythId}&publishTime=${market.expiry.toString()}`);
      const data = (await response.json()) as { enabled: boolean; updateData?: string[]; error?: string };
      if (!response.ok || !data.updateData) {
        notification.error(data.error ?? "Pyth update is unavailable.");
        return;
      }
      await writeContractAsync({
        functionName: "settleWithPyth",
        args: [BigInt(marketId), data.updateData as `0x${string}`[]],
        value: parseEther("0.1"),
        gas: BigInt(GAS.settleWithPyth),
      });
    } catch {
      notification.error("Pyth settlement failed.");
    }
  };

  const voidMarket = async () => {
    try {
      await writeContractAsync({ functionName: "voidMarket", args: [BigInt(marketId)], gas: BigInt(GAS.voidMarket) });
    } catch {
      // Notification is handled by the scaffold transactor.
    }
  };

  return (
    <section className="panel p-5 md:p-6">
      <h2 className="text-lg font-semibold mt-0 mb-5">How this market settles</h2>
      <ol className="relative list-none m-0 p-0 pl-8">
        <span className="absolute left-[7px] top-2 bottom-2 w-px bg-base-content/15" aria-hidden />
        <Step state={scheduleId ? "done" : "pending"} title="Settlement scheduled on-chain (HIP-1215)">
          {scheduleId ? (
            <>
              <a
                href={hashscanLink(targetNetwork.id, "schedule", scheduleId)}
                target="_blank"
                rel="noreferrer"
                className="link text-primary"
              >
                {retriesUsed > 0 ? "Latest schedule" : "Schedule"} {scheduleId} on Hashscan
              </a>
              <br />
              {scheduleLoading
                ? "Checking the mirror node…"
                : schedule?.executedTimestamp
                  ? `Executed by the network at ${shortExpiry(BigInt(Math.floor(Number(schedule.executedTimestamp))))}, no keeper involved.`
                  : `Mirror node status: ${scheduleStatus}.`}
            </>
          ) : (
            "No schedule recorded."
          )}
        </Step>
        <Step
          state={retriesUsed > 0 ? "done" : isSettled ? "skipped" : "pending"}
          title="Retry if no oracle round exists yet"
        >
          {!config
            ? "Checking retries…"
            : retriesUsed > 0
              ? `The scheduled call booked ${retriesUsed} ${retriesUsed === 1 ? "retry" : "retries"} from the market reserve. ${market.retriesLeft} of ${config.maxRetries} left.`
              : isSettled
                ? market.source === PriceSource.None
                  ? "Not needed."
                  : "Not needed: a round existed at the first attempt."
                : `Up to ${config.maxRetries} retries, ${Number(config.retryDelay) / 60} minutes apart, paid from the market reserve.`}
        </Step>
        <Step
          state={isSettled ? "done" : expired && isOpen ? "active" : "pending"}
          title={
            isSettled
              ? market.source === PriceSource.None
                ? "Settled as a refund: one side had no stakes"
                : `Settled ${outcomeLabel(market.outcome)} via ${sourceLabel(market.source)}`
              : "Settle on the first Chainlink price at or after expiry"
          }
        >
          {isSettled && market.source !== PriceSource.None
            ? `${formatExactPrice(market.settlementPrice)} at ${shortExpiry(market.settlementTime)}, against a strike of ${formatExactPrice(market.strike)}.`
            : isSettled
              ? "No oracle read was needed. Every position redeems 1:1."
              : "A price published before expiry is never used, so nobody can trade on a price that is already known."}
        </Step>
        <Step
          state={
            isVoided || market.source === PriceSource.Pyth
              ? "done"
              : voidable
                ? "active"
                : isSettled
                  ? "skipped"
                  : "pending"
          }
          title="Fallback: settle with Pyth, or void and refund"
          last
        >
          {isVoided
            ? "Voided after the grace period. Every position redeems 1:1."
            : isSettled
              ? "Not needed."
              : config
                ? `If Chainlink has no round within ${Number(config.maxRoundLag) / 3600} hours of expiry, anyone can settle with the first Pyth price at or after expiry. After ${Number(config.gracePeriod) / 3600} hours unsettled, anyone can void the market.`
                : "Checking the grace period…"}
        </Step>
      </ol>

      {!account && expired && isOpen && (
        <p className="text-sm mt-4 text-base-content/60">Connect a wallet to settle or void.</p>
      )}
      <div className="flex flex-wrap gap-2 mt-4">
        {isOpen && expired && roundAvailable && (
          <button className="btn btn-sm btn-primary" onClick={settleNow} disabled={!account || isMining}>
            {isMining ? "Settling…" : "Settle now"}
          </button>
        )}
        {isOpen && pythWindowOpen && !roundAvailable && pythEnabled && (
          <button className="btn btn-sm btn-outline" onClick={settleWithPyth} disabled={!account || isMining}>
            Settle with Pyth
          </button>
        )}
        {isOpen && pythWindowOpen && !roundAvailable && !pythEnabled && (
          <p className="text-sm text-base-content/60 m-0 w-full">
            Pyth fallback is not configured. Voiding after the grace period still applies.
          </p>
        )}
        {isOpen && voidable && (
          <button className="btn btn-sm btn-outline" onClick={voidMarket} disabled={!account || isMining}>
            Void market
          </button>
        )}
      </div>
    </section>
  );
}

type StepState = "done" | "active" | "pending" | "skipped";

/** One timeline row: a dot whose fill shows progress, a title and a muted detail line. */
function Step({
  state,
  title,
  last,
  children,
}: {
  state: StepState;
  title: string;
  last?: boolean;
  children: ReactNode;
}) {
  const dot =
    state === "done"
      ? "bg-primary border-primary"
      : state === "active"
        ? "bg-base-100 border-primary animate-pulse"
        : "bg-base-100 border-base-content/20";
  return (
    <li className={`relative ${last ? "" : "pb-7"} ${state === "skipped" ? "opacity-50" : ""}`}>
      <span className={`absolute -left-8 top-1 w-[15px] h-[15px] rounded-full border-2 ${dot}`} aria-hidden />
      <p className="font-semibold m-0">{title}</p>
      <p className="text-sm text-base-content/60 m-0 mt-1">{children}</p>
    </li>
  );
}

"use client";

import { useEffect, useState } from "react";
import { parseEther } from "viem";
import { useAccount } from "wagmi";
import { useFeedInfo } from "~~/hooks/markets/useFeedInfo";
import { useMarketConfig } from "~~/hooks/markets/useMarketConfig";
import { useScheduleStatus } from "~~/hooks/markets/useScheduleStatus";
import { useScaffoldWriteContract, useTargetNetwork } from "~~/hooks/scaffold-hbar";
import { bytes32ToFeedKey } from "~~/utils/markets/feeds";
import { hashscanLink } from "~~/utils/markets/hashscan";
import { deriveStatus, outcomeLabel, sourceLabel, statusLabel } from "~~/utils/markets/status";
import type { Market } from "~~/utils/markets/types";
import { GAS, formatPrice } from "~~/utils/markets/units";
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
  const [nowSec, setNowSec] = useState(() => Math.floor(Date.now() / 1000));

  useEffect(() => {
    const timer = setInterval(() => setNowSec(Math.floor(Date.now() / 1000)), 30_000);
    return () => clearInterval(timer);
  }, []);

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

  const status = config === undefined ? "awaiting-settlement" : deriveStatus(market, BigInt(nowSec), config);
  const expired = BigInt(nowSec) >= market.expiry;
  const isOpen = market.state === 0;
  const voidable = status === "voidable";

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
    <div>
      <h2 className="font-editorial font-bold text-2xl mt-10 mb-4">How settlement reads</h2>
      <div className="relative pl-24">
        <div className="absolute left-[74px] top-1 bottom-1 w-px bg-primary/40" aria-hidden />
        <div className="relative pb-8">
          <span className="absolute left-[-6rem] w-16 text-right text-xs text-base-content/60">scheduled</span>
          <span
            className="absolute left-[-34px] top-0 w-4 h-4 rounded-full border-2 border-primary bg-base-200"
            aria-hidden
          />
          <p className="text-[11px] uppercase tracking-[0.18em] text-primary font-semibold m-0">Step 1 of 4</p>
          <p className="font-semibold m-0 mt-1">Settlement scheduled on-chain (HIP-1215)</p>
          {scheduleId ? (
            <a
              href={hashscanLink(targetNetwork.id, "schedule", scheduleId)}
              target="_blank"
              rel="noreferrer"
              className="link text-primary text-sm"
            >
              Schedule {scheduleId} on Hashscan
            </a>
          ) : (
            <p className="text-sm text-base-content/60 m-0">No schedule recorded.</p>
          )}
          <p className="text-sm text-base-content/60 m-0 mt-1">
            {scheduleLoading ? "Checking schedule…" : `Mirror status: ${scheduleStatus}`}
            {schedule?.executedTimestamp && ` at ${schedule.executedTimestamp}`}
          </p>
        </div>
        <div className="relative pb-8">
          <span className="absolute left-[-6rem] w-16 text-right text-xs text-base-content/60">retries</span>
          <span className="absolute left-[-32px] top-1 w-2.5 h-2.5 rounded-full bg-base-300" aria-hidden />
          <p className="font-semibold m-0">Auto-retry if no oracle round yet</p>
          <p className="text-sm opacity-70 m-0">
            {config ? `${market.retriesLeft} of ${config.maxRetries} retries left.` : "Checking retries…"}
          </p>
        </div>
        <div className="relative pb-8">
          <span className="absolute left-[-6rem] w-16 text-right text-xs text-base-content/60">outcome</span>
          <span className="absolute left-[-32px] top-1 w-2.5 h-2.5 rounded-full bg-base-300" aria-hidden />
          {market.state === 1 ? (
            <>
              <p className="font-semibold m-0">
                Settled {outcomeLabel(market.outcome)} via {sourceLabel(market.source)}
              </p>
              {market.source !== 0 && (
                <p className="text-sm opacity-70 m-0">
                  Price {formatPrice(market.settlementPrice)} at{" "}
                  {new Date(Number(market.settlementTime) * 1000).toLocaleString("en-US", { timeZone: "UTC" })} UTC.
                </p>
              )}
            </>
          ) : (
            <p className="font-semibold m-0">Settles on first Chainlink price at or after expiry</p>
          )}
        </div>
        <div className="relative">
          <span className="absolute left-[-6rem] w-16 text-right text-xs text-base-content/60">fallback</span>
          <span className="absolute left-[-32px] top-1 w-2.5 h-2.5 rounded-full bg-base-300" aria-hidden />
          <p className="font-semibold m-0">Fallback: anyone can settle with Pyth, or void after the grace period</p>
          <p className="text-sm opacity-70 m-0">Status: {statusLabel(status)}.</p>
        </div>
      </div>

      {!account && expired && isOpen && <p className="text-sm mt-4 opacity-70">Connect a wallet to settle or void.</p>}
      <div className="flex flex-wrap gap-2 mt-4">
        {isOpen && expired && roundAvailable && (
          <button className="btn btn-sm btn-primary" onClick={settleNow} disabled={!account || isMining}>
            {isMining ? "Settling…" : "Settle now"}
          </button>
        )}
        {isOpen && expired && pythEnabled && (
          <button className="btn btn-sm btn-outline" onClick={settleWithPyth} disabled={!account || isMining}>
            Settle with Pyth
          </button>
        )}
        {isOpen && expired && !pythEnabled && (
          <p className="text-sm opacity-70 m-0 w-full">
            Pyth fallback is not configured. Chainlink settlement and voiding still apply.
          </p>
        )}
        {isOpen && voidable && (
          <button className="btn btn-sm btn-outline" onClick={voidMarket} disabled={!account || isMining}>
            Void market
          </button>
        )}
      </div>
    </div>
  );
}

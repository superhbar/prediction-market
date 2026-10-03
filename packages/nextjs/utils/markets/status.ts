import { type Market, type MarketConfig, MarketOutcome, MarketState, type UiStatus } from "./types";

/** Minimum config fields needed to derive a market status. */
export type StatusConfig = Pick<MarketConfig, "settlementDelay" | "gracePeriod" | "maxRetries">;

/**
 * Derives the UI status for a market from its on-chain record, the current
 * unix time and the contract config. Pure: no chain reads.
 */
export function deriveStatus(market: Market, nowSec: bigint, config: StatusConfig): UiStatus {
  if (market.state === MarketState.Voided) return "voided";
  if (market.state === MarketState.Settled) return "settled";
  if (market.outcome !== MarketOutcome.Unresolved) return "settled";
  if (nowSec < market.expiry) return "open";
  if (nowSec >= market.expiry + config.gracePeriod) return "voidable";
  // Retrying only while a self-booked retry is still pending; once retries run out, anyone can settle.
  if (market.retriesLeft < config.maxRetries && market.schedulePending) return "retrying";
  if (nowSec >= market.expiry + config.settlementDelay) return "settle-available";
  return "awaiting-settlement";
}

/** List-page filter values. */
export type MarketFilter = "all" | "open" | "awaiting" | "settled" | "voided";

/** Groups derived statuses into the list-page filter buckets. */
export function matchesFilter(status: UiStatus, filter: MarketFilter): boolean {
  if (filter === "all") return true;
  if (filter === "open") return status === "open";
  if (filter === "awaiting") {
    return (
      status === "awaiting-settlement" ||
      status === "retrying" ||
      status === "settle-available" ||
      status === "voidable"
    );
  }
  if (filter === "settled") return status === "settled";
  return status === "voided";
}

/** Short human label for a derived status. */
export function statusLabel(status: UiStatus): string {
  switch (status) {
    case "open":
      return "Open";
    // Both are the contract working on its own; retries are a detail the settlement timeline explains.
    case "awaiting-settlement":
    case "retrying":
      return "Resolving";
    case "settle-available":
      return "Settle available";
    case "settled":
      return "Settled";
    case "voidable":
      return "Voidable";
    case "voided":
      return "Voided";
  }
}

/**
 * True when positions refund 1:1 instead of paying a winner: the market was voided, or it settled
 * with outcome Invalid because one side had no stakes (the contract skips the oracle in that case).
 */
export function isRefund(market: Pick<Market, "state" | "outcome">): boolean {
  return market.state === MarketState.Voided || market.outcome === MarketOutcome.Invalid;
}

/** Headline for a closed market: "Resolved YES", "Resolved NO", "Refunded" or "Voided". */
export function resolutionLabel(market: Pick<Market, "state" | "outcome">): string {
  if (market.state === MarketState.Voided) return "Voided";
  if (market.outcome === MarketOutcome.Invalid) return "Refunded";
  return `Resolved ${outcomeLabel(market.outcome)}`;
}

/** Outcome label for a settled market. */
export function outcomeLabel(outcome: number): string {
  if (outcome === MarketOutcome.Yes) return "YES";
  if (outcome === MarketOutcome.No) return "NO";
  if (outcome === MarketOutcome.Invalid) return "Invalid";
  return "Unresolved";
}

/** Oracle source label for a settled market. */
export function sourceLabel(source: number): string {
  if (source === 1) return "Chainlink";
  if (source === 2) return "Pyth";
  return "None";
}

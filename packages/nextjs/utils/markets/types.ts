import type { Address } from "viem";

/** Market lifecycle state from PredictionMarkets.getMarket (0 Open, 1 Settled, 2 Voided). */
export const MarketState = {
  Open: 0,
  Settled: 1,
  Voided: 2,
} as const;

/** Market outcome from PredictionMarkets.getMarket (0 Unresolved, 1 Yes, 2 No, 3 Invalid). */
export const MarketOutcome = {
  Unresolved: 0,
  Yes: 1,
  No: 2,
  Invalid: 3,
} as const;

/** Settlement price source (0 None, 1 Chainlink, 2 Pyth). */
export const PriceSource = {
  None: 0,
  Chainlink: 1,
  Pyth: 2,
} as const;

/** Full market record as returned by PredictionMarkets.getMarket. Pools and reserve are tinybar. */
export type Market = {
  feedKey: `0x${string}`;
  strike: bigint;
  expiry: bigint;
  creator: Address;
  yesToken: Address;
  noToken: Address;
  yesPool: bigint;
  noPool: bigint;
  reserve: bigint;
  state: number;
  outcome: number;
  source: number;
  settlementPrice: bigint;
  settlementTime: bigint;
  retriesLeft: number;
  schedule: Address;
};

/** Timing and reserve configuration read from the PredictionMarkets contract. */
export type MarketConfig = {
  settlementDelay: bigint;
  retryDelay: bigint;
  maxRetries: number;
  maxRoundLag: bigint;
  gracePeriod: bigint;
  minDuration: bigint;
  maxDuration: bigint;
  minReserve: bigint;
  retryCostEstimate: bigint;
  settleGas: bigint;
  scheduledExecutionCost: bigint;
};

/** UI status derived from a Market, the current time and the contract config. */
export type UiStatus =
  "open" | "awaiting-settlement" | "retrying" | "settle-available" | "settled" | "voidable" | "voided";

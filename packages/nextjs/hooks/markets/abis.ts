import type { Address } from "viem";
import type { Market } from "~~/utils/markets/types";

/** Raw getMarket tuple as decoded by viem (named fields, integer sizes vary). */
type RawMarket = {
  feedKey: `0x${string}`;
  strike: bigint;
  expiry: bigint;
  creator: Address;
  yesToken: Address;
  noToken: Address;
  yesPool: bigint;
  noPool: bigint;
  reserve: bigint;
  state: number | bigint;
  outcome: number | bigint;
  source: number | bigint;
  settlementPrice: bigint;
  settlementTime: bigint;
  retriesLeft: number | bigint;
  schedule: Address;
  schedulePending?: boolean;
};

/** Normalises a decoded getMarket result into the app Market record. */
export function toMarket(raw: RawMarket): Market {
  return {
    feedKey: raw.feedKey,
    strike: BigInt(raw.strike),
    expiry: BigInt(raw.expiry),
    creator: raw.creator,
    yesToken: raw.yesToken,
    noToken: raw.noToken,
    yesPool: BigInt(raw.yesPool),
    noPool: BigInt(raw.noPool),
    reserve: BigInt(raw.reserve),
    state: Number(raw.state),
    outcome: Number(raw.outcome),
    source: Number(raw.source),
    settlementPrice: BigInt(raw.settlementPrice),
    settlementTime: BigInt(raw.settlementTime),
    retriesLeft: Number(raw.retriesLeft),
    schedule: raw.schedule,
    schedulePending: raw.schedulePending === true,
  };
}

/** Minimal ERC-20 ABI for position token balances. */
export const erc20BalanceAbi = [
  {
    type: "function",
    name: "balanceOf",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
] as const;

/** Minimal Chainlink AggregatorV3 ABI for price history. */
export const aggregatorAbi = [
  {
    type: "function",
    name: "decimals",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "latestRoundData",
    inputs: [],
    outputs: [
      { name: "roundId", type: "uint80" },
      { name: "answer", type: "int256" },
      { name: "startedAt", type: "uint256" },
      { name: "updatedAt", type: "uint256" },
      { name: "answeredInRound", type: "uint80" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getRoundData",
    inputs: [{ name: "_roundId", type: "uint80" }],
    outputs: [
      { name: "roundId", type: "uint80" },
      { name: "answer", type: "int256" },
      { name: "startedAt", type: "uint256" },
      { name: "updatedAt", type: "uint256" },
      { name: "answeredInRound", type: "uint80" },
    ],
    stateMutability: "view",
  },
] as const;

/** HIP-719 associate() on an HTS token address. */
export const associateAbi = [
  {
    type: "function",
    name: "associate",
    inputs: [],
    outputs: [{ name: "responseCode", type: "int64" }],
    stateMutability: "nonpayable",
  },
] as const;

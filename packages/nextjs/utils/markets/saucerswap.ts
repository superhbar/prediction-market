import type { Address } from "viem";

/**
 * SaucerSwap V1 (constant-product AMM) on Hedera. Position tokens are plain HTS tokens, so anyone can open a
 * YES/HBAR or NO/HBAR pool and trade a position before the market settles. The market contract is unchanged:
 * pools only move tokens between holders, and whoever holds a token at settlement redeems it.
 *
 * Measured on testnet (docs/hedera-notes.md): opening a pool costs the factory's pairCreateFee ($2, paid in HBAR
 * at the exchange-rate precompile's rate) and about 6.8M gas; a buy about 0.18M gas, a sell about 0.87M.
 */
export type SaucerSwapDeployment = {
  router: Address;
  factory: Address;
  /** The WHBAR HTS token used in pair paths. The router's WHBAR() returns the wrapper contract, not this. */
  whbarToken: Address;
};

/** From https://docs.saucerswap.finance/developerx/contract-deployments (V1 RouterV3, Factory, WHBAR token). */
export const SAUCERSWAP: Partial<Record<number, SaucerSwapDeployment>> = {
  // Hedera testnet: router 0.0.19264, factory 0.0.9959, WHBAR token 0.0.15058.
  296: {
    router: "0x0000000000000000000000000000000000004b40",
    factory: "0x00000000000000000000000000000000000026e7",
    whbarToken: "0x0000000000000000000000000000000000003ad2",
  },
};

/** Hedera exchange-rate system contract, used to price the pool fee in tinybar. */
export const EXCHANGE_RATE_PRECOMPILE: Address = "0x0000000000000000000000000000000000000168";

/** Default slippage for swaps, in basis points. */
export const DEFAULT_SLIPPAGE_BPS = 100n;

/** Seconds a signed swap stays valid. */
export const SWAP_DEADLINE_SECONDS = 600n;

/** Pool reserves oriented as HBAR and position token, both in 8-decimal base units. */
export type PoolReserves = { hbar: bigint; token: bigint };

/** Orients a pair's reserves: token0/token1 order depends on addresses, not on which side is HBAR. */
export function orientReserves(token0: Address, reserve0: bigint, reserve1: bigint, whbarToken: Address): PoolReserves {
  return token0.toLowerCase() === whbarToken.toLowerCase()
    ? { hbar: reserve0, token: reserve1 }
    : { hbar: reserve1, token: reserve0 };
}

/**
 * Marginal pool price of one whole position token (1e8 base units) in tinybar, before fees and price impact.
 * Display only: swaps always use the router's getAmountsOut quote.
 */
export function spotPrice(reserves: PoolReserves): bigint | undefined {
  if (reserves.hbar === 0n || reserves.token === 0n) return undefined;
  return (reserves.hbar * 100_000_000n) / reserves.token;
}

/** Minimum acceptable output for a quote, e.g. 1% slippage keeps 99% of the quoted amount. */
export function minimumOut(quoted: bigint, slippageBps: bigint = DEFAULT_SLIPPAGE_BPS): bigint {
  if (quoted <= 0n) return 0n;
  return (quoted * (10_000n - slippageBps)) / 10_000n;
}

export const saucerFactoryAbi = [
  {
    type: "function",
    name: "getPair",
    inputs: [
      { name: "tokenA", type: "address" },
      { name: "tokenB", type: "address" },
    ],
    outputs: [{ name: "pair", type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "pairCreateFee",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
] as const;

export const saucerPairAbi = [
  {
    type: "function",
    name: "token0",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getReserves",
    inputs: [],
    outputs: [
      { name: "reserve0", type: "uint112" },
      { name: "reserve1", type: "uint112" },
      { name: "blockTimestampLast", type: "uint32" },
    ],
    stateMutability: "view",
  },
] as const;

export const saucerRouterAbi = [
  {
    type: "function",
    name: "getAmountsOut",
    inputs: [
      { name: "amountIn", type: "uint256" },
      { name: "path", type: "address[]" },
    ],
    outputs: [{ name: "amounts", type: "uint256[]" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "swapExactETHForTokens",
    inputs: [
      { name: "amountOutMin", type: "uint256" },
      { name: "path", type: "address[]" },
      { name: "to", type: "address" },
      { name: "deadline", type: "uint256" },
    ],
    outputs: [{ name: "amounts", type: "uint256[]" }],
    stateMutability: "payable",
  },
  {
    type: "function",
    name: "swapExactTokensForETH",
    inputs: [
      { name: "amountIn", type: "uint256" },
      { name: "amountOutMin", type: "uint256" },
      { name: "path", type: "address[]" },
      { name: "to", type: "address" },
      { name: "deadline", type: "uint256" },
    ],
    outputs: [{ name: "amounts", type: "uint256[]" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "addLiquidityETHNewPool",
    inputs: [
      { name: "token", type: "address" },
      { name: "amountTokenDesired", type: "uint256" },
      { name: "amountTokenMin", type: "uint256" },
      { name: "amountETHMin", type: "uint256" },
      { name: "to", type: "address" },
      { name: "deadline", type: "uint256" },
    ],
    outputs: [
      { name: "amountToken", type: "uint256" },
      { name: "amountETH", type: "uint256" },
      { name: "liquidity", type: "uint256" },
    ],
    stateMutability: "payable",
  },
] as const;

/** The precompile's tinycentsToTinybars is not marked view, but it only reads the rate, so eth_call works. */
export const exchangeRateAbi = [
  {
    type: "function",
    name: "tinycentsToTinybars",
    inputs: [{ name: "tinycents", type: "uint256" }],
    outputs: [{ name: "tinybars", type: "uint256" }],
    stateMutability: "view",
  },
] as const;

/** ERC-20 allowance and approve on an HTS token (HIP-218 facade). */
export const erc20ApproveAbi = [
  {
    type: "function",
    name: "allowance",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "approve",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
  },
] as const;

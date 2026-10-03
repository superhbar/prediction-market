import { formatUnits, parseEther, parseUnits } from "viem";

/**
 * Unit conversions for the prediction market frontend.
 *
 * Wallets and JSON-RPC use weibar (18 decimals). The PredictionMarkets
 * contract sees tinybar (8 decimals): `msg.value` inside the EVM is already
 * tinybar, and every amount the contract returns (pools, reserve,
 * quotePayout, token balances) is tinybar. Prices (strike,
 * settlementPrice) are 1e18 fixed point. All conversions live here.
 */

/** Tinybar decimals: every contract amount is in units of 1e-8 HBAR. */
export const TINYBAR_DECIMALS = 8;

/** Fixed-point decimals for strike and settlement prices. */
export const PRICE_DECIMALS = 18;

/** Explicit gas limits: Hashio estimation is unreliable for HTS/HSS calls. */
export const GAS = {
  createMarket: 3_000_000,
  stake: 1_500_000,
  settle: 1_000_000,
  settleWithPyth: 1_000_000,
  redeem: 800_000,
  voidMarket: 300_000,
  withdrawReserve: 300_000,
  /** Unmeasured: HIP-719 associate() on a position token. */
  associate: 300_000,
  /** SaucerSwap V1, measured on testnet: opening a pool used 6.79M (3.2M from SaucerSwap's docs runs out). */
  openPool: 8_000_000,
  /**
   * Measured 0.18M for HBAR to position token into an associated account. A buyer's first transfer of a token
   * auto-associates it (about 0.75M, as for a first stake), so buys get the stake limit.
   */
  swapBuy: 1_500_000,
  /** Measured 0.87M for position token to HBAR (unwraps WHBAR). */
  swapSell: 1_200_000,
  /** ERC-20 approve on an HTS token for the SaucerSwap router. */
  approve: 1_000_000,
} as const;

/** Tinybar amount to a human HBAR string, e.g. 123456789n -> "1.23456789". */
export function tinybarToHbar(amount: bigint): string {
  return formatUnits(amount, TINYBAR_DECIMALS);
}

/** Tinybar amount to HBAR trimmed to 4 decimals for display, e.g. "1.2345 HBAR". */
export function formatHbar(amount: bigint): string {
  const hbar = Number(formatUnits(amount, TINYBAR_DECIMALS));
  return `${hbar.toLocaleString("en-US", { maximumFractionDigits: 4 })} HBAR`;
}

/** Human HBAR string to tinybar, e.g. "1.5" -> 150000000n. */
export function hbarToTinybar(hbar: string): bigint {
  return parseUnits(hbar.trim() === "" ? "0" : hbar.trim(), TINYBAR_DECIMALS);
}

/** Human HBAR string to weibar for transaction `value`, e.g. "1.5" -> 1500000000000000000n. */
export function hbarToWeibar(hbar: string): bigint {
  return parseEther(hbar.trim() === "" ? "0" : hbar.trim());
}

/** Tinybar amount to weibar for comparison with wallet values. */
export function tinybarToWeibar(amount: bigint): bigint {
  return amount * 10n ** 10n;
}

/** 1e18 fixed-point price to a human decimal string, e.g. strike -> "0.30". */
export function priceToDecimal(price: bigint): string {
  return formatUnits(price, PRICE_DECIMALS);
}

/**
 * Rounds a 1e18 fixed-point price to a readable default strike: 4 decimals under $1,
 * 2 decimals under $1,000 and whole dollars above, e.g. 0.09962643 -> "0.0996".
 */
export function suggestStrike(price: bigint): string {
  const one = 10n ** BigInt(PRICE_DECIMALS);
  const decimals = price < one ? 4 : price < 1000n * one ? 2 : 0;
  const step = 10n ** BigInt(PRICE_DECIMALS - decimals);
  return priceToDecimal(((price + step / 2n) / step) * step);
}

/**
 * 1e18 fixed-point price to a USD string: 4 decimals under $1, 2 under $10,000, whole dollars above,
 * e.g. "$0.3000", "$2,657.85", "$90,000".
 */
export function formatPrice(price: bigint): string {
  const value = Number(formatUnits(price, PRICE_DECIMALS));
  const abs = Math.abs(value);
  const digits = abs < 1 ? 4 : abs < 10_000 ? 2 : 0;
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

/**
 * 1e18 fixed-point price to a USD string with every significant digit kept, padded to the same minimum
 * decimals as formatPrice: "$0.1000", "$0.100049", "$90,000". Use it wherever a price decides an outcome
 * (strikes, settlement prices), so a rounded label never contradicts the result.
 */
export function formatExactPrice(price: bigint): string {
  const negative = price < 0n;
  const [whole, fraction = ""] = formatUnits(negative ? -price : price, PRICE_DECIMALS).split(".");
  const value = Number(whole);
  const minDigits = value < 1 ? 4 : value < 10_000 ? 2 : 0;
  const digits = fraction.length > minDigits ? fraction : fraction.padEnd(minDigits, "0");
  const grouped = BigInt(whole).toLocaleString("en-US");
  return `${negative ? "-" : ""}$${grouped}${digits ? `.${digits}` : ""}`;
}

/**
 * What a new stake would pay if its side wins and nobody else stakes: the whole pool, including this
 * stake, shared pro rata over the winning side. All amounts are tinybar.
 */
export function projectedPayout(stake: bigint, sidePool: bigint, otherPool: bigint): bigint {
  if (stake <= 0n) return 0n;
  return (stake * (sidePool + otherPool + stake)) / (sidePool + stake);
}

/**
 * What one token of a side pays if that side wins, as a multiple of 1 HBAR in basis points (16000 = 1.6x):
 * (yesPool + noPool) / sidePool, the same formula as quotePayout. Undefined while the side has no stake.
 */
export function payoutMultipleBps(sidePool: bigint, otherPool: bigint): bigint | undefined {
  if (sidePool <= 0n) return undefined;
  return ((sidePool + otherPool) * 10_000n) / sidePool;
}

/** "1.60x" from a basis-point multiple. */
export function formatMultiple(bps: bigint): string {
  return `${(Number(bps) / 10_000).toFixed(2)}x`;
}

/**
 * The chance a token's market price implies, in basis points: its price over what it pays if its side wins.
 * A winning token pays (yesPool + noPool) / sidePool, the same formula as quotePayout. Display only, and an
 * estimate until expiry because later stakes change the pools. Undefined while the side has no stake.
 */
export function impliedChanceBps(priceTinybar: bigint, sidePool: bigint, otherPool: bigint): bigint | undefined {
  if (sidePool <= 0n) return undefined;
  return (priceTinybar * sidePool * 10_000n) / (100_000_000n * (sidePool + otherPool));
}

/** Human decimal price string to 1e18 fixed point for createMarket strike. */
export function decimalToPrice(decimal: string): bigint {
  return parseUnits(decimal.trim() === "" ? "0" : decimal.trim(), PRICE_DECIMALS);
}

/** YES share of the total pool as a percentage 0-100. Empty pools read 50/50. */
export function yesPercent(yesPool: bigint, noPool: bigint): number {
  const total = yesPool + noPool;
  if (total === 0n) return 50;
  return Number((yesPool * 10_000n) / total) / 100;
}

/** True when the string is a positive decimal number suitable for an HBAR or price input. */
export function isPositiveDecimal(value: string): boolean {
  return /^\d+(\.\d+)?$/.test(value.trim()) && Number(value) > 0;
}

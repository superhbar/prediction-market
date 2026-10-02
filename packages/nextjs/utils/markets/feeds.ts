import { hexToString, stringToHex } from "viem";

/** Feed keys registered on the PredictionMarkets contract. */
export const FEED_KEYS = ["HBAR/USD", "BTC/USD", "ETH/USD"] as const;

export type FeedKey = (typeof FEED_KEYS)[number];

/** Human feed key to the bytes32 value the contract expects. */
export function feedKeyToBytes32(key: string): `0x${string}` {
  return stringToHex(key, { size: 32 });
}

/** Contract bytes32 feed key back to its human string. */
export function bytes32ToFeedKey(value: `0x${string}`): string {
  return hexToString(value, { size: 32 });
}

/** True for the three feeds the contract was deployed with. */
export function isKnownFeedKey(key: string): key is FeedKey {
  return (FEED_KEYS as readonly string[]).includes(key);
}

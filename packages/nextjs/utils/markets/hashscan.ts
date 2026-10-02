import { hedera, hederaTestnet } from "viem/chains";

export const TESTNET_MIRROR = "https://testnet.mirrornode.hedera.com";
export const MAINNET_MIRROR = "https://mainnet.mirrornode.hedera.com";

/** Mirror node base URL for a chain id. Defaults to testnet. */
export function mirrorBaseForChain(chainId: number): string {
  if (chainId === hedera.id) return MAINNET_MIRROR;
  if (chainId === hederaTestnet.id) return TESTNET_MIRROR;
  return TESTNET_MIRROR;
}

/** True for long-zero EVM addresses (0x000...0<num>) used by HTS tokens, contracts and schedules. */
export function isLongZeroAddress(address: string): boolean {
  return /^0x0{32}[0-9a-fA-F]{1,8}$/.test(address);
}

/** Long-zero EVM address to Hedera entity id, e.g. 0x...01234 -> "0.0.4660". Null when not long-zero. */
export function longZeroToEntityId(address: string): string | null {
  if (!isLongZeroAddress(address)) return null;
  return `0.0.${BigInt(address).toString()}`;
}

/** Hedera entity id to its long-zero EVM address, e.g. "0.0.4660" -> 0x...01234. */
export function entityIdToLongZero(entityId: string): `0x${string}` {
  const parts = entityId.split(".");
  const num = BigInt(parts[parts.length - 1] ?? "0");
  return `0x${num.toString(16).padStart(40, "0")}`;
}

export type HashscanKind = "contract" | "token" | "schedule" | "transaction" | "account";

/** Hashscan URL for an entity. Pass the 0.0.x id; long-zero addresses are converted. */
export function hashscanLink(chainId: number, kind: HashscanKind, idOrAddress: string): string {
  const network = chainId === hedera.id ? "mainnet" : "testnet";
  const id = idOrAddress.startsWith("0x") ? (longZeroToEntityId(idOrAddress) ?? idOrAddress) : idOrAddress;
  return `https://hashscan.io/${network}/${kind}/${id}`;
}

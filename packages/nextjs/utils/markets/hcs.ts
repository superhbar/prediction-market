import { mirrorBaseForChain } from "./hashscan";
import type { MirrorTopicMessage } from "./record";
import { AccountId, Client, PrivateKey } from "@hashgraph/sdk";
import { hedera } from "viem/chains";

/** Server-only HCS settings. The topic alone enables reading; publishing also needs the operator. */
export function hcsSettings() {
  const topicId = process.env.HCS_RECORD_TOPIC_ID || undefined;
  const operatorId = process.env.HEDERA_OPERATOR_ID || undefined;
  const operatorKey = process.env.HEDERA_OPERATOR_KEY || undefined;
  return { topicId, canPublish: !!topicId && !!operatorId && !!operatorKey, operatorId, operatorKey };
}

/** Parses an operator key: hex is taken as ECDSA (the key type EVM wallets use), anything else as DER. */
export function parseOperatorKey(key: string): PrivateKey {
  const hex = key.startsWith("0x") ? key.slice(2) : key;
  return /^[0-9a-fA-F]{64}$/.test(hex) ? PrivateKey.fromStringECDSA(hex) : PrivateKey.fromStringDer(key);
}

/** An SDK client for the chain, paying with the operator account. */
export function operatorClient(chainId: number, operatorId: string, operatorKey: string): Client {
  const client = chainId === hedera.id ? Client.forMainnet() : Client.forTestnet();
  return client.setOperator(AccountId.fromString(operatorId), parseOperatorKey(operatorKey));
}

/**
 * Reads a topic's messages from the mirror node, oldest first, following pagination up to `maxPages`.
 * `complete` is false when the topic has more messages than were read, so "no record found" is not proof.
 */
export async function fetchTopicMessages(
  chainId: number,
  topicId: string,
  maxPages = 50,
): Promise<{ messages: MirrorTopicMessage[]; complete: boolean }> {
  const base = mirrorBaseForChain(chainId);
  const messages: MirrorTopicMessage[] = [];
  let path: string | null = `/api/v1/topics/${topicId}/messages?limit=100&order=asc`;
  for (let page = 0; path && page < maxPages; page++) {
    const response = await fetch(`${base}${path}`, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
    if (response.status === 404) return { messages, complete: true };
    if (!response.ok) throw new Error(`Mirror node request failed: ${response.status}`);
    const data = (await response.json()) as { messages?: MirrorTopicMessage[]; links?: { next?: string | null } };
    messages.push(...(data.messages ?? []));
    path = data.links?.next ?? null;
  }
  return { messages, complete: path === null };
}

import { marketToJson } from "./marketJson";
import type { StatusConfig } from "./status";
import { type Market, MarketState } from "./types";

/** Format tag on every record, so readers can skip other messages on a shared topic. */
export const RECORD_APP = "predera";
export const RECORD_VERSION = 1;

/** A closed market's terms and result, as published to the HCS record topic. Compact enough for one message. */
export type SettlementRecord = {
  app: typeof RECORD_APP;
  v: typeof RECORD_VERSION;
  chainId: number;
  contract: string;
  marketId: number;
  question: string;
  feed: string;
  strikeUsd: string;
  expiry: string;
  state: string;
  outcome: string;
  pools: { yes: string; no: string };
  settlement: { source: string; priceUsd: string; publishedAt: string } | null;
};

/** A record as read back from the mirror node, with where consensus placed it. */
export type PublishedRecord = { record: SettlementRecord; sequenceNumber: number; consensusTimestamp: string };

/** Mirror node topic message shape (only the fields used here). */
export type MirrorTopicMessage = { message: string; sequence_number: number; consensus_timestamp: string };

/** True once a market can no longer change, which is the only time it is worth recording. */
export function isRecordable(market: Market): boolean {
  return market.state === MarketState.Settled || market.state === MarketState.Voided;
}

/** Builds the record for a closed market from the same JSON view the read API serves. */
export function buildRecord(
  chainId: number,
  contract: string,
  marketId: number,
  market: Market,
  nowSec: bigint,
  config: StatusConfig,
): SettlementRecord {
  const json = marketToJson(marketId, market, nowSec, config);
  return {
    app: RECORD_APP,
    v: RECORD_VERSION,
    chainId,
    contract: contract.toLowerCase(),
    marketId,
    question: json.question,
    feed: json.feed,
    strikeUsd: json.strikeUsd,
    expiry: json.expiry,
    state: json.state,
    outcome: json.outcome,
    pools: { yes: json.pools.yes.hbar, no: json.pools.no.hbar },
    settlement: json.settlement,
  };
}

/** Decodes one mirror node topic message; null for anything that is not a record in this format. */
export function parseRecordMessage(message: MirrorTopicMessage): PublishedRecord | null {
  try {
    const record = JSON.parse(Buffer.from(message.message, "base64").toString("utf8")) as SettlementRecord;
    if (record?.app !== RECORD_APP || record.v !== RECORD_VERSION || typeof record.marketId !== "number") return null;
    return { record, sequenceNumber: message.sequence_number, consensusTimestamp: message.consensus_timestamp };
  } catch {
    return null;
  }
}

/** The first record for a market on a topic, by consensus order. Later duplicates are ignored. */
export function findRecord(
  messages: MirrorTopicMessage[],
  chainId: number,
  contract: string,
  marketId: number,
): PublishedRecord | null {
  const ordered = [...messages].sort((a, b) => a.sequence_number - b.sequence_number);
  for (const message of ordered) {
    const published = parseRecordMessage(message);
    if (
      published &&
      published.record.chainId === chainId &&
      published.record.contract === contract.toLowerCase() &&
      published.record.marketId === marketId
    ) {
      return published;
    }
  }
  return null;
}

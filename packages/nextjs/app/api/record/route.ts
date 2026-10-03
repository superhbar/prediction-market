import { NextResponse } from "next/server";
import { TopicMessageSubmitTransaction } from "@hashgraph/sdk";
import { fetchTopicMessages, hcsSettings, operatorClient } from "~~/utils/markets/hcs";
import { type SettlementRecord, buildRecord, findRecord, isRecordable } from "~~/utils/markets/record";
import { readMarkets } from "~~/utils/markets/serverReads";

type Published = { record: SettlementRecord; sequenceNumber: number; transactionId: string };

/**
 * Publishes started or finished by this server instance, by chain, contract and market. Concurrent requests for one
 * market share a single submission, and a finished one answers repeat requests before the mirror node indexes
 * it. Separate instances can still both publish; readers take the first record by sequence number, so a
 * duplicate costs one message fee and changes nothing.
 */
const publishes = new Map<string, Promise<Published>>();

/** Reads `?marketId=` from a request, or null when it is not a non-negative integer. */
function marketIdOf(value: string | null | undefined): number | null {
  const id = Number(value);
  return value !== null && value !== undefined && value !== "" && Number.isInteger(id) && id >= 0 ? id : null;
}

/**
 * The settlement record of a market on the HCS record topic, if any.
 * GET /api/record?marketId=0 -> { enabled, topicId, canPublish, record: { record, sequenceNumber, consensusTimestamp } | null }
 * Without HCS_RECORD_TOPIC_ID it answers { enabled: false } and the app works as before.
 */
export async function GET(request: Request) {
  const { topicId, canPublish } = hcsSettings();
  if (!topicId) return NextResponse.json({ enabled: false });
  const marketId = marketIdOf(new URL(request.url).searchParams.get("marketId"));
  if (marketId === null)
    return NextResponse.json({ error: "marketId must be a non-negative integer." }, { status: 400 });
  try {
    const { chainId, contract } = await readMarkets(() => []);
    const { messages } = await fetchTopicMessages(chainId, topicId);
    const record = findRecord(messages, chainId, contract, marketId);
    return NextResponse.json({ enabled: true, topicId, canPublish, record });
  } catch {
    return NextResponse.json({ error: "Could not read the record topic." }, { status: 502 });
  }
}

/**
 * Publishes a closed market's record to the topic, once. Anyone may ask; the server checks the market on chain,
 * skips markets that already have a record, and pays with its operator account. The topic's submit key is the
 * operator's, so only this server can write to it.
 * POST /api/record { marketId } -> { record, created }
 */
export async function POST(request: Request) {
  const { topicId, canPublish, operatorId, operatorKey } = hcsSettings();
  if (!topicId || !canPublish || !operatorId || !operatorKey) {
    return NextResponse.json({ error: "Publishing records is not configured on this server." }, { status: 501 });
  }
  const body = (await request.json().catch(() => ({}))) as { marketId?: unknown };
  const marketId = marketIdOf(body.marketId === undefined ? null : String(body.marketId));
  if (marketId === null)
    return NextResponse.json({ error: "marketId must be a non-negative integer." }, { status: 400 });

  try {
    const { chainId, contract, config, markets } = await readMarkets(() => [marketId]);
    if (markets.length === 0)
      return NextResponse.json({ error: `Market ${marketId} does not exist.` }, { status: 404 });
    const market = markets[0].market;
    if (!isRecordable(market)) {
      return NextResponse.json({ error: "Only settled or voided markets are recorded." }, { status: 409 });
    }
    const key = `${chainId}:${contract.toLowerCase()}:${marketId}`;
    const pending = publishes.get(key);
    if (pending) return NextResponse.json({ record: await pending, created: false });

    const { messages, complete } = await fetchTopicMessages(chainId, topicId);
    const existing = findRecord(messages, chainId, contract, marketId);
    if (existing) return NextResponse.json({ record: existing, created: false });
    // Not finding a record in a partly read topic proves nothing, so do not pay for a possible duplicate.
    if (!complete) {
      return NextResponse.json(
        { error: "The record topic is too long to check for an existing record." },
        { status: 503 },
      );
    }

    const record = buildRecord(chainId, contract, marketId, market, BigInt(Math.floor(Date.now() / 1000)), config);
    const publish = submit(chainId, topicId, operatorId, operatorKey, JSON.stringify(record)).then(sent => ({
      record,
      ...sent,
    }));
    publishes.set(key, publish);
    // A failed submission must not block a later retry.
    publish.catch(() => publishes.delete(key));
    return NextResponse.json({ record: await publish, created: true });
  } catch {
    return NextResponse.json({ error: "Could not publish the record." }, { status: 502 });
  }
}

/** Submits one message to the topic, paid by the operator, and waits for its receipt. */
async function submit(chainId: number, topicId: string, operatorId: string, operatorKey: string, message: string) {
  const client = operatorClient(chainId, operatorId, operatorKey);
  try {
    const response = await new TopicMessageSubmitTransaction().setTopicId(topicId).setMessage(message).execute(client);
    const receipt = await response.getReceipt(client);
    return { sequenceNumber: Number(receipt.topicSequenceNumber), transactionId: response.transactionId.toString() };
  } finally {
    client.close();
  }
}

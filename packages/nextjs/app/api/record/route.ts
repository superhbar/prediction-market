import { NextResponse } from "next/server";
import { TopicMessageSubmitTransaction } from "@hashgraph/sdk";
import { fetchTopicMessages, hcsSettings, operatorClient } from "~~/utils/markets/hcs";
import { buildRecord, findRecord, isRecordable } from "~~/utils/markets/record";
import { readMarkets } from "~~/utils/markets/serverReads";

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
    const record = findRecord(await fetchTopicMessages(chainId, topicId), chainId, contract, marketId);
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

  let client;
  try {
    const { chainId, contract, config, markets } = await readMarkets(() => [marketId]);
    if (markets.length === 0)
      return NextResponse.json({ error: `Market ${marketId} does not exist.` }, { status: 404 });
    const market = markets[0].market;
    if (!isRecordable(market)) {
      return NextResponse.json({ error: "Only settled or voided markets are recorded." }, { status: 409 });
    }
    const existing = findRecord(await fetchTopicMessages(chainId, topicId), chainId, contract, marketId);
    if (existing) return NextResponse.json({ record: existing, created: false });

    const record = buildRecord(chainId, contract, marketId, market, BigInt(Math.floor(Date.now() / 1000)), config);
    client = operatorClient(chainId, operatorId, operatorKey);
    const response = await new TopicMessageSubmitTransaction()
      .setTopicId(topicId)
      .setMessage(JSON.stringify(record))
      .execute(client);
    const receipt = await response.getReceipt(client);
    return NextResponse.json({
      record: {
        record,
        sequenceNumber: Number(receipt.topicSequenceNumber),
        transactionId: response.transactionId.toString(),
      },
      created: true,
    });
  } catch {
    return NextResponse.json({ error: "Could not publish the record." }, { status: 502 });
  } finally {
    client?.close();
  }
}

import { feedKeyToBytes32 } from "./feeds";
import { type MirrorTopicMessage, buildRecord, findRecord, isRecordable, parseRecordMessage } from "./record";
import type { Market } from "./types";
import { describe, expect, it } from "vitest";

const CONTRACT = "0x2528B83f1B73780a226838039376cc1435b5F289";
const config = { settlementDelay: 600n, gracePeriod: 86_400n, maxRetries: 4, maxRoundLag: 7_200n };
const settled: Market = {
  feedKey: feedKeyToBytes32("HBAR/USD"),
  strike: 100000000000000000n,
  expiry: 1_791_020_000n,
  creator: "0x0000000000000000000000000000000000000001",
  yesToken: "0x0000000000000000000000000000000000000002",
  noToken: "0x0000000000000000000000000000000000000003",
  yesPool: 500_000_000n,
  noPool: 300_000_000n,
  reserve: 0n,
  state: 1,
  outcome: 1,
  source: 1,
  settlementPrice: 101125530000000000n,
  settlementTime: 1_791_021_960n,
  retriesLeft: 2,
  schedule: "0x0000000000000000000000000000000000000004",
  schedulePending: false,
};

function asMessage(value: unknown, sequence: number): MirrorTopicMessage {
  return {
    message: Buffer.from(JSON.stringify(value)).toString("base64"),
    sequence_number: sequence,
    consensus_timestamp: `1791030000.00000000${sequence}`,
  };
}

describe("settlement records", () => {
  const record = buildRecord(296, CONTRACT, 0, settled, 1_791_030_000n, config);

  it("captures the terms and the result in one small message", () => {
    expect(record).toMatchObject({
      app: "predera",
      v: 1,
      contract: CONTRACT.toLowerCase(),
      marketId: 0,
      outcome: "Yes",
      pools: { yes: "5", no: "3" },
      settlement: { source: "Chainlink", priceUsd: "0.10112553" },
    });
    expect(JSON.stringify(record).length).toBeLessThan(1024);
  });

  it("is only recorded once the market is closed", () => {
    expect(isRecordable(settled)).toBe(true);
    expect(isRecordable({ ...settled, state: 0 })).toBe(false);
  });

  it("finds the first record for a market and ignores other messages", () => {
    const messages = [
      asMessage({ hello: "world" }, 1),
      asMessage({ ...record, marketId: 7 }, 2),
      asMessage(record, 3),
      asMessage({ ...record, outcome: "No" }, 4),
      { message: "not base64 json", sequence_number: 5, consensus_timestamp: "1" },
    ];
    const found = findRecord(messages, 296, CONTRACT, 0);
    expect(found?.sequenceNumber).toBe(3);
    expect(found?.record.outcome).toBe("Yes");
    expect(findRecord(messages, 296, CONTRACT, 1)).toBeNull();
    expect(findRecord(messages, 295, CONTRACT, 0)).toBeNull();
  });

  it("rejects messages from other apps or versions", () => {
    expect(parseRecordMessage(asMessage({ ...record, app: "other" }, 1))).toBeNull();
    expect(parseRecordMessage(asMessage({ ...record, v: 2 }, 1))).toBeNull();
  });
});

import { feedKeyToBytes32 } from "./feeds";
import { marketToJson } from "./marketJson";
import type { Market } from "./types";
import { describe, expect, it } from "vitest";

const config = { settlementDelay: 600n, gracePeriod: 86_400n, maxRetries: 4 };

const settledYes: Market = {
  feedKey: feedKeyToBytes32("HBAR/USD"),
  strike: 100000000000000000n,
  expiry: 1_791_020_000n,
  creator: "0x0000000000000000000000000000000000000001",
  yesToken: "0x0000000000000000000000000000000000000002",
  noToken: "0x0000000000000000000000000000000000000003",
  yesPool: 500_000_000n,
  noPool: 300_000_000n,
  reserve: 750_000_000n,
  state: 1,
  outcome: 1,
  source: 1,
  settlementPrice: 100621650000000000n,
  settlementTime: 1_791_021_960n,
  retriesLeft: 2,
  schedule: "0x0000000000000000000000000000000000000004",
  schedulePending: false,
};

describe("marketToJson", () => {
  it("names states, keeps exact tinybar and converts prices to decimal USD", () => {
    const json = marketToJson(0, settledYes, 1_791_030_000n, config);
    expect(json.feed).toBe("HBAR/USD");
    expect(json.state).toBe("Settled");
    expect(json.status).toBe("settled");
    expect(json.outcome).toBe("Yes");
    expect(json.strikeUsd).toBe("0.1");
    expect(json.pools.yes).toEqual({ tinybar: "500000000", hbar: "5" });
    expect(json.pools.no).toEqual({ tinybar: "300000000", hbar: "3" });
    expect(json.settlement).toEqual({
      source: "Chainlink",
      priceUsd: "0.10062165",
      publishedAt: "2026-10-03T10:06:00.000Z",
    });
    expect(json.refundsAtPar).toBe(false);
  });

  it("has no settlement block while open and flags voided markets as refunds", () => {
    const open = marketToJson(1, { ...settledYes, state: 0, outcome: 0, source: 0 }, 1_791_000_000n, config);
    expect(open.status).toBe("open");
    expect(open.settlement).toBeNull();
    const voided = marketToJson(2, { ...settledYes, state: 2, outcome: 3, source: 0 }, 1_791_200_000n, config);
    expect(voided.state).toBe("Voided");
    expect(voided.refundsAtPar).toBe(true);
    expect(voided.settlement).toBeNull();
  });
});

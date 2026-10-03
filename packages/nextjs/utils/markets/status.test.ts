import { deriveStatus, isRefund, matchesFilter, resolutionLabel, statusLabel } from "./status";
import type { Market, MarketConfig } from "./types";
import { describe, expect, it } from "vitest";

const config: Pick<MarketConfig, "settlementDelay" | "gracePeriod" | "maxRetries" | "maxRoundLag"> = {
  settlementDelay: 60n,
  gracePeriod: 86_400n,
  maxRetries: 2,
  maxRoundLag: 7_200n,
};

function market(overrides: Partial<Market>): Market {
  return {
    feedKey: "0x484241522f55534400000000000000000000000000000000000000000000000000",
    strike: 300000000000000000n,
    expiry: 1_000_000n,
    creator: "0x0000000000000000000000000000000000000001",
    yesToken: "0x0000000000000000000000000000000000000002",
    noToken: "0x0000000000000000000000000000000000000003",
    yesPool: 0n,
    noPool: 0n,
    reserve: 0n,
    state: 0,
    outcome: 0,
    source: 0,
    settlementPrice: 0n,
    settlementTime: 0n,
    retriesLeft: 2,
    schedule: "0x0000000000000000000000000000000000000004",
    schedulePending: true,
    ...overrides,
  };
}

describe("deriveStatus", () => {
  it("reports open before expiry", () => {
    expect(deriveStatus(market({}), 999_000n, config)).toBe("open");
  });

  it("reports awaiting-settlement right after expiry", () => {
    expect(deriveStatus(market({}), 1_000_010n, config)).toBe("awaiting-settlement");
  });

  it("reports settle-available after the settlement delay", () => {
    expect(deriveStatus(market({}), 1_000_061n, config)).toBe("settle-available");
  });

  it("reports retrying once a retry was booked", () => {
    expect(deriveStatus(market({ retriesLeft: 1 }), 1_000_061n, config)).toBe("retrying");
  });

  it("stops reporting retrying once the last scheduled call has run", () => {
    expect(deriveStatus(market({ retriesLeft: 0, schedulePending: false }), 1_000_061n, config)).toBe(
      "settle-available",
    );
  });

  it("trusts the contract's round answer over timing when the caller has it", () => {
    const idle = market({ retriesLeft: 0, schedulePending: false });
    expect(deriveStatus(idle, 1_000_061n, config, true)).toBe("settle-available");
    expect(deriveStatus(idle, 1_000_061n, config, false)).toBe("awaiting-settlement");
  });

  it("reports no-price once the round window has passed without an eligible round", () => {
    const idle = market({ retriesLeft: 0, schedulePending: false });
    expect(deriveStatus(idle, 1_007_200n, config, false)).toBe("no-price");
    // Without the contract's answer (list, API) a round inside the window may still exist, so settle stays open.
    expect(deriveStatus(idle, 1_007_200n, config)).toBe("settle-available");
    // A round published inside the window can still be settled by hand after it closes.
    expect(deriveStatus(idle, 1_007_200n, config, true)).toBe("settle-available");
  });

  it("reports voidable after the grace period", () => {
    expect(deriveStatus(market({}), 1_086_401n, config)).toBe("voidable");
  });

  it("reports settled and voided terminal states", () => {
    expect(deriveStatus(market({ state: 1, outcome: 1 }), 999_000n, config)).toBe("settled");
    expect(deriveStatus(market({ state: 2 }), 999_000n, config)).toBe("voided");
  });
});

describe("matchesFilter", () => {
  it("buckets statuses into list filters", () => {
    expect(matchesFilter("open", "open")).toBe(true);
    expect(matchesFilter("retrying", "awaiting")).toBe(true);
    expect(matchesFilter("voidable", "awaiting")).toBe(true);
    expect(matchesFilter("no-price", "awaiting")).toBe(true);
    expect(matchesFilter("settled", "settled")).toBe(true);
    expect(matchesFilter("voided", "voided")).toBe(true);
    expect(matchesFilter("open", "settled")).toBe(false);
    expect(matchesFilter("open", "all")).toBe(true);
  });
});

describe("statusLabel", () => {
  it("labels every status", () => {
    expect(statusLabel("settle-available")).toBe("Settle available");
    expect(statusLabel("voidable")).toBe("Voidable");
  });
});

describe("refunds", () => {
  it("treats voided and one-sided settled markets as refunds", () => {
    expect(isRefund({ state: 2, outcome: 0 })).toBe(true);
    expect(isRefund({ state: 1, outcome: 3 })).toBe(true);
    expect(isRefund({ state: 1, outcome: 2 })).toBe(false);
    expect(isRefund({ state: 0, outcome: 0 })).toBe(false);
  });

  it("labels each resolution", () => {
    expect(resolutionLabel({ state: 1, outcome: 1 })).toBe("Resolved YES");
    expect(resolutionLabel({ state: 1, outcome: 2 })).toBe("Resolved NO");
    expect(resolutionLabel({ state: 1, outcome: 3 })).toBe("Refunded");
    expect(resolutionLabel({ state: 2, outcome: 0 })).toBe("Voided");
  });
});

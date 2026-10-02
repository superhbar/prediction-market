import {
  entityIdToLongZero,
  hashscanLink,
  isLongZeroAddress,
  longZeroToEntityId,
  mirrorBaseForChain,
} from "./hashscan";
import { describe, expect, it } from "vitest";

describe("long-zero addresses", () => {
  it("detects long-zero addresses", () => {
    expect(isLongZeroAddress("0x00000000000000000000000000000000000012d5")).toBe(true);
    expect(isLongZeroAddress("0xd0aa5107acd974600a0210474ed893293b639028")).toBe(false);
  });

  it("converts long-zero to entity ids", () => {
    expect(longZeroToEntityId("0x00000000000000000000000000000000000012d5")).toBe("0.0.4821");
    expect(longZeroToEntityId("0xd0aa5107acd974600a0210474ed893293b639028")).toBeNull();
  });

  it("converts entity ids to long-zero", () => {
    expect(entityIdToLongZero("0.0.4821")).toBe("0x00000000000000000000000000000000000012d5");
  });
});

describe("links", () => {
  it("builds testnet Hashscan links", () => {
    expect(hashscanLink(296, "token", "0.0.1234")).toBe("https://hashscan.io/testnet/token/0.0.1234");
    expect(hashscanLink(296, "schedule", "0x00000000000000000000000000000000000012d5")).toBe(
      "https://hashscan.io/testnet/schedule/0.0.4821",
    );
  });

  it("picks the mirror base per chain", () => {
    expect(mirrorBaseForChain(296)).toContain("testnet");
    expect(mirrorBaseForChain(295)).toContain("mainnet");
  });
});

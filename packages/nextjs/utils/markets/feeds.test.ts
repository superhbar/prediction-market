import { bytes32ToFeedKey, feedKeyToBytes32, isKnownFeedKey } from "./feeds";
import { describe, expect, it } from "vitest";

describe("feed key conversions", () => {
  it("round-trips feed keys through bytes32", () => {
    for (const key of ["HBAR/USD", "BTC/USD", "ETH/USD"]) {
      expect(bytes32ToFeedKey(feedKeyToBytes32(key))).toBe(key);
    }
  });

  it("pads to 32 bytes", () => {
    expect(feedKeyToBytes32("HBAR/USD")).toHaveLength(66);
  });

  it("recognises the deployed feeds", () => {
    expect(isKnownFeedKey("HBAR/USD")).toBe(true);
    expect(isKnownFeedKey("DOGE/USD")).toBe(false);
  });
});

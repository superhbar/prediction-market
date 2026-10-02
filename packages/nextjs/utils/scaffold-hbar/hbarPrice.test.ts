import { priceFromExchangeRate } from "./hbarPrice";
import { describe, expect, it } from "vitest";

describe("priceFromExchangeRate", () => {
  it("converts the mirror node rate to USD per HBAR", () => {
    // 30000 HBAR = 298683 cents, so 1 HBAR is about $0.0996.
    expect(priceFromExchangeRate({ current_rate: { cent_equivalent: 298683, hbar_equivalent: 30000 } })).toBeCloseTo(
      0.0996,
      4,
    );
  });

  it("returns 0 for a malformed response", () => {
    expect(priceFromExchangeRate({})).toBe(0);
    expect(priceFromExchangeRate({ current_rate: { cent_equivalent: 5, hbar_equivalent: 0 } })).toBe(0);
  });
});

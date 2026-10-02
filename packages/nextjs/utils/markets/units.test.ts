import {
  decimalToPrice,
  formatHbar,
  formatPrice,
  hbarToTinybar,
  hbarToWeibar,
  isPositiveDecimal,
  priceToDecimal,
  projectedPayout,
  suggestStrike,
  tinybarToHbar,
  tinybarToWeibar,
  yesPercent,
} from "./units";
import { describe, expect, it } from "vitest";

describe("tinybar conversions", () => {
  it("formats tinybar to HBAR", () => {
    expect(tinybarToHbar(123456789n)).toBe("1.23456789");
    expect(tinybarToHbar(0n)).toBe("0");
  });

  it("parses HBAR to tinybar", () => {
    expect(hbarToTinybar("1.5")).toBe(150000000n);
    expect(hbarToTinybar("")).toBe(0n);
  });

  it("converts HBAR to weibar for transaction value", () => {
    expect(hbarToWeibar("1.5")).toBe(1500000000000000000n);
  });

  it("scales tinybar to weibar by 1e10", () => {
    expect(tinybarToWeibar(150000000n)).toBe(1500000000000000000n);
  });

  it("formats HBAR display strings", () => {
    expect(formatHbar(150000000n)).toBe("1.5 HBAR");
  });
});

describe("price conversions", () => {
  it("round-trips 1e18 prices", () => {
    expect(priceToDecimal(300000000000000000n)).toBe("0.3");
    expect(decimalToPrice("0.3")).toBe(300000000000000000n);
  });

  it("suggests a readable strike for each price range", () => {
    expect(suggestStrike(99626430000000000n)).toBe("0.0996");
    expect(suggestStrike(2456789000000000000000n)).toBe("2457");
    expect(suggestStrike(3456789000000000000n)).toBe("3.46");
  });

  it("formats USD prices with precision that fits the price", () => {
    expect(formatPrice(300000000000000000n)).toBe("$0.3000");
    expect(formatPrice(2657850000000000000000n)).toBe("$2,657.85");
    expect(formatPrice(90000000000000000000000n)).toBe("$90,000");
  });

  it("projects a stake's payout from the current pools", () => {
    // 10 HBAR on YES into 12 YES / 8 NO: pool becomes 30, YES side 22, so 10 * 30 / 22.
    expect(projectedPayout(1000000000n, 1200000000n, 800000000n)).toBe(1363636363n);
    // First stake on an empty market gets its own stake back.
    expect(projectedPayout(500000000n, 0n, 0n)).toBe(500000000n);
    expect(projectedPayout(0n, 1n, 1n)).toBe(0n);
  });
});

describe("odds", () => {
  it("computes YES share of the pool", () => {
    expect(yesPercent(6200n, 3800n)).toBe(62);
    expect(yesPercent(0n, 0n)).toBe(50);
  });
});

describe("input validation", () => {
  it("accepts positive decimals only", () => {
    expect(isPositiveDecimal("1.5")).toBe(true);
    expect(isPositiveDecimal("0")).toBe(false);
    expect(isPositiveDecimal("abc")).toBe(false);
    expect(isPositiveDecimal("")).toBe(false);
  });
});

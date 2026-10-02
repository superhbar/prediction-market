import {
  decimalToPrice,
  formatHbar,
  formatPrice,
  hbarToTinybar,
  hbarToWeibar,
  isPositiveDecimal,
  priceToDecimal,
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

  it("formats USD prices with 4 decimals", () => {
    expect(formatPrice(300000000000000000n)).toBe("$0.3000");
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

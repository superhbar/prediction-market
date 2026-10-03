import { priceAge, priceReadState } from "./freshness";
import { describe, expect, it } from "vitest";

describe("oracle publication age", () => {
  it("formats seconds, minutes, hours and days at their boundaries", () => {
    for (const [age, label] of [
      [0n, "0s"],
      [59n, "59s"],
      [60n, "1m"],
      [180n, "3m"],
      [3599n, "59m"],
      [3600n, "1h"],
      [86399n, "23h"],
      [86400n, "1d"],
    ] as const) {
      expect(priceAge(100n, 100n + age)).toBe(`updated ${label} ago`);
    }
  });

  it("clamps future publications instead of displaying a negative age", () => {
    expect(priceAge(101n, 100n)).toBe("updated 0s ago");
  });

  it("does not label a quiet, hours-old feed as a failed refresh", () => {
    expect(priceAge(100n, 10900n)).toBe("updated 3h ago");
    expect(priceReadState(true, null)).toBeNull();
  });

  it("marks cached data after a failure and clears the warning after recovery", () => {
    expect(priceReadState(true, "RPC failed")).toBe("Cached price, refresh failed");
    expect(priceReadState(false, "RPC failed")).toBe("Price unavailable");
    expect(priceReadState(true, null)).toBeNull();
  });
});

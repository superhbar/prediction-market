import { formatCountdown } from "./question";
import { describe, expect, it } from "vitest";

describe("formatCountdown", () => {
  it("shows days, hours, minutes and seconds", () => {
    expect(formatCountdown(((28 * 24 + 5) * 3600 + 53 * 60 + 7) * 1000)).toBe("28d 5h 53m 07s");
  });

  it("drops leading units as the deadline nears", () => {
    expect(formatCountdown((2 * 3600 + 5 * 60 + 9) * 1000)).toBe("2h 05m 09s");
    expect(formatCountdown((4 * 60 + 30) * 1000)).toBe("4m 30s");
    expect(formatCountdown(42_900)).toBe("42s");
  });

  it("never goes negative", () => {
    expect(formatCountdown(0)).toBe("0s");
    expect(formatCountdown(-5000)).toBe("0s");
  });
});

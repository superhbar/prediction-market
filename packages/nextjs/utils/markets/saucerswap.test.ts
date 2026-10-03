import { minimumOut, orientReserves, spotPrice } from "./saucerswap";
import { describe, expect, it } from "vitest";

const WHBAR = "0x0000000000000000000000000000000000003ad2";
const YES = "0x0000000000000000000000000000000000a56af1";

describe("orientReserves", () => {
  it("reads token0 as HBAR when token0 is the WHBAR token", () => {
    expect(orientReserves(WHBAR, 2n, 4n, WHBAR)).toEqual({ hbar: 2n, token: 4n });
  });

  it("swaps the order when the position token sorts first", () => {
    expect(orientReserves(YES, 4n, 2n, WHBAR)).toEqual({ hbar: 2n, token: 4n });
  });
});

describe("spotPrice", () => {
  it("prices one whole token in tinybar from the measured testnet pool", () => {
    // 1.90639515 HBAR against 4.20192116 YES after the spike's buy and sell.
    expect(spotPrice({ hbar: 190_639_515n, token: 420_192_116n })).toBe(45_369_607n);
  });

  it("is undefined for an empty pool", () => {
    expect(spotPrice({ hbar: 0n, token: 5n })).toBeUndefined();
  });
});

describe("minimumOut", () => {
  it("keeps 99% of the quote at the default 1% slippage", () => {
    expect(minimumOut(79_807_884n)).toBe(79_009_805n);
  });

  it("accepts a custom slippage and never goes below zero", () => {
    expect(minimumOut(10_000n, 50n)).toBe(9_950n);
    expect(minimumOut(0n)).toBe(0n);
  });
});

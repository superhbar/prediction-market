import { amountOut, minimumOut, orientReserves, poolDepth, spotPrice } from "./saucerswap";
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

describe("amountOut", () => {
  it("matches the e2e buy on testnet to the unit", () => {
    // Pool opened with 2 YES and 1 HBAR plus 3% of the 19.66297658 HBAR fee; 0.5 HBAR bought 0.47740141 YES.
    expect(amountOut(50_000_000n, 158_988_930n, 200_000_000n)).toBe(47_740_141n);
  });

  it("is zero for an empty input or pool", () => {
    expect(amountOut(0n, 1n, 1n)).toBe(0n);
    expect(amountOut(1n, 0n, 1n)).toBe(0n);
  });
});

describe("poolDepth", () => {
  const reserves = { hbar: 100_000_000_000n, token: 200_000_000_000n }; // 1000 HBAR, 2000 tokens, spot 0.5 HBAR

  it("fills larger trades at worse average prices on both sides", () => {
    const { buys, sells } = poolDepth(reserves, [100_000_000n, 10_000_000_000n]);
    expect(buys[0].averagePrice).toBeGreaterThan(50_000_000n);
    expect(buys[1].averagePrice).toBeGreaterThan(buys[0].averagePrice);
    expect(sells[0].averagePrice).toBeLessThan(50_000_000n);
    expect(sells[1].averagePrice).toBeLessThan(sells[0].averagePrice);
    expect(buys[1].impactBps).toBeGreaterThan(buys[0].impactBps);
  });

  it("charges about the 0.3% fee on a tiny buy", () => {
    const [tiny] = poolDepth(reserves, [100_000n]).buys;
    expect(tiny.impactBps).toBe(30n);
  });
});

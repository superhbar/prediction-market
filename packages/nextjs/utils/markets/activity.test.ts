import deployedContracts from "../../contracts/deployedContracts";
import { decodeActivity } from "./activity";
import type { MirrorContractLog } from "./mirror";
import { encodeAbiParameters, encodeEventTopics, stringToHex } from "viem";
import { describe, expect, it } from "vitest";

const predictionMarketsAbi = deployedContracts[296].PredictionMarkets.abi;

const CREATOR = "0x0000000000000000000000000000000000001234";
const TRADER = "0x0000000000000000000000000000000000005678";
const TOKEN_A = "0x00000000000000000000000000000000000000a1";
const TOKEN_B = "0x00000000000000000000000000000000000000b2";
const SCHEDULE = "0x0000000000000000000000000000000000000cc1";

/**
 * Builds a mirror node log fixture the way the mirror node serves it: topics
 * from the event signature plus indexed args, data from the non-indexed args.
 */
function makeLog(
  eventName:
    | "MarketCreated"
    | "Staked"
    | "SettlementRetryScheduled"
    | "SettlementRetriesExhausted"
    | "SettlementRetryFailed"
    | "MarketSettled"
    | "MarketVoided"
    | "Redeemed"
    | "ReserveWithdrawn",
  indexedArgs: Record<string, bigint>,
  params: { name: string; type: string }[],

  values: any[],
  overrides?: Partial<MirrorContractLog>,
): MirrorContractLog {
  const topics = encodeEventTopics({
    abi: predictionMarketsAbi,
    eventName,
    args: indexedArgs,
  } as any) as [`0x${string}`, ...`0x${string}`[]];
  return {
    data: encodeAbiParameters(params as never, values as never) as `0x${string}`,
    topics: [...topics],
    timestamp: "1762051200.123456789",
    transaction_hash: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    ...overrides,
  };
}

describe("decodeActivity", () => {
  it("decodes MarketCreated with the reserve in HBAR", () => {
    const logs = [
      makeLog(
        "MarketCreated",
        { marketId: 0n },
        [
          { name: "feedKey", type: "bytes32" },
          { name: "strike", type: "int256" },
          { name: "expiry", type: "uint64" },
          { name: "creator", type: "address" },
          { name: "yesToken", type: "address" },
          { name: "noToken", type: "address" },
          { name: "schedule", type: "address" },
          { name: "reserve", type: "uint256" },
        ],
        [
          stringToHex("HBAR/USD", { size: 32 }),
          300000000000000000n,
          1762054800n,
          CREATOR,
          TOKEN_A,
          TOKEN_B,
          SCHEDULE,
          700_000_000n,
        ],
      ),
    ];
    const [entry] = decodeActivity(logs, predictionMarketsAbi);
    expect(entry.kind).toBe("MarketCreated");
    expect(entry.label).toBe("Market created");
    expect(entry.detail).toContain("7 HBAR");
    expect(entry.account?.toLowerCase()).toBe(CREATOR);
  });

  it("decodes Staked on both sides with tinybar amounts as HBAR", () => {
    const stake = (yes: boolean, amount: bigint, hash: string) =>
      makeLog(
        "Staked",
        { marketId: 0n },
        [
          { name: "account", type: "address" },
          { name: "yes", type: "bool" },
          { name: "amount", type: "uint256" },
        ],
        [TRADER, yes, amount],
        { transaction_hash: hash },
      );
    const entries = decodeActivity(
      [
        stake(true, 500_000_000n, "0x1111111111111111111111111111111111111111111111111111111111111111"),
        stake(false, 300_000_000n, "0x2222222222222222222222222222222222222222222222222222222222222222"),
      ],
      predictionMarketsAbi,
    );
    expect(entries.map(entry => entry.label)).toEqual(["Staked 5 HBAR on YES", "Staked 3 HBAR on NO"]);
    expect(entries[0].account?.toLowerCase()).toBe(TRADER);
  });

  it("decodes SettlementRetryScheduled with retry time and retries left", () => {
    const [entry] = decodeActivity(
      [
        makeLog(
          "SettlementRetryScheduled",
          { marketId: 0n },
          [
            { name: "schedule", type: "address" },
            { name: "retryAt", type: "uint256" },
            { name: "retriesLeft", type: "uint8" },
          ],
          [SCHEDULE, 1762058400n, 2],
        ),
      ],
      predictionMarketsAbi,
    );
    expect(entry.label).toBe("No round yet, retry booked");
    expect(entry.detail).toContain("2 retries left");
  });

  it("decodes MarketSettled with outcome, source and 1e18 price", () => {
    const [entry] = decodeActivity(
      [
        makeLog(
          "MarketSettled",
          { marketId: 0n },
          [
            { name: "outcome", type: "uint8" },
            { name: "price", type: "int256" },
            { name: "priceTime", type: "uint256" },
            { name: "source", type: "uint8" },
          ],
          [2, 280000000000000000n, 1762054800n, 1],
        ),
      ],
      predictionMarketsAbi,
    );
    expect(entry.label).toBe("Settled NO via Chainlink at $0.2800");
  });

  it("decodes MarketSettled with source None as a refund", () => {
    const [entry] = decodeActivity(
      [
        makeLog(
          "MarketSettled",
          { marketId: 0n },
          [
            { name: "outcome", type: "uint8" },
            { name: "price", type: "int256" },
            { name: "priceTime", type: "uint256" },
            { name: "source", type: "uint8" },
          ],
          [3, 0n, 0n, 0],
        ),
      ],
      predictionMarketsAbi,
    );
    expect(entry.label).toBe("Settled as a refund");
  });

  it("decodes SettlementRetriesExhausted", () => {
    const [entry] = decodeActivity(
      [makeLog("SettlementRetriesExhausted", { marketId: 0n }, [], [])],
      predictionMarketsAbi,
    );
    expect(entry.label).toBe("No round, no retries left");
  });

  it("decodes SettlementRetryFailed with the Schedule Service response code", () => {
    const [entry] = decodeActivity(
      [makeLog("SettlementRetryFailed", { marketId: 0n }, [{ name: "responseCode", type: "int64" }], [33n])],
      predictionMarketsAbi,
    );
    expect(entry.label).toBe("No round, retry could not be booked");
    expect(entry.detail).toBe("Schedule Service response 33");
  });

  it("decodes MarketVoided", () => {
    const [entry] = decodeActivity([makeLog("MarketVoided", { marketId: 0n }, [], [])], predictionMarketsAbi);
    expect(entry.label).toBe("Voided");
  });

  it("decodes Redeemed with the token amount, side and HBAR payout", () => {
    const [entry] = decodeActivity(
      [
        makeLog(
          "Redeemed",
          { marketId: 0n },
          [
            { name: "account", type: "address" },
            { name: "yes", type: "bool" },
            { name: "amount", type: "uint256" },
            { name: "payout", type: "uint256" },
          ],
          [TRADER, false, 300_000_000n, 480_000_000n],
        ),
      ],
      predictionMarketsAbi,
    );
    expect(entry.label).toBe("Redeemed 3 NO for 4.8 HBAR");
    expect(entry.account?.toLowerCase()).toBe(TRADER);
  });

  it("decodes ReserveWithdrawn with the amount in HBAR", () => {
    const [entry] = decodeActivity(
      [
        makeLog(
          "ReserveWithdrawn",
          { marketId: 0n },
          [
            { name: "creator", type: "address" },
            { name: "amount", type: "uint256" },
          ],
          [CREATOR, 550_000_000n],
        ),
      ],
      predictionMarketsAbi,
    );
    expect(entry.label).toBe("Reserve withdrawn, 5.5 HBAR");
    expect(entry.account?.toLowerCase()).toBe(CREATOR);
  });

  it("skips undecodable logs and keeps entry order", () => {
    const good = makeLog("MarketVoided", { marketId: 0n }, [], [], {
      transaction_hash: "0x3333333333333333333333333333333333333333333333333333333333333333",
    });
    const entries = decodeActivity(
      [
        {
          data: "0x1234",
          topics: ["0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef"],
          timestamp: "1762051200.000000000",
          transaction_hash: "0x4444444444444444444444444444444444444444444444444444444444444444",
        },
        good,
      ],
      predictionMarketsAbi,
    );
    expect(entries).toHaveLength(1);
    expect(entries[0].label).toBe("Voided");
  });
});

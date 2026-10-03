import { batchReadError } from "./readResults";
import { describe, expect, it } from "vitest";

describe("batch read errors", () => {
  it("keeps genuine zero balances and payouts as successful reads", () => {
    expect(batchReadError([{ status: "success", result: 0n }])).toBeNull();
  });

  it("surfaces a partial RPC failure even if the overall batch resolved", () => {
    const error = new Error("balanceOf failed");
    expect(
      batchReadError([
        { status: "success", result: 100n },
        { status: "failure", error },
      ]),
    ).toBe(error);
  });

  it("treats an absent result as unavailable, rather than zero", () => {
    expect(batchReadError([{ status: "success", result: undefined }])).toBeInstanceOf(Error);
    expect(batchReadError([{ status: "failure" }])).toBeInstanceOf(Error);
  });

  it("does not mistake a pending or empty batch for a failure", () => {
    expect(batchReadError(undefined)).toBeNull();
    expect(batchReadError([])).toBeNull();
  });
});

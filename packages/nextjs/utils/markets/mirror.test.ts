import { classifyAssociation, fetchAccountExists } from "./mirror";
import { afterEach, describe, expect, it, vi } from "vitest";

const TESTNET = 296;
const ADDRESS = "0x0000000000000000000000000000000000005678";

function mockResponse(status: number, body: unknown = {}) {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("fetchAccountExists", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("is true when the app's account route resolves an account id", async () => {
    const fetchMock = mockResponse(200, { accountId: "0.0.1234" });
    await expect(fetchAccountExists(TESTNET, ADDRESS)).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(`/api/hedera/account?evm=${ADDRESS}&network=testnet`, expect.anything());
  });

  it("is false for an address that has not received HBAR yet", async () => {
    mockResponse(200, { accountId: null });
    await expect(fetchAccountExists(TESTNET, ADDRESS)).resolves.toBe(false);
  });

  it("throws when the lookup fails instead of reporting a missing account", async () => {
    mockResponse(502, { error: "Resolution failed" });
    await expect(fetchAccountExists(TESTNET, ADDRESS)).rejects.toThrow("502");
  });
});

describe("classifyAssociation", () => {
  it("is ok once associated, whatever the slots", () => {
    expect(classifyAssociation(0, true)).toBe("ok");
    expect(classifyAssociation(5, true)).toBe("ok");
  });

  it("is ok with unlimited automatic associations", () => {
    expect(classifyAssociation(-1, false)).toBe("ok");
  });

  it("requires association with no slots", () => {
    expect(classifyAssociation(0, false)).toBe("needs-association");
  });

  it("warns with limited slots, since the mirror node does not say how many are used", () => {
    expect(classifyAssociation(10, false)).toBe("may-need-association");
  });
});

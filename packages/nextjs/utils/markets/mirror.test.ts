import { fetchAccountExists } from "./mirror";
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

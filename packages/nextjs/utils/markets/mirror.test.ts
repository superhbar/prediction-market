import { fetchAccountExists } from "./mirror";
import { afterEach, describe, expect, it, vi } from "vitest";

const MIRROR = "https://testnet.mirrornode.hedera.com";
const ADDRESS = "0x0000000000000000000000000000000000005678";

function mockStatus(status: number) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("{}", { status })),
  );
}

describe("fetchAccountExists", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("is true when the mirror node knows the address", async () => {
    mockStatus(200);
    await expect(fetchAccountExists(MIRROR, ADDRESS)).resolves.toBe(true);
  });

  it("is false for an address that has not received HBAR yet (404)", async () => {
    mockStatus(404);
    await expect(fetchAccountExists(MIRROR, ADDRESS)).resolves.toBe(false);
  });

  it("throws on other mirror failures instead of reporting a missing account", async () => {
    mockStatus(503);
    await expect(fetchAccountExists(MIRROR, ADDRESS)).rejects.toThrow("503");
  });
});

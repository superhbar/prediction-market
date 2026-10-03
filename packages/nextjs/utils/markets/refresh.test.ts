import { refreshMarketReads, schedulePollInterval } from "./refresh";
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

describe("post-receipt refresh", () => {
  it("immediately refetches active single and batch reads and invalidates inactive positions", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
    const market = vi.fn().mockResolvedValue(1n);
    const balances = vi.fn().mockResolvedValue([2n, 3n]);
    const single = new QueryObserver(client, {
      queryKey: ["readContract", { functionName: "getMarket" }],
      queryFn: market,
    });
    const batch = new QueryObserver(client, {
      queryKey: ["readContracts", { contracts: ["balanceOf", "quotePayout"] }],
      queryFn: balances,
    });
    const unsubscribeSingle = single.subscribe(() => {});
    const unsubscribeBatch = batch.subscribe(() => {});
    const inactiveKey = ["readContracts", { account: "other" }];
    client.setQueryData(inactiveKey, [0n]);
    client.setQueryData(["unrelated"], "keep");
    await single.refetch();
    await batch.refetch();
    market.mockClear();
    balances.mockClear();
    await refreshMarketReads(client);
    expect(market).toHaveBeenCalledOnce();
    expect(balances).toHaveBeenCalledOnce();
    expect(client.getQueryState(inactiveKey)?.isInvalidated).toBe(true);
    expect(client.getQueryState(["unrelated"])?.isInvalidated).toBe(false);
    unsubscribeSingle();
    unsubscribeBatch();
    client.clear();
  });
});

describe("schedule polling", () => {
  it("polls pending schedules and unknown reads", () => {
    expect(schedulePollInterval({ executedTimestamp: null, deleted: false })).toBe(15_000);
    expect(schedulePollInterval(undefined)).toBe(15_000);
  });

  it("stops when execution or deletion is confirmed", () => {
    expect(schedulePollInterval({ executedTimestamp: "1234.1", deleted: false })).toBe(false);
    expect(schedulePollInterval({ executedTimestamp: null, deleted: true })).toBe(false);
  });
});

import type { QueryClient } from "@tanstack/react-query";

/** Refresh active balances, quotes and markets after a confirmed protocol write. */
export function refreshMarketReads(queryClient: QueryClient): Promise<void> {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: ["readContract"] }),
    queryClient.invalidateQueries({ queryKey: ["readContracts"] }),
  ]).then(() => {});
}

/** A terminal mirror status no longer needs polling. Unknown reads remain retryable. */
export function schedulePollInterval(
  schedule: { executedTimestamp: string | null; deleted: boolean | null } | undefined,
): number | false {
  return schedule?.executedTimestamp || schedule?.deleted ? false : 15_000;
}

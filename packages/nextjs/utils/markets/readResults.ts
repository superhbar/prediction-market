type ReadResult = { status: string; result?: unknown; error?: Error };

/** wagmi batches can resolve successfully while individual contract reads fail. */
export function batchReadError(results: readonly ReadResult[] | undefined): Error | null {
  const failed = results?.find(entry => entry.status !== "success" || entry.result === undefined);
  return failed ? (failed.error ?? new Error("A contract read failed.")) : null;
}

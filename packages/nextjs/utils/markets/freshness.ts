/** Publication age is independent of whether the latest network refresh succeeded. */
export function priceAge(timestamp: bigint, now: bigint): string {
  const seconds = now > timestamp ? now - timestamp : 0n;
  if (seconds < 60n) return `updated ${seconds}s ago`;
  if (seconds < 3600n) return `updated ${seconds / 60n}m ago`;
  if (seconds < 86400n) return `updated ${seconds / 3600n}h ago`;
  return `updated ${seconds / 86400n}d ago`;
}

export function priceReadState(hasPrice: boolean, error: string | null): string | null {
  if (!error) return null;
  return hasPrice ? "Cached price, refresh failed" : "Price unavailable";
}

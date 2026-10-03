import { formatExactPrice } from "./units";

/** "Will HBAR/USD be at or above $0.1000 on Oct 20, 12:00 UTC?" */
export function marketQuestion(feedLabel: string, strike: bigint, expirySec: bigint): string {
  const date = new Date(Number(expirySec) * 1000);
  const day = date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  const time = date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  });
  return `Will ${feedLabel} be at or above ${formatExactPrice(strike)} on ${day}, ${time} UTC?`;
}

/** "Oct 20, 12:00 UTC" short expiry label for cards. */
export function shortExpiry(expirySec: bigint): string {
  const date = new Date(Number(expirySec) * 1000);
  const day = date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  const time = date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  });
  return `${day}, ${time} UTC`;
}

/** "2d 14h 03m" countdown from a millisecond delta. Past times read "0m". */
export function formatCountdown(deltaMs: number): string {
  if (deltaMs <= 0) return "0m";
  const totalMinutes = Math.floor(deltaMs / 60_000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}d ${hours}h ${String(minutes).padStart(2, "0")}m`;
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, "0")}m`;
  return `${minutes}m`;
}

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
  if (deltaMs <= 0) return "0s";
  const totalSeconds = Math.floor(deltaMs / 1000);
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  const mm = String(minutes).padStart(2, "0");
  if (days > 0) return `${days}d ${hours}h ${mm}m ${seconds}s`;
  if (hours > 0) return `${hours}h ${mm}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${totalSeconds}s`;
}

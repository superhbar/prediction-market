import { type MirrorContractLog } from "./mirror";
import { outcomeLabel, sourceLabel } from "./status";
import { MarketOutcome, PriceSource } from "./types";
import { formatExactPrice, formatHbar } from "./units";
import { type Abi, decodeEventLog } from "viem";

/** One decoded market history row, newest-first as returned by the mirror node. */
export type ActivityEntry = {
  /** Event name, e.g. "Staked". */
  kind: string;
  /** Headline, e.g. "Staked 5 HBAR on YES". */
  label: string;
  /** Sub-line, e.g. retry time or settlement time. */
  detail?: string;
  /** Related account (staker, creator) when the event has one. */
  account?: string;
  /** Consensus seconds from the mirror node timestamp. */
  timestamp: number;
  /** Mirror node transaction hash for the Hashscan link. */
  transactionHash: string;
};

/** Loose view of decoded event args: every PredictionMarkets event has flat params. */
type EventArgs = Record<string, bigint | boolean | number | string | undefined>;

/** Defensive bigint coercion: decoded uint values arrive as bigint, uint8 as number. */
function toBigInt(value: bigint | boolean | number | string | undefined): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number" && Number.isFinite(value)) return BigInt(Math.trunc(value));
  if (typeof value === "string" && value.trim() !== "") {
    try {
      return BigInt(value.trim());
    } catch {
      return 0n;
    }
  }
  return 0n;
}

/** Consensus seconds from a mirror "seconds.nanos" timestamp. NaN-safe. */
export function consensusSeconds(timestamp: string): number {
  const seconds = Number(timestamp.split(".")[0]);
  return Number.isFinite(seconds) ? seconds : 0;
}

/** "Oct 2, 2026, 14:30 UTC" for a unix timestamp in seconds. */
export function formatUtc(seconds: number | bigint): string {
  const date = new Date(Number(seconds) * 1000);
  const day = date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  const time = date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  });
  return `${day}, ${date.getUTCFullYear()}, ${time} UTC`;
}

/**
 * Turns raw mirror node logs into typed activity entries using viem
 * `decodeEventLog` and the PredictionMarkets ABI. Unknown or undecodable logs
 * are skipped, never thrown. Order is preserved (the mirror node returns
 * newest-first when asked with `order=desc`).
 */
export function decodeActivity(logs: MirrorContractLog[], abi: Abi): ActivityEntry[] {
  const entries: ActivityEntry[] = [];
  for (const log of logs) {
    try {
      if (!log.topics || log.topics.length === 0 || typeof log.data !== "string") continue;
      const decoded = decodeEventLog({
        abi,
        data: log.data as `0x${string}`,
        topics: log.topics as [`0x${string}`, ...`0x${string}`[]],
      });
      const entry = toEntry(decoded.eventName as unknown as string, decoded.args as unknown as EventArgs, log);
      if (entry) entries.push(entry);
    } catch {
      // Skip unknown or undecodable logs.
    }
  }
  return entries;
}

function base(log: MirrorContractLog): Pick<ActivityEntry, "timestamp" | "transactionHash"> {
  return { timestamp: consensusSeconds(log.timestamp), transactionHash: log.transaction_hash };
}

/** One decoded event to an entry, or null for events this panel does not show. */
function toEntry(eventName: string, args: EventArgs, log: MirrorContractLog): ActivityEntry | null {
  switch (eventName) {
    case "MarketCreated": {
      const reserve = toBigInt(args.reserve);
      return {
        kind: eventName,
        label: "Market created",
        detail: `Reserve ${formatHbar(reserve)}`,
        account: String(args.creator ?? ""),
        ...base(log),
      };
    }
    case "Staked": {
      const amount = toBigInt(args.amount);
      const side = args.yes === true ? "YES" : "NO";
      return {
        kind: eventName,
        label: `Staked ${formatHbar(amount)} on ${side}`,
        account: String(args.account ?? ""),
        ...base(log),
      };
    }
    case "SettlementRetryScheduled": {
      const retriesLeft = Number(args.retriesLeft ?? 0);
      const retryAt = toBigInt(args.retryAt);
      return {
        kind: eventName,
        label: "No round yet, retry booked",
        detail: `Retry at ${formatUtc(retryAt)}, ${retriesLeft} ${retriesLeft === 1 ? "retry" : "retries"} left`,
        ...base(log),
      };
    }
    case "SettlementRetriesExhausted": {
      return {
        kind: eventName,
        label: "No round, no retries left",
        detail: "Anyone can settle once a round lands, use Pyth, or void after the grace period",
        ...base(log),
      };
    }
    case "SettlementRetryFailed": {
      return {
        kind: eventName,
        label: "No round, retry could not be booked",
        detail: `Schedule Service response ${Number(args.responseCode ?? 0)}`,
        ...base(log),
      };
    }
    case "MarketSettled": {
      const source = Number(args.source ?? PriceSource.None);
      if (source === PriceSource.None) {
        return { kind: eventName, label: "Settled as a refund", ...base(log) };
      }
      const outcome = Number(args.outcome ?? MarketOutcome.Unresolved);
      const price = toBigInt(args.price);
      const priceTime = toBigInt(args.priceTime);
      return {
        kind: eventName,
        label: `Settled ${outcomeLabel(outcome)} via ${sourceLabel(source)} at ${formatExactPrice(price)}`,
        detail: `Read at ${formatUtc(priceTime)}`,
        ...base(log),
      };
    }
    case "MarketVoided": {
      return { kind: eventName, label: "Voided", ...base(log) };
    }
    case "Redeemed": {
      const amount = toBigInt(args.amount);
      const payout = toBigInt(args.payout);
      const side = args.yes === true ? "YES" : "NO";
      return {
        kind: eventName,
        label: `Redeemed ${formatHbar(amount).replace("HBAR", side)} for ${formatHbar(payout)}`,
        account: String(args.account ?? ""),
        ...base(log),
      };
    }
    case "ReserveWithdrawn": {
      const amount = toBigInt(args.amount);
      return {
        kind: eventName,
        label: `Reserve withdrawn, ${formatHbar(amount)}`,
        account: String(args.creator ?? ""),
        ...base(log),
      };
    }
    default:
      return null;
  }
}

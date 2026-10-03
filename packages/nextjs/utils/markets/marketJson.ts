import { bytes32ToFeedKey } from "./feeds";
import { marketQuestion } from "./question";
import { type StatusConfig, deriveStatus } from "./status";
import { type Market, MarketOutcome, MarketState } from "./types";
import { priceToDecimal, tinybarToHbar } from "./units";

const STATES = ["Open", "Settled", "Voided"] as const;
const OUTCOMES = ["Unresolved", "Yes", "No", "Invalid"] as const;
const SOURCES = ["None", "Chainlink", "Pyth"] as const;

/** HBAR amount in both units: exact tinybar as a string (bigint-safe) and a decimal HBAR string. */
function amount(tinybar: bigint) {
  return { tinybar: tinybar.toString(), hbar: tinybarToHbar(tinybar) };
}

/**
 * JSON view of a market for the read-only API. Every amount carries its unit; prices are decimal USD
 * strings converted from the contract's 1e18 fixed point. Pure: the caller supplies the clock.
 */
export function marketToJson(id: number, market: Market, nowSec: bigint, config: StatusConfig) {
  const feed = bytes32ToFeedKey(market.feedKey);
  const settled = market.state === MarketState.Settled;
  return {
    id,
    feed,
    question: marketQuestion(feed, market.strike, market.expiry),
    strikeUsd: priceToDecimal(market.strike),
    expiry: new Date(Number(market.expiry) * 1000).toISOString(),
    state: STATES[market.state] ?? "Unknown",
    status: deriveStatus(market, nowSec, config),
    outcome: OUTCOMES[market.outcome] ?? "Unknown",
    pools: { yes: amount(market.yesPool), no: amount(market.noPool) },
    reserve: amount(market.reserve),
    tokens: { yes: market.yesToken, no: market.noToken },
    creator: market.creator,
    settlement: settled
      ? {
          source: SOURCES[market.source] ?? "Unknown",
          priceUsd: priceToDecimal(market.settlementPrice),
          publishedAt: new Date(Number(market.settlementTime) * 1000).toISOString(),
        }
      : null,
    schedule: { address: market.schedule, pending: market.schedulePending, retriesLeft: market.retriesLeft },
    refundsAtPar: market.state === MarketState.Voided || market.outcome === MarketOutcome.Invalid,
  };
}

import { hedera } from "viem/chains";

/**
 * Typed mirror node REST fetchers. All calls are plain GET requests with a
 * timeout; they never need a wallet or an API key.
 */

export type ExchangeRate = {
  /** HBAR per 1 USD, e.g. 5.2 means $1 costs 5.2 HBAR. */
  hbarPerUsd: number;
};

export type MirrorAccount = {
  maxAutomaticTokenAssociations: number;
};

export type MirrorSchedule = {
  executedTimestamp: string | null;
  deleted: boolean | null;
  expirationTime: string | null;
};

/** Raw contract log as returned by the mirror node results/logs endpoint. */
export type MirrorContractLog = {
  data: `0x${string}`;
  topics: `0x${string}`[];
  /** Consensus timestamp "seconds.nanos", e.g. "1697044200.123456789". */
  timestamp: string;
  transaction_hash: string;
};

/**
 * Reads contract logs newest-first from the mirror node, following `links.next`
 * up to `maxPages` pages of 100, or until a page holds a log matching `stopWhen`.
 * Returns the raw logs; callers filter by market
 * on the client via `topics[1]` (the indexed market id word). The mirror node's
 * `topic1` query parameter is intentionally not used: it requires a timestamp
 * range of at most 7 days while markets live up to 60 days, and the zero word
 * (market 0) matches nothing.
 */
export async function fetchContractLogs(
  mirrorBase: string,
  contractAddress: string,
  maxPages = 20,
  stopWhen?: (log: MirrorContractLog) => boolean,
): Promise<MirrorContractLog[]> {
  const collected: MirrorContractLog[] = [];
  let path: string | null = `/api/v1/contracts/${contractAddress}/results/logs?order=desc&limit=100`;
  for (let page = 0; page < maxPages && path !== null; page += 1) {
    const data = (await getJson(mirrorBase, path)) as {
      logs?: MirrorContractLog[];
      links?: { next?: string | null } | null;
    };
    const logs = Array.isArray(data.logs) ? data.logs : [];
    collected.push(...logs);
    // Newest first: once the stop log is seen (a market's creation), older pages cannot matter.
    if (stopWhen && logs.some(stopWhen)) break;
    path = data.links?.next ?? null;
  }
  return collected;
}

async function getJson(mirrorBase: string, path: string): Promise<unknown> {
  const response = await fetch(`${mirrorBase}${path}`, {
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    throw new Error(`Mirror node request failed: ${response.status}`);
  }
  return response.json() as Promise<unknown>;
}

/** Current HBAR/USD exchange rate from the mirror node network endpoint. */
export async function fetchExchangeRate(mirrorBase: string): Promise<ExchangeRate> {
  const data = (await getJson(mirrorBase, "/api/v1/network/exchangerate")) as {
    current_rate?: { hbar_equivalent?: number; cent_equivalent?: number };
  };
  const hbarEquivalent = data.current_rate?.hbar_equivalent ?? 0;
  const centEquivalent = data.current_rate?.cent_equivalent ?? 0;
  if (hbarEquivalent <= 0 || centEquivalent <= 0) {
    throw new Error("Mirror node returned an invalid exchange rate");
  }
  return { hbarPerUsd: (hbarEquivalent / centEquivalent) * 100 };
}

/** Account summary, used to read max_automatic_token_associations. */
export async function fetchAccount(mirrorBase: string, evmAddress: string): Promise<MirrorAccount> {
  const data = (await getJson(mirrorBase, `/api/v1/accounts/${evmAddress}`)) as {
    max_automatic_token_associations?: number;
  };
  return { maxAutomaticTokenAssociations: data.max_automatic_token_associations ?? 0 };
}

/**
 * Whether an EVM address has a Hedera account yet. A fresh burner or wallet address only becomes an account
 * when it first receives HBAR; until then the mirror node answers 404 and HTS balance reads revert. Asks the
 * app's own `/api/hedera/account` route, which turns that 404 into `{ accountId: null }`, so a missing account
 * never shows up as a failed request in the browser console.
 */
export async function fetchAccountExists(chainId: number, evmAddress: string): Promise<boolean> {
  const network = chainId === hedera.id ? "mainnet" : "testnet";
  const response = await fetch(`/api/hedera/account?evm=${evmAddress}&network=${network}`, {
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Account lookup failed: ${response.status}`);
  const data = (await response.json()) as { accountId?: string | null };
  return typeof data.accountId === "string";
}

/** True when the account already holds or is associated with the token. */
export async function fetchIsTokenAssociated(
  mirrorBase: string,
  evmAddress: string,
  tokenId: string,
): Promise<boolean> {
  const data = (await getJson(mirrorBase, `/api/v1/accounts/${evmAddress}/tokens?token.id=${tokenId}`)) as {
    tokens?: unknown[];
  };
  return Array.isArray(data.tokens) && data.tokens.length > 0;
}

/** Schedule status: executed timestamp, deletion flag and expiration time. Null when not found. */
export async function fetchSchedule(mirrorBase: string, scheduleId: string): Promise<MirrorSchedule | null> {
  try {
    const data = (await getJson(mirrorBase, `/api/v1/schedules/${scheduleId}`)) as {
      executed_timestamp?: string | null;
      deleted?: boolean | null;
      expiration_time?: string | null;
    };
    return {
      executedTimestamp: data.executed_timestamp ?? null,
      deleted: data.deleted ?? null,
      expirationTime: data.expiration_time ?? null,
    };
  } catch {
    return null;
  }
}

/**
 * Whether an existing account can receive a token it may not hold yet.
 * - `needs-association`: no automatic-association slots and not associated, so a transfer of the token fails.
 * - `may-need-association`: a limited number of slots and not associated; the transfer fails once they are used.
 *   The mirror node does not say how many are used.
 * - `ok`: associated already, or unlimited slots (-1).
 */
export type TokenReceivable = "ok" | "may-need-association" | "needs-association";

export function classifyAssociation(maxAutomaticTokenAssociations: number, associated: boolean): TokenReceivable {
  if (associated || maxAutomaticTokenAssociations < 0) return "ok";
  return maxAutomaticTokenAssociations === 0 ? "needs-association" : "may-need-association";
}

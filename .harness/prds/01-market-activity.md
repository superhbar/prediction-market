# Market activity panel

## Goal

Every market page gets an **Activity** panel: a newest-first list of what happened to that market
on-chain, read from the Hedera mirror node, with a Hashscan link on every entry. A visitor with no
wallet can see who staked, when the network ran the scheduled settlement, which oracle settled it and
who redeemed, and can check each claim on Hashscan.

This is an increment on an existing, working template. Do not rebuild or restyle the app.

## Who it is for

- Traders deciding whether a market is active and fair.
- Developers learning the template: the panel shows the HIP-1215 scheduled settlement and its retries
  as real transactions, not as a diagram.

## Existing app (preserve)

- Routes `/`, `/markets/new`, `/markets/[id]`, `/portfolio`, `/debug` and `/api/pyth` keep working.
- `packages/foundry` is out of scope. Do not change `PredictionMarkets.sol`, its tests, the deploy
  scripts or `packages/nextjs/contracts/deployedContracts.ts`.
- The editorial design system: Fraunces headings (`font-editorial`), Inter body, cream and ink
  theme tokens (`bg-base-100`, `border-base-300`, `text-base-content/60`), purple `primary`, small
  uppercase tracked labels. Copy the look of `SettlementTimeline` and `RedeemPanel`.
- Yarn 3 workspaces; no new dependencies are needed (`viem` already decodes logs).

## Feature

1. **Mirror fetcher** in `packages/nextjs/utils/markets/mirror.ts`: `fetchContractLogs(mirrorBase,
   contractAddress, maxPages)` calls
   `GET {mirrorBase}/api/v1/contracts/{contractAddress}/results/logs?order=desc&limit=100`, follows
   `links.next` up to `maxPages` (default 5), and returns the raw logs (`data`, `topics`,
   `timestamp`, `transaction_hash`). Reuse the existing `getJson` helper and its timeout. Filter by
   market **on the client**: every PredictionMarkets event indexes `marketId` as `topics[1]`, so keep
   logs whose `topics[1]` equals the market id as a 32-byte hex word (compare as `BigInt`). Do not
   use the mirror node's `topic1` query parameter. Measured on testnet on 2026-10-02: it is rejected
   without a timestamp range of at most 7 days (markets live up to 60 days), and `topic1` for
   market 0 (the zero word) matches nothing even inside a valid range.
2. **Pure decoder** in a new `packages/nextjs/utils/markets/activity.ts`: `decodeActivity(logs, abi)`
   turns raw logs into typed entries using viem `decodeEventLog` and the PredictionMarkets ABI from
   `deployedContracts`. Unknown or undecodable logs are skipped, never thrown. Entry kinds:
   - `MarketCreated`: "Market created", creator, reserve in HBAR.
   - `Staked`: "Staked {amount} HBAR on YES|NO", account.
   - `SettlementRetryScheduled`: "No round yet, retry booked", retry time, retries left.
   - `MarketSettled`: "Settled YES|NO via Chainlink|Pyth at {price}", or "Settled as a refund" when
     the source is None.
   - `MarketVoided`: "Voided".
   - `Redeemed`: "Redeemed {amount} YES|NO for {payout} HBAR", account.
   - `ReserveWithdrawn`: "Reserve withdrawn, {amount} HBAR", creator.
   Amounts in these events are **tinybar** (8 decimals): format with the helpers in
   `utils/markets/units.ts` (`formatHbar`), never with 18 decimals. Prices are 1e18 fixed point:
   `formatPrice`.
3. **Hook** `packages/nextjs/hooks/markets/useMarketActivity.ts`: resolves the mirror base with
   `mirrorBaseForChain(targetNetwork.id)` and the contract address with `useDeployedContractInfo`,
   fetches and decodes, refreshes every 30 seconds, and exposes `{ entries, isLoading, error,
   refetch }`.
4. **Component** `packages/nextjs/components/markets/ActivityPanel.tsx`, rendered on the market page
   below the settlement timeline. Each row: label, short account address where there is one, UTC
   time from the mirror `timestamp` (consensus seconds), and a "View on Hashscan" link built with
   `hashscanLink(chainId, "transaction", transaction_hash)`. States: loading skeleton, empty ("No
   activity yet"), and error ("Activity is unavailable right now" with a Retry button). Errors never
   crash the page.

## Non-goals

- No contract changes, no new events, no backend or database, no indexer.
- No pagination UI beyond the first 100 to 300 entries.
- Do not switch the package manager; do not commit `.env` files or keys.

## Acceptance (deterministic)

1. `yarn lint`, `yarn next:check-types`, `yarn next:test`, `yarn foundry:test` and `yarn next:build`
   pass.
2. `packages/nextjs/utils/markets/activity.test.ts` covers every entry kind with fixture logs
   (encode them with viem `encodeEventTopics` and `encodeAbiParameters`), the refund variant of
   `MarketSettled`, and an undecodable log that is skipped.
3. `/markets/0` on the shipped testnet deployment shows the real history of market 0 (see the
   acceptance contract).

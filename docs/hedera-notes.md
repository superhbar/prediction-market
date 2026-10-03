# Hedera behaviour, measured on testnet

Every design choice in this template was checked against Hedera testnet (chain 296, JSON-RPC through
`https://testnet.hashio.io/api`, mirror node `https://testnet.mirrornode.hedera.com`) between
2026-10-02 and 2026-10-03, with throwaway probe contracts and with the shipped contract. This page
records what was measured, so you can rely on it when you change the template, and re-measure when
something looks different.

## EVM units

| Question | Measured |
|---|---|
| Units of `msg.value` inside the EVM | Tinybar (8 decimals). Sending 1 HBAR over JSON-RPC (1e18 weibar) arrives as `100000000`. The relay converts. |
| Units of `address(this).balance` | Tinybar. All pools, reserves and payouts in `PredictionMarkets` are tinybar. |
| What the frontend sends | `parseEther(hbar)` (weibar). It formats contract values with 8 decimals. Both live in `packages/nextjs/utils/markets/units.ts`. |

## Hedera Token Service (system contract `0x167`)

| Question | Measured |
|---|---|
| Creating a fungible token from a contract (contract is treasury, supply key and wipe key) | About 190k gas plus a fee of about $1 in HBAR (11.45 HBAR at the testnet rate of $1 = 9.61 HBAR). A market creates two tokens. |
| Mint and transfer | Mint about 44k gas, transfer about 43k gas. |
| First transfer to a new holder | About 750k gas, because the receiver is auto-associated. The frontend sends stakes with a fixed 1.5M gas limit for this reason. |
| Burning a holder's tokens | `burnToken` only burns from the treasury. `wipeTokenAccount`, called by the contract as wipe key, removes tokens from any holder with no approval: 40 of a holder's 100 tokens were wiped and total supply dropped to 60. Redeem uses wipe, so there is no approve step. |

## Schedule Service, HIP-1215 (system contract `0x16b`)

| Question | Measured |
|---|---|
| Gas for `scheduleCall` in a normal transaction | About 1.46M. A 600k limit fails with `INSUFFICIENT_GAS` inside `0x16b`. `createMarket` is sent with 3M. |
| Maximum horizon | `hasScheduleCapacity` is true at +62 days and false at +63 days. The template caps market duration at 60 days. |
| Does the scheduled call run on time? | Yes. It executes as a `CONTRACTCALL` with `scheduled=true`. In the end-to-end run the self-booked retry executed at its booked second. |
| Who is `msg.sender` inside a scheduled call? | The contract itself. `msg.sender`, `tx.origin` and `address(this)` are all the contract's EVM address, so `msg.sender == address(this)` identifies a scheduled call. |
| Can a scheduled call book the next one? | Yes, if the scheduled call has a gas limit of 2.5M. 1.2M is too low to book. |
| Who pays, and how much? | The network bills the contract. A scheduled `settle` used 127,252 gas, billed 0.104 HBAR (82 tinybar per gas). Booking a retry from inside a scheduled call cost 1.17 to 1.22 HBAR. The contract charges each market's reserve 0.5 HBAR per scheduled execution and 1.5 HBAR per retry. |
| `delegatecall` to `0x16b` | Avoid it. Scheduled calls in this template are plain calls from the contract. |
| Local emulation | `hashgraph/hedera-forking` emulates HTS but not the Schedule Service, so unit tests mock `0x16b` with `vm.etch` and the lifecycle is proven by `yarn foundry:e2e:testnet` on real testnet. |

## Oracles

| Question | Measured |
|---|---|
| Chainlink HBAR/USD update frequency on testnet | Rounds were 3 to 46 minutes apart on 2026-10-02, but on 2026-10-03 the feed published nothing from 03:09 UTC until well past 06:00 UTC: it updates on deviation or heartbeat, not on a clock. The latest price at expiry can be known well before expiry, so settlement uses the first round at or after expiry, never the latest round, and a quiet feed sends a market down the fallback paths. |
| Round walk-back | `getRoundData` walks back cleanly within a phase. The contract rejects rounds more than 2 hours after expiry (`maxRoundLag`). |
| First scheduled settlement vs. round timing | On 2026-10-02 the first scheduled settlement (expiry + 10 minutes) found no round yet, booked a retry 15 minutes later, and the retry settled on a round published 604 seconds after expiry. On 2026-10-03 the feed was quieter: two retries were booked and the second settled on a round published 1960 seconds after expiry. |
| A scheduled call that reverts | Is still billed to the contract. An earlier deployment reverted when its last retry found no round, which undid the reserve charge and left `schedulePending` set. A scheduled `settle` now returns instead of reverting on every path it can hit: market already closed, no eligible round with retries left (books a retry), no retries or reserve left (`SettlementRetriesExhausted`), the Schedule Service refusing or reverting the retry booking (`SettlementRetryFailed`, no retry fee taken), and a Chainlink feed whose `latestRoundData` or `decimals` reverts (treated as no round). Each keeps the execution charge and clears `schedulePending`. Out-of-gas is not covered; `SETTLE_GAS` leaves room for a nested booking. |
| Pyth Hermes | Every public Hermes endpoint returns 401 without an API key (since 2026-08-26). The Pyth fallback is therefore optional and server-side: `PYTH_API_KEY` lives only in the Next.js route `app/api/pyth`. |
| Chainlink precedence over Pyth | `settleWithPyth` opens only at expiry + 2 hours (`maxRoundLag`), when no later Chainlink round can still qualify, and reverts with `ChainlinkRoundAvailable` if a provably first Chainlink round exists in that window. Nobody can pick whichever oracle favours their side. |

## Tooling

| Question | Measured |
|---|---|
| `forge script --broadcast` against Hashio (Foundry 1.8) | Fails with "Invalid parameter 1": forge sends `eth_getTransactionCount` with an EIP-1898 `{blockHash}` object that the relay rejects. Hedera deploys go through `packages/foundry/scripts-js/deployHedera.js`, which uses `cast send --create` and writes the same broadcast and deployment records. |
| Gas estimation through Hashio for HTS and HSS calls | Unreliable. The frontend passes explicit gas limits (`GAS` in `utils/markets/units.ts`). |
| Mirror node `topic1` filter on contract logs | Rejected unless the query has a timestamp range of at most 7 days, and `topic1` for the zero word (market 0) matched nothing even inside a valid range. Read a contract's logs unfiltered and filter by `topics[1]` on the client. |
| Mirror node exchange rate | `/api/v1/network/exchangerate` gives the rate Hedera uses for fees, with CORS and no key. The app uses it for the HBAR/USD reference price and the market creation estimate. |

## Costs to plan for

- Creating a market: two token creations (about $2 in HBAR) plus a reserve of at least 8.5 HBAR. The
  create form suggests about 33 HBAR at the testnet rate. Whatever the token fees do not use becomes
  the market's reserve, and the creator can withdraw what is left of it after the market closes.
- A stake: about 0.04 HBAR in gas, or about 0.65 HBAR for your first stake on each token
  (auto-association).
- Use a Hedera Portal testnet account (portal.hedera.com, 1000 HBAR a day). The 10 HBAR a day faucet
  cannot create a market.

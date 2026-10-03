# AGENTS.md: Predera (prediction-market template)

Scaffold-hbar template: oracle-settled binary prediction markets on Hedera. Foundry only, Next.js App Router, RainbowKit/wagmi/viem, DaisyUI. Live testnet deployment at `0x0cc41d2215C6e66caFF2C996b7FEEC162111B3d2`; frontend bindings ship pointing at it.

## Commands

```bash
yarn install
yarn next:start            # dev server on http://localhost:3000 (also yarn next:dev)
yarn foundry:account:generate
yarn foundry:account:import
yarn foundry:deploy --network hedera_testnet --keystore <name>
DEPLOYER_PRIVATE_KEY=0x... yarn foundry:e2e:testnet   # full lifecycle on testnet, 17 min to 2 h; --market <id> resumes
yarn foundry:test          # 89 forge unit tests, HTS/HSS mocked
yarn next:test             # vitest: units, feeds, status, hashscan, activity, HBAR price
yarn next:lint && yarn next:check-types && yarn next:build
yarn lint                  # next:lint + foundry:lint
```

npm users: replace `yarn <script>` with `npm run <script>`. Inside `packages/foundry`, the same entry points are unprefixed (`yarn deploy`, `yarn test`, `yarn e2e:testnet`).

## Architecture and key paths

- `packages/foundry/contracts/PredictionMarkets.sol`: the whole protocol. One contract, all markets, no owner.
- `packages/foundry/contracts/libraries/PriceMath.sol`: Chainlink/Pyth normalization to 1e18. Only payout math helper.
- `packages/foundry/contracts/interfaces/`: `IAggregatorV3`, `IPyth`, `IHederaScheduleService`, `IHtsWipe`.
- `packages/foundry/script/HelperConfig.s.sol`: feeds (HBAR/BTC/ETH, testnet + mainnet) and timing config. Single source of truth.
- `packages/foundry/script/Deploy.s.sol`: localhost deploy. Hedera deploys go through `scripts-js/deployHedera.js`.
- `packages/foundry/scripts-js/deployHedera.js`: `cast send --create` deploy, writes `broadcast/` + `deployments/`, then regenerates bindings.
- `packages/foundry/scripts-js/e2eTestnet.js`: create, stake both sides, wait for scheduled settle, redeem, withdraw reserve.
- `packages/foundry/test/`: `PredictionMarkets.t.sol`, `PriceMath.t.sol`, `HelperConfig.t.sol`, `mocks/` (etched at `0x167`/`0x16b`).
- `packages/nextjs/app/`: `page.tsx` (list), `markets/new`, `markets/[id]`, `portfolio`, `api/pyth/route.ts` (server-only Hermes proxy).
- `packages/nextjs/components/markets/`: MarketCard, StakePanel, RedeemPanel, OddsBar, Countdown, PriceChart, SettlementTimeline, ActivityPanel, States, `ui.tsx` (AssetBadge, StatusPill, OutcomeBar).
- `packages/nextjs/styles/globals.css`: both daisyUI themes (`hedera` dark default, `hedera-light`) and `--color-yes`/`--color-no`. `utils/brand.ts`: app name and the hex colors CSS cannot reach.
- `packages/nextjs/hooks/markets/`: useMarket(s), usePositions, useMarketConfig, useChainlinkHistory, useScheduleStatus, useFeedInfo, useCreationEstimate, useMarketActivity.
- `packages/nextjs/utils/markets/`: `units.ts` (unit boundary + gas limits), `feeds.ts`, `status.ts`, `mirror.ts`, `activity.ts` (event log decoder), `hashscan.ts`, `types.ts`.
- `packages/nextjs/contracts/deployedContracts.ts`: generated. Never edit by hand.

## Invariants that must hold

- State machine is `Open -> Settled | Voided`. No other transitions. `redeem` and `withdrawReserve` require Settled or Voided.
- Settlement price is the FIRST oracle price at or after expiry, on both paths. Never latest-at-expiry, never caller-chosen.
- Retries only when `msg.sender == address(this)` (scheduled call), `retriesLeft > 0`, reserve covers `retryCostEstimate`. External callers get `NoEligibleRound`, never a retry.
- A Chainlink round settles a market only when PROVEN first: the walk reaches an earlier same-phase round published before expiry. Any other walk exit (48-step bound, phase boundary, first round of a phase, missing round) means no eligible round. Never relax this to "best candidate".
- Chainlink has precedence: `settleWithPyth` only after `expiry + maxRoundLag` and only when no provably first Chainlink round exists (`ChainlinkRoundAvailable` otherwise). `settleWithPyth` uses `minPublishTime = expiry`.
- `maxRoundLag` (2h) bounds settlement rounds; `gracePeriod` (24h) gates `voidMarket`.
- A scheduled `settle` on a closed market returns without reverting (a revert is still billed). `schedulePending` tracks an unexecuted schedule; `withdrawReserve` holds back `SCHEDULED_EXECUTION_COST` while it is set.
- Payouts come from recorded pools only: `payout = amount * (yesPool + noPool) / winningPool`; Invalid outcome refunds 1:1; losers get 0. Total winner payouts never exceed the pool (fuzz-tested).
- `totalPoolLiability` (owed to traders) and `totalReserves` (sum of market reserves) are updated on every stake, redeem, reserve charge, and withdrawal. `withdrawReserve` pays at most balance surplus beyond both; underestimates land on the creator.
- Tinybar inside the contract, always. No rescaling in Solidity; conversion lives only in `utils/markets/units.ts`.
- Frontend uses explicit gas limits from `units.ts` GAS (createMarket 3M, stake 1.5M, settle/settleWithPyth 1M, redeem 800k, void/withdraw 300k). Do not rely on estimation.
- Redeem amounts in the UI come from `quotePayout` as-is (it returns 0 until settlement). The only payout math in TS is `projectedPayout` in `utils/markets/units.ts`, the pre-stake "pays if this side wins" estimate; it must stay the same formula as `quotePayout` and stay labelled as an estimate.

## Hedera gotchas

Measured on testnet; details and evidence in `docs/hedera-notes.md`. Re-measure before changing a gas limit or a fee constant.

- `forge script --broadcast` cannot reach Hashio (EIP-1898 `eth_getTransactionCount`). Deploy and e2e use `cast send`. Keep it that way.
- `msg.value` in the EVM is tinybar (8 decimals); wallets send weibar (18 decimals); the relay converts. Contract amounts, pools, reserves, and token balances are tinybar; strike and settlement prices are 1e18 fixed point.
- First stake per token per account costs ~0.65 HBAR (auto-association); later stakes ~0.04 HBAR. The UI must keep the association prompt.
- Market creation costs two HTS creations (~$1 each, ~23 HBAR at $1 = 9.61 HBAR) plus a 7 HBAR minimum reserve. Point users at the Portal faucet (1000 HBAR/day).
- Scheduled `settle` runs with 2.5M gas (constant `SETTLE_GAS`); 1.2M cannot book a nested retry. Each retry costs the reserve ~1.17 HBAR (charged 1.5 HBAR); each execution ~0.104 HBAR (charged 0.5 HBAR).
- `hedera-forking` does not emulate HSS: keep the `vm.etch` mocks for unit tests and prove scheduling on real testnet via e2e.
- HTS `burnToken` only burns from treasury, so redeem uses `wipeTokenAccount` (wipe key). No approve step exists by design.
- Never cross a Chainlink phase boundary when walking rounds (top 16 bits of round id); walk is bounded to 48 steps.
- Mirror node contract logs: never use the `topic1` query filter (needs a timestamp range of at most 7 days, and the zero word for market 0 matches nothing). Read logs unfiltered and match `topics[1]` on the client, as `useMarketActivity` does.
- Read prices and balances from the target network's mirror node and relay only. No third-party price APIs: they fail in sandboxes and log console errors that break the Harness Tier 2 gate.
- Hermes needs an API key since 2026-08-26. `PYTH_API_KEY` stays server-only in `app/api/pyth/route.ts`. The app must run fully without it.

## Safe extension points

- Feeds: `HelperConfig.s.sol` (`buildFeedKeys`, `buildFeeds`) + `FEED_KEYS` in `utils/markets/feeds.ts`. Feeds are immutable per deployment.
- Payout: `quotePayout` is the on-chain definition; extend the fuzz tests with any model change, and change `projectedPayout` in `units.ts` to match.
- Fees: skim in `stake` into reserve or a recorded balance; keep `totalPoolLiability` trader-only; update `useCreationEstimate.ts`.
- UI: `components/markets/` and `hooks/markets/`; status derivation in `utils/markets/status.ts`.
- Look and name: theme tokens in `styles/globals.css`, identity in `utils/brand.ts`. Components use semantic classes only (`bg-base-100`, `text-primary`, `bg-yes`, `.panel`); never hard-code hex in a component.

## How to verify a change

1. `yarn foundry:test` (expect 89 passing, 100 percent line coverage).
2. `yarn next:lint`, `yarn next:check-types`, `yarn next:test`, `yarn next:build`.
3. Touching settlement, scheduling, units, or reserve accounting: run `DEPLOYER_PRIVATE_KEY=0x... yarn foundry:e2e:testnet` on testnet.
4. Touching `.harness/` behavior: `yarn harness:validate` (Tiers 0 to 2).

## What not to do

- No owner, no admin, no pauser. Do not add privileged roles.
- No `delegatecall` to `0x16b`. Scheduled calls are direct CALLs from the contract.
- No `forge script --broadcast` to Hashio. Use the `cast send` path in `scripts-js/`.
- No Pyth key (or any secret) in client code or `NEXT_PUBLIC_` vars.
- No hand edits to `deployedContracts.ts`. Regenerate via deploy.
- No frontend payout math for redeem amounts. Read `quotePayout`. `projectedPayout` is the single, tested exception.
- No mainnet deploy without an audit. Mainnet addresses in `HelperConfig` are reference only.

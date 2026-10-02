# Spec: Oracle-Settled Prediction Markets (scaffold-hbar template)

Working repo name: `template-hedera-prediction-market`. The owner is a placeholder until submission.

Status: ready-for-agent. No issue tracker exists yet; this file moves into the template repo and becomes a GitHub issue once the repo is created.

## Problem Statement

A developer who wants to build a price prediction market on Hedera starts from nothing. They have to work out several things alone:

- how to create HTS tokens from a contract;
- how to make a contract settle itself at a future time without running a keeper bot;
- which oracle to read at settlement, and what to do when that oracle is stale;
- how Hedera's tinybar units differ from the weibar units that wallets and JSON-RPC use;
- how to show all of this in a Next.js dApp with links to Hashscan.

None of the eight built-in scaffold-hbar templates covers this pattern, and none of the roughly 65 community submissions does either. Most developers give up or ship a version that depends on an off-chain cron job.

## Solution

One command, `npm create scaffold-hbar@latest -- --template <owner>/template-hedera-prediction-market`, gives the developer a working binary prediction market on Hedera testnet:

- Anyone creates a market such as "HBAR/USD ≥ $0.30 at 2026-10-20 12:00 UTC".
- Traders stake HBAR on YES or NO and receive HTS position tokens.
- At creation, the contract books its own settlement as a HIP-1215 scheduled contract call. At expiry the network executes it, the contract reads a Chainlink push feed, and the market settles. No bot, no keeper.
- If the scheduled settlement fails or the push feed is stale, anyone can settle permissionlessly with a Pyth price update for the exact expiry time.
- If neither oracle path settles the market within a grace period, anyone can void it and every trader is refunded.
- Winners redeem their position tokens for a pro-rata share of the pool.

The docs explain each Hedera-specific decision, so the developer understands the pattern and can extend it.

## User Stories

### Developer: scaffolding and setup

1. As a developer, I want to scaffold the template with one `npm create scaffold-hbar` command, so that I can start without cloning or copying files by hand.
2. As a developer, I want to pick yarn or npm during scaffolding and have both work, so that I can use my preferred package manager.
3. As a developer, I want a `.env.example` that lists every variable with a description, so that I know exactly what to configure.
4. As a developer, I want a prerequisites list with exact versions (Node, Foundry, testnet account), so that setup does not fail halfway.
5. As a developer, I want one command that deploys the contracts to testnet and regenerates the frontend contract bindings, so that the UI always matches the deployment.
6. As a developer, I want the deploy step to fund the contract for scheduled settlement gas, so that the first market I create can settle itself.
7. As a developer, I want install, lint, type-check, build and test to pass on a fresh scaffold, so that I trust the template before I change it.
8. As a developer, I want a scripted end-to-end testnet run that creates a short market, stakes both sides, waits for scheduled settlement and prints Hashscan links, so that I can see the whole lifecycle work on a real network in minutes.
9. As a developer, I want the README to explain the architecture with a diagram, so that I understand how the contract, the oracles, the schedule service and the frontend fit together.
10. As a developer, I want a troubleshooting section that covers the common Hedera failures (no schedule capacity, token not associated, stale feed, tinybar versus weibar mistakes), so that I can fix problems without asking for help.
11. As a developer using an AI coding agent, I want an AGENTS.md that lists commands, key modules, invariants and safe extension points, so that the agent can extend the template without breaking settlement.
12. As a developer, I want a `.harness/` recipe with validators, so that I can let Hedera Harness build new features and check them against the same gate.
13. As a developer, I want clear extension guides (add a price feed, change the payout model, add a fee), so that I can adapt the template to my product.
14. As a developer, I want every oracle and network address in one config place with its source, so that I can verify and update them.
15. As a developer, I want mainnet addresses present but clearly labelled unaudited and educational, so that I do not deploy to mainnet by accident.

### Market creator

16. As a market creator, I want to choose a price feed from a list (HBAR/USD, BTC/USD, ETH/USD), so that I only create markets the oracles can settle.
17. As a market creator, I want the strike field prefilled with the live price, so that I can set a sensible strike quickly.
18. As a market creator, I want to set the expiry with a date and time picker that enforces the allowed minimum and maximum horizon, so that my market can actually be scheduled.
19. As a market creator, I want to see the exact HBAR cost of creating a market (token creation plus settlement gas reserve) before I sign, so that I am not surprised.
20. As a market creator, I want creation to fail with a clear message when the network has no schedule capacity at my expiry, so that I can pick another time.
21. As a market creator, I want a link to the created market, its two HTS tokens and its schedule entity on Hashscan, so that I can verify everything on-chain.

### Trader

22. As a trader, I want to browse open, closing, settled and voided markets, so that I can find markets to trade or redeem.
23. As a trader, I want to see each market's YES and NO pool sizes and implied odds, so that I can judge the price.
24. As a trader, I want a countdown to the trading cutoff and to expiry, so that I know how long I can still trade.
25. As a trader, I want to stake HBAR on YES or NO and receive position tokens 1:1 in tinybar units, so that my position is a real, transferable HTS token.
26. As a trader, I want the app to detect when my account is not associated with a position token and offer a one-click association, so that my stake does not fail.
27. As a trader, I want a quote of my payout if my side wins, read from the contract, so that the number I see is the number I get.
28. As a trader, I want trading to stop at a cutoff before expiry, so that nobody can trade on a price that is already known.
29. As a trader, I want to see my positions across markets, so that I know what I hold and what I can redeem.
30. As a trader, I want to transfer my position tokens like any HTS token, so that my position is not locked in this app.

### Settlement and redemption

31. As a trader, I want the market to settle itself at expiry through the scheduled call, so that settlement does not depend on anyone being online.
32. As a trader, I want to see the schedule status (pending, executed, failed) with a mirror node and Hashscan link, so that I can verify the settlement happened as promised.
33. As any user, I want a "settle with Pyth" action when a market is past expiry and still unsettled, so that a failed schedule or stale feed does not block the market.
34. As any user, I want the Pyth fallback to use the price published at expiry, not the price at the time I settle, so that a late settler cannot pick a favourable price.
35. As any user, I want to void a market that nobody settled within the grace period, so that funds are never stuck.
36. As a winning trader, I want to redeem my winning tokens for my pro-rata share of the total pool, so that I collect my winnings.
37. As a trader in a voided market, or in a market where one side had no stake, I want a 1:1 refund for any position token, so that I get my HBAR back.
38. As a trader, I want to see which oracle settled a market, the settlement price and its timestamp, so that I can audit the outcome.

### Judge and reviewer

39. As a reviewer, I want a mirror node or Hashscan link to a real testnet settlement in the README, so that I can verify the template works without running it.
40. As a reviewer, I want every core route to load without a connected wallet, so that the app is reviewable in seconds.
41. As a reviewer, I want CI to scaffold a fresh copy from the repo and run install, lint, build and tests with both package managers, so that I can see the gate passes.

## Implementation Decisions

### Base and dependencies

- The base is the official scaffold-hbar blank template, obtained through the official generator. We do not hand-write the Next.js app or the Foundry package. The blank template already provides what create-scaffold-hbar and the judges expect: the `@sh/*` workspaces, the scaffold hooks, deployed-contract binding generation and the Hedera chain config. Starting from `create-next-app` would throw all of that away.
- Foundry only. `template.json` declares `solidityFramework: ["foundry"]`, both package managers, the `nextjs-app` frontend, and every env var with a description.
- Dependencies move to the latest stable version that stays compatible. Each upgrade must keep a fresh scaffold passing install, lint, build and test with npm and with yarn. If an upgrade breaks that, it is reverted. Known constraints on 2026-10-02:
  - RainbowKit 2.2.11 (latest) requires wagmi ^2, so wagmi stays on the latest 2.x, not 3.7.
  - Next 16.3, TypeScript 7 and ESLint 10 are each a major jump from the blank template (Next 15, TS 5, ESLint 9). Each is tried separately and kept only if the matrix passes.
  - Foundry 1.8.x, OpenZeppelin 5.6, the latest Pyth Solidity SDK and the latest @hiero-ledger/sdk are adopted.
- PWA: a web app manifest and icons only, using Next's built-in manifest support. There is no service worker and no offline mode. A wallet dApp needs the network anyway, and a service worker that caches stale bundles is a real risk for "app boots and core routes return OK". The manifest earns installability and polish at almost no risk.

### Contract module: PredictionMarkets

- One contract holds every market. It is the treasury and the supply key for all position tokens. One contract, rather than a contract per market, keeps creation cheap and lets every scheduled call target the same address.
- Market fields: feed key, strike (normalised to 1e18), comparison (price ≥ strike means YES), trading cutoff, expiry, YES token, NO token, YES pool, NO pool, state, settlement price, settlement source, settlement timestamp, schedule address.
- States:

  ```
  Open --(cutoff passes)--> Closed --(expiry, settle)--> Settled
                                  \--(grace passes, void)--> Voided
  ```

- Settlement rule, the same for both oracles: **the first oracle price published at or after expiry.** "Latest price at expiry" is rejected because testnet Chainlink feeds update only every 3 to 46 minutes (measured 2026-10-02). The latest price at expiry often exists before the trading cutoff, so traders could know the outcome early.
- `createMarket` (payable):
  - validates the feed and the expiry bounds;
  - creates YES and NO HTS fungible tokens through the HTS precompile. Each has 8 decimals to match tinybar, the contract as treasury, and the contract as supply key and wipe key. Every response code must equal SUCCESS (22).
  - checks `hasScheduleCapacity` and books `scheduleCall(this, expiry + settlementDelay, gasLimit, 0, settle(marketId))` through the Hedera Schedule Service system contract. The call is a direct CALL from a non-proxy contract, never a DELEGATECALL (testnet issue hiero-consensus-node #27263).
  - stores the schedule address.
  The creator's payment covers the token creation fees. Whatever remains becomes that market's **settlement reserve**. Nothing is refunded, so there is no failure path for receivers that require a signature.
- `stake(marketId, outcome)` (payable): only while Open. Mints position tokens equal to `msg.value` (tinybar inside the EVM) and transfers them to the staker. It reverts with a custom error if the staker is not associated with the token.
- `settle(marketId)`: callable by the scheduled transaction or by anyone after expiry. It walks back from the latest Chainlink round to the first round with `updatedAt >= expiry`, bounded to 48 steps. The spike verified that round walking works on the testnet feed.
  - If no round exists after expiry yet, the call **reschedules itself** for `+retryDelay` from the market's reserve, up to `maxRetries`. It does not revert. This self-healing HIP-1215 loop is a showcase feature.
  - When retries run out, the market waits for the Pyth fallback.
- `settleWithPyth(marketId, updateData)` (payable): callable by anyone after expiry while the market is neither settled nor voided, including after the grace period. It uses `parsePriceFeedUpdatesUnique` with `minPublishTime = expiry`, so the only accepted price is the first Pyth update at or after expiry, and the caller cannot pick one. It pays the Pyth update fee from `msg.value`.
- `void(marketId)`: anyone, after expiry plus a long grace period (24h default), while unsettled. Winners get the whole grace period to settle through Pyth. The README documents the remaining race at the grace boundary.
- `redeem(marketId, amount)`: only the holder redeems their own tokens. The contract **wipes** them from the caller with its wipe key, because HTS `burnToken` only burns from the treasury. Then it pays HBAR. This takes one transaction, with no approve step.
  - Settled market: a winning token pays its pro-rata share of the total pool, and a losing token pays nothing.
  - Voided market, or a market where one side had no stake: every token refunds 1:1.
  - Payouts come from recorded pool accounting, never from `address(this).balance`. Each market's scheduled-call gas comes from its own reserve, so gas can never drain the pools. An invariant test enforces this.
  - Rounding dust stays in the contract and is documented.
- Views: `quotePayout(marketId, outcome, amount)`, `getMarket`, `marketCount`. The frontend shows contract quotes and never re-implements payout math.
- Oracle access goes through a small price-source interface (normalised price plus timestamp) with Chainlink and Pyth adapters. The pattern resembles the built-in oracles template, but the code is original.
- Custom errors and events cover every state change, so the frontend and the mirror node can index them.
- Value units: inside the EVM, `msg.value` and balances are tinybar (8 decimals). The JSON-RPC relay converts the weibar (18 decimals) that wallets send. The contract never rescales. The frontend converts at one boundary. The spike measures this. The docs call out the tinybar versus weibar difference explicitly.
- Expiry bounds: a minimum (a few minutes, so the demo is fast) and a maximum that comes from the network's schedule horizon. Reported default horizon is 62 days, which the spike verifies. Planned bounds: 5 minutes to 60 days.

### Frontend module (Next.js, blank template stack)

- Routes:
  - `/`: market list with filters by state.
  - `/markets/new`: create form, with the live price from Pyth Hermes as the strike default.
  - `/markets/[id]`: pools, odds, countdowns, stake YES/NO, association prompt, payout quote, schedule status, fallback settle, void, redeem.
  - `/portfolio`: positions across markets.
  - the blank template's debug page.
- Reads go through the blank template's scaffold hooks. Schedule status and event history come from the mirror node REST API.
- Every on-chain entity links to Hashscan: market transaction, tokens, schedule, settlement transaction.
- Every route renders without a wallet. Wallet hooks are guarded, so prerendering never crashes.
- Visual design: Tailwind CSS 4 + DaisyUI 5, as in the blank template. A design pass with `/design-shotgun` comes before the page build: three or four directions for the market detail page, the user picks one, and it becomes the theme. Signature elements: a live YES/NO odds bar, a countdown to expiry, a settlement timeline (scheduled, retried, settled) with Hashscan links, and a Pyth price chart with the strike line. Dark and light themes, mobile layout, loading skeletons, clear error states.
- Test mode: the blank template's burner wallet can be enabled for testnet behind an env flag that is off by default. Headless browser tests then sign real testnet transactions without MetaMask.

### Scripts and tooling

- A deploy script (keystore based, as in the blank template) deploys PredictionMarkets, funds the settlement reserve and regenerates bindings.
- An end-to-end testnet script creates a five-minute market, stakes both sides from the deployer, waits, verifies the scheduled settlement through the mirror node, redeems, and prints Hashscan links. Its output is the gate's testnet transaction evidence. It is also the Harness Tier 3.5 check.
- CI: on every push, scaffold a fresh copy from the repo with npm and with yarn, then run install, lint, type-check, build and contract tests.

### Harness (after features are done)

- `.harness/` ships a spec (schemaVersion 2), PRDs, Tier 0-1 static and command validators, a Tier 2 Playwright smoke test over the core routes, and Tier 3.5 chain validation that reuses the end-to-end script.
- One feature is held back on purpose and built through `hedera-harness run`: the market activity history panel fed by the mirror node. This makes the Harness usage real. If the run stalls, the README states that only the validators were used.

### Docs

- README: what it is, a one-command quick start, prerequisites, env vars, an architecture diagram, the market lifecycle, oracle design (push versus pull, and why the scheduled path uses push), HIP-1215 scheduling, tinybar units, the testnet evidence link, troubleshooting, extension guides, a disclaimer, licence.
- AGENTS.md: commands, the module map, invariants (state machine, units, settlement windows), safe extension points, the Harness usage.
- MIT licence.

## Testing Decisions

- A good test drives the external interface and checks observable outcomes: balances, token supply, state, events, reverts. It never inspects private state or mirrors the implementation.
- Seam 1 (primary): the PredictionMarkets external interface, tested with Foundry.
  - Unit tests cover the whole state machine. Every revert path has a test. Payout and refund math is checked with fuzz tests, including the invariant that total payouts never exceed the pool.
  - The Hedera Schedule Service is replaced with a mock installed through `vm.etch`, because hedera-forking does not emulate it. Prior art: the payments-scheduler built-in template's schedule service mock.
  - The oracles use a Chainlink aggregator mock and MockPyth from the Pyth SDK. Prior art: the oracles built-in template's unit tests.
  - HTS token creation and transfers are tested in fork tests with hedera-forking against testnet, kept in a separate profile. Prior art: the blank template's HTS fork test.
- Seam 2: the end-to-end testnet script. It is the only proof that HIP-1215 really executes the settlement. It runs on demand and in Harness Tier 3.5, not on every CI push, because it spends testnet HBAR.
- Seam 3: route smoke with Playwright through Harness Tier 2. Every core route returns OK and renders its main heading without a wallet.
- No frontend unit tests for payout math, because the frontend shows the contract's own quotes. That removes the seam instead of testing it.

## Out of Scope

- Trading positions on an AMM or order book. Positions are HTS tokens, so the docs mention SaucerSwap listing as an extension, but the template does not build it.
- Markets with more than two outcomes, and non-price events (sports, elections). These would need an optimistic oracle.
- Protocol fees and creator rewards. There is an extension guide only.
- HashPack or HashConnect wallets. There is a README pointer only.
- Mainnet deployment, Hardhat support, and offline PWA behaviour (service worker).
- Cross-chain markets and governance.

## Further Notes

- Feasibility spike first, capped at 2 hours, before any feature work. It must confirm on testnet:
  1. `scheduleCall` from the contract executes `settle` on time, and a scheduled call can schedule the next retry;
  2. the maximum schedule horizon;
  3. the HTS creation fee when paid from a contract, and that wiping with the wipe key works on a holder;
  4. `msg.value` units inside the EVM;
  5. which balance pays for scheduled-call gas, and how much;
  6. Chainlink round walking (already confirmed read-only on 2026-10-02).
- Review log: the 2026-10-02 adversarial review by agy (Gemini) found 18 issues. Adopted: oracle freshness, burn only from treasury, gas draining the pools, Pyth price cherry-picking, the void race, surplus refunds. Rejected after checking:
  - "Next 16.3 / TS 7 / ESLint 10 do not exist": npm shows they do.
  - "Divide `msg.value` by 1e10": the relay already converts to tinybar. The spike measures this.
- Competition context: about 65 submissions exist, and none is a prediction market. The nearest is a put-style cover product with weak tests. The strongest submissions set the bar at Harness plus a fresh-scaffold CI gate plus dozens of tests.
- Rubric mapping:
  - ecosystem (35): oracles are load-bearing, with two oracle models composed deliberately;
  - docs (30): the README and AGENTS.md above;
  - code (20): one contract, custom errors, fuzz tests;
  - Hedera depth (15): HTS created from a contract, plus HIP-1215 self-scheduling, plus mirror node.
- Deadline: Sun 2026-10-04 23:59 ET, which is Mon 09:44 NPT. Feature freeze is Sun 09:44 NPT.

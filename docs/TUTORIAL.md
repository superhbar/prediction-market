# Tutorial: from scaffold to your own prediction market

This walks you from an empty directory to a modified, tested and deployed version of the template. You will:

1. Scaffold the template and run it against the shipped testnet deployment.
2. Follow one market through its whole life and see which Hedera service does each step.
3. Add a 1% creator fee to every stake: contract, config, test, frontend.
4. Deploy your version to testnet and prove it with the end-to-end script.

Plan about an hour, plus the time testnet takes to settle a market. You need Node.js 20.18.3 or later, Foundry for part 3 onward, and a testnet account funded from the [Hedera Portal](https://portal.hedera.com) (1000 HBAR per day).

## 1. Scaffold and run

```bash
npm create scaffold-hbar@latest -- --template superhbar/prediction-market
cd <the project name you chose>
yarn next:dev
```

If you picked npm when scaffolding, use `npm run next:dev` and replace `yarn <script>` with `npm run <script>` everywhere below.

Open http://localhost:3000. Nothing is deployed yet and the app still works: `packages/nextjs/contracts/deployedContracts.ts` ships pointing at the live testnet contract, so you see real markets, prices and activity straight away. Connect a wallet on Hedera testnet (chain id 296, RPC `https://testnet.hashio.io/api`) to trade.

## 2. Follow one market through its life

Create a market from **Create market** in the header. Pick HBAR, keep the suggested strike (the current Chainlink price) and set expiry a few minutes ahead. The form shows what creation costs before you sign.

| You see | What happened on Hedera | Where in the code |
|---|---|---|
| Create market confirms | The contract created two HTS tokens (YES and NO) with itself as treasury, supply key and wipe key, then booked its own `settle` call with the Schedule Service (HIP-1215) for 10 minutes after expiry. | `createMarket` in `packages/foundry/contracts/PredictionMarkets.sol` |
| You stake 1 HBAR on YES | Your HBAR joined the YES pool, the contract minted 1 YES token and sent it to you. The first stake per token also associates your account with it (about 0.65 HBAR, once). | `stake`; association prompt in `components/markets/StakePanel.tsx` |
| The countdown hits zero | Staking stops. YES and NO tokens keep changing hands on SaucerSwap, in the market page's Trade tab, until the market settles. | `components/markets/PositionCard.tsx`, `TradePanel.tsx` |
| "Resolving" appears | The network ran the booked call. It looks for the first Chainlink round published at or after expiry; when there is none yet, it books the next check from the market's reserve. | `settle`, `_eligibleChainlinkRound` |
| "Settled YES" or "Settled NO" | A scheduled check found a round it could prove is the first after expiry and closed the market on it. | `settle`, `chainlinkSettlementRound` |
| You redeem | The contract wiped your tokens with its wipe key and paid `quotePayout`. No approve step. | `redeem`, `components/markets/RedeemPanel.tsx` |
| The creator withdraws | What is left of the reserve after scheduled-call fees goes back to the creator. | `withdrawReserve` |

The **Activity** panel on the market page decodes every one of these events from the mirror node and links each to Hashscan, including the scheduled calls the network made on the contract's behalf. Testnet Chainlink feeds publish only on price movement or a heartbeat, so a quiet feed can keep a market in "Resolving" for a while. The README's [Pyth fallback and voiding](../README.md#pyth-fallback-and-voiding) section covers what happens if no round arrives.

## 3. Add a 1% creator fee

Goal: every stake pays 1% to the market creator. The fee goes into the market's reserve, which the creator already withdraws after settlement, so no new payout path or transfer is needed and the pool accounting stays as it is.

### 3.1 Contract

In `packages/foundry/contracts/PredictionMarkets.sol`, add the fee to the deployment config. The `Config` struct sits above the contract:

```solidity
struct Config {
    // ...existing fields...
    uint256 retryCostEstimate;
    uint16 creatorFeeBps;
}
```

Store it as an immutable next to the other config values, and set it in the constructor:

```solidity
/// @notice Share of each stake paid to the market creator, in basis points (100 = 1%).
uint16 public immutable creatorFeeBps;
```

```solidity
retryCostEstimate = cfg_.retryCostEstimate;
creatorFeeBps = cfg_.creatorFeeBps;
```

In `stake`, split `msg.value` into the fee and the part that is staked. Only the staked part mints tokens, joins a pool and counts as owed to traders:

```solidity
uint256 fee = (msg.value * creatorFeeBps) / 10_000;
uint256 staked = msg.value - fee;
if (staked == 0) revert ZeroStake();
// forge-lint: disable-next-line(unsafe-typecast)
int64 amount = int64(uint64(staked));

// ...mint and transfer `amount` exactly as before...

if (yes) {
    m.yesPool += staked;
} else {
    m.noPool += staked;
}
totalPoolLiability += staked;
m.reserve += fee;
totalReserves += fee;
emit Staked(marketId, msg.sender, yes, staked);
```

Why these lines and not others:

- `totalPoolLiability` must stay "HBAR owed to traders" and nothing else. `withdrawReserve` relies on it to never pay out HBAR that belongs to a pool.
- `m.reserve` and `totalReserves` move together. The reserve already pays for scheduled calls, so a busy market's fees also make its retries safer.
- `quotePayout` and `redeem` do not change: they read the pools, and the pools now hold only staked HBAR.

### 3.2 Config

Set the fee in `buildConfig` in `packages/foundry/script/HelperConfig.s.sol`, the single source of deploy settings:

```solidity
retryCostEstimate: 1.5e8,
creatorFeeBps: 100
```

### 3.3 Tests

The two `Config({...})` literals in `packages/foundry/test/PredictionMarkets.t.sol` now need the new field. Give them `creatorFeeBps: 0`, so every existing test keeps its exact numbers. Then add a test that deploys with the fee on:

```solidity
function test_Stake_CreatorFeeGoesToReserve() public {
    Config memory feeCfg = Config({
        settlementDelay: 5 minutes,
        retryDelay: 10 minutes,
        maxRetries: 2,
        maxRoundLag: 2 hours,
        gracePeriod: 24 hours,
        minDuration: 5 minutes,
        maxDuration: 60 days,
        minReserve: MIN_RESERVE,
        retryCostEstimate: RETRY_COST,
        creatorFeeBps: 100
    });
    bytes32[] memory keys = new bytes32[](1);
    keys[0] = HBAR;
    Feed[] memory feedsList = new Feed[](1);
    feedsList[0] = Feed({ chainlink: address(hbarFeed), pythId: PYTH_HBAR_ID });
    pm = new PredictionMarkets(keys, feedsList, address(pyth), feeCfg);
    uint256 marketId = _createMarket();
    uint256 reserveBefore = pm.getMarket(marketId).reserve;

    _stakeAs(ALICE, marketId, true, 10e8);

    PredictionMarkets.Market memory m = pm.getMarket(marketId);
    assertEq(m.yesPool, 9.9e8);
    assertEq(hts.balanceOf(m.yesToken, ALICE), 9.9e8);
    assertEq(m.reserve, reserveBefore + 0.1e8);
    assertEq(pm.totalPoolLiability(), 9.9e8);
}
```

Amounts are tinybar (1e8 = 1 HBAR) because that is what `msg.value` is inside Hedera's EVM. Run the suite and check the contract size:

```bash
yarn foundry:test
cd packages/foundry && forge build --sizes | grep PredictionMarkets
```

All tests pass, including the payout fuzz tests, which still prove winners never receive more than the pool. The contract grows to about 24,470 bytes. The limit is 24,576, so this contract has little room left: for the next feature, move logic into a library (as `PriceMath` does) before adding more.

### 3.4 Frontend

Stakers should see that 1% goes to the creator. Add a pure helper to `packages/nextjs/utils/markets/units.ts`, next to `projectedPayout`:

```ts
/** The part of a stake that mints tokens and joins the pool, after the creator fee. */
export function stakeAfterFee(amount: bigint, feeBps: bigint): bigint {
  return amount - (amount * feeBps) / 10_000n;
}
```

Read the fee with the rest of the config in `hooks/markets/useMarketConfig.ts`: add `"creatorFeeBps"` to the list of function names, take it from the results, and return `creatorFeeBps: BigInt(creatorFeeBps)` (viem returns small integer types as `number`). Add `creatorFeeBps: bigint` to `MarketConfig` in `utils/markets/types.ts`.

In `components/markets/StakePanel.tsx`, pass the staked part into the preview, and show the token count the same way:

```tsx
const staked = amountTinybar !== undefined && config ? stakeAfterFee(amountTinybar, config.creatorFeeBps) : undefined;
// "You receive": formatHbar(staked) tokens
// "Pays if YES wins (estimate)": projectedPayout(staked, sidePool, otherPool)
```

Add a case to `units.test.ts` (`stakeAfterFee(10n * 10n ** 8n, 100n)` is `990_000_000n`) and run `yarn next:test`. Redeem amounts need no change: they come from the contract's `quotePayout`.

## 4. Deploy and prove it

```bash
yarn foundry:account:generate      # or yarn foundry:account:import
yarn foundry:deploy --network hedera_testnet --keystore <name>
```

The deploy script regenerates `deployedContracts.ts`, so the frontend switches to your contract on the next reload; your fee shows in the stake panel. Then run the lifecycle against your contract:

```bash
DEPLOYER_PRIVATE_KEY=0x... yarn foundry:e2e:testnet
```

It creates a market, stakes both sides, opens and trades a SaucerSwap pool, waits for the scheduled settlement, redeems and withdraws the reserve, printing a Hashscan link for every step. With your fee, the reserve it withdraws is larger by 1% of the stakes. Keep those links: they are your proof that the change works on Hedera, not only in a mocked test.

## Where to go next

- [Add a price feed](../README.md#add-a-price-feed): one Solidity function and one TypeScript constant.
- [Change the payout model](../README.md#change-the-payout-model): keep `quotePayout` the single definition and extend the fuzz test.
- [docs/hedera-notes.md](hedera-notes.md): measured costs and behaviours to check before changing a gas limit or fee constant.
- `AGENTS.md`: the invariants a coding agent must not break, if you continue with one.

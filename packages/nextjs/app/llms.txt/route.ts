import { BRAND } from "~~/utils/brand";
import { primaryDeployment } from "~~/utils/markets/serverReads";
import { GAS } from "~~/utils/markets/units";

/** Plain-text guide for LLM agents: what the app is, where the contract lives, and how to use it safely. */
export function GET(request: Request) {
  const origin = new URL(request.url).origin;
  const { chain, contract } = primaryDeployment();
  const text = `# ${BRAND.name}

> Oracle-settled binary prediction markets on Hedera. Each market asks whether a Chainlink price
> (HBAR/USD, BTC/USD or ETH/USD) will be at or above a strike at expiry. Stakes are parimutuel and
> are represented by HTS position tokens. Settlement is booked by the contract itself through the
> Hedera Schedule Service and uses the first oracle price published at or after expiry.

## Deployment

- Network: ${chain.name} (chain id ${chain.id})
- PredictionMarkets contract: ${contract.address}
- No owner, admin or pauser.

## Read (no wallet needed)

- ${origin}/api/markets?limit=24 : newest markets first, with pools, status and settlement.
- ${origin}/api/markets/{id} : one market plus what one YES or NO token redeems for now (from quotePayout).
- Amounts are given as tinybar strings (exact) and HBAR decimal strings. 1 HBAR = 100,000,000 tinybar.
- Prices are decimal USD strings. On chain they are 1e18 fixed point.

## Write (contract calls; send with explicit gas, do not rely on estimation)

- stake(marketId, yes) payable, gas ${GAS.stake}: value is the stake. Wallets send weibar (18 decimals); the contract sees tinybar.
- settle(marketId), gas ${GAS.settle}: anyone, once chainlinkSettlementRound(marketId) reports an eligible round (the provably first Chainlink round at or after expiry, published within maxRoundLag).
- redeem(marketId, yes, amount), gas ${GAS.redeem}: after settlement or void. Burns \`amount\` of your YES (yes = true) or NO tokens and pays quotePayout(marketId, yes, amount); no approve step.
- withdrawReserve(marketId), gas ${GAS.withdrawReserve}: the creator, after settlement or void, takes back what is left of the reserve.
- voidMarket(marketId), gas ${GAS.voidMarket}: anyone, once expiry + grace period has passed without settlement.
- createMarket(feedKey, strike, expiry) payable, gas ${GAS.createMarket}: costs two HTS token creations plus a settlement reserve.

## Rules an agent must respect

- Redeem amounts come only from quotePayout. Any pre-stake payout figure is an estimate.
- The first stake or buy of a token auto-associates it (about 0.65 HBAR once). An account with no free automatic association slots must first call associate() on the token address itself (HIP-719), gas ${GAS.associate}.
- Staking stops at expiry. Position tokens trade on SaucerSwap V1 (WHBAR token pairs) until settlement.

## Source

- Template: https://github.com/superhbar/prediction-market (README.md, AGENTS.md, docs/TUTORIAL.md)
`;
  return new Response(text, { headers: { "content-type": "text/plain; charset=utf-8" } });
}

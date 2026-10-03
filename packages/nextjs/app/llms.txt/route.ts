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
- settle(marketId), gas ${GAS.settle}: anyone, once a Chainlink round at or after expiry exists.
- redeem(marketId), gas ${GAS.redeem}: after settlement or void. Pays quotePayout; no approve step.
- voidMarket(marketId), gas ${GAS.voidMarket}: anyone, once expiry + grace period has passed without settlement.
- createMarket(feedKey, strike, expiry) payable, gas ${GAS.createMarket}: costs two HTS token creations plus a settlement reserve.

## Rules an agent must respect

- Redeem amounts come only from quotePayout. Any pre-stake payout figure is an estimate.
- The first stake per token per account associates the token (about 0.65 HBAR once).
- Trading stops at expiry. Position tokens can also be traded on SaucerSwap V1 before settlement.

## Source

- Template: https://github.com/superhbar/prediction-market (README.md, AGENTS.md, docs/TUTORIAL.md)
`;
  return new Response(text, { headers: { "content-type": "text/plain; charset=utf-8" } });
}

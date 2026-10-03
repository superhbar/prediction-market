# Foundry package (PredictionMarkets)

Solidity contracts, deploy scripts, and tests for the prediction market template.

The full guide (quick start, deploy, environment variables, architecture, troubleshooting) lives in the [root README](../../README.md). Contract details and agent instructions live in [AGENTS.md](../../AGENTS.md).

## Commands (run from the repo root)

```bash
yarn foundry:test          # 88 forge unit tests, HTS/HSS mocked
yarn foundry:deploy --network hedera_testnet --keystore <name>
DEPLOYER_PRIVATE_KEY=0x... yarn foundry:e2e:testnet   # full lifecycle on testnet, ~17 min
```

Inside this package the same entry points are unprefixed (`yarn test`, `yarn deploy`, `yarn e2e:testnet`).

## Notes

- Hedera deploys go through `scripts-js/deployHedera.js` (`cast send --create`), not `forge script --broadcast`. See the root README for why.
- Live testnet deployment: `0x0cc41d2215C6e66caFF2C996b7FEEC162111B3d2`.

# Scaffold-HBAR Template Bounty: Plan

## Context

Hedera bounty: build one public repo that works as an external scaffold-hbar template
(`npm create scaffold-hbar@latest -- --template <org>/<repo>`). Five $2,000 prizes go to the top
scores among templates that pass a mechanical gate. Submissions close **Sun 2026-10-04 23:59 ET**.
Today is Fri 2026-10-02. User is solo, near full-time, has a funded testnet account, is registered.
Repo goes under an org.

Rubric (100): ecosystem integration, load-bearing 35 / docs 30 / code quality 20 / Hedera service depth 15.
Docs + code = 50 points, so execution quality beats idea novelty. ~30+ competitors already exist.

## Eligibility gate (all required, fail = zero)

1. Scaffolds cleanly via `npm create scaffold-hbar@latest -- --template owner/repo`
2. `template.json` present and valid (zod schema, `create-scaffold-hbar/src/types.ts:110-166`)
3. `README.md` and `AGENTS.md` present
4. Install, lint, build pass clean from fresh scaffold (test both npm and yarn)
5. App boots, core routes return 200
6. Hedera service in play + verifiable testnet tx + Hashscan/mirror link
7. No committed secrets, no `.env`
8. MIT licence, original work
9. Harness spec + validators submitted (we use Harness, so required)

## Template constraints learned from create-scaffold-hbar (csh) source

- Fork the blank template layout (`hedera-dev/scaffold-hbar#templates/blank-template`).
- Workspaces named `@sh/<word>`; dirs exactly `packages/{foundry,hardhat,nextjs}`.
- npm mode deletes `.yarnrc.yml`, `.yarn`, `yarn.lock`, `.husky`, and `postinstall`/`precommit` scripts.
  Rewrites yarn to npm only in `.md .json .js .ts .yml` etc, NOT `.tsx .sol Makefile .toml .sh`.
  Installs with `npm install --legacy-peer-deps`.
- Yarn 3.2.3, `nodeLinker: node-modules`.
- Foundry `lib/` stripped then reinstalled: every remapped lib needs a `.gitmodules` URL + `foundry.lock` tag.
- `template.json` `envVars` overwrite root `.env.example`; file deleted after scaffold.
- `.harness/` is copied and preserved; root `harness:*` scripts + `hedera-harness` devDep survive.
- Local test of scaffold: `CREATE_SCAFFOLD_HBAR_TEMPLATE_DIR=<path>`.
- HTS testable via `hashgraph/hedera-forking` fork tests; HSS (0x16b) is NOT emulated, use `vm.etch` mock
  for unit tests + real testnet runs (pattern: payments-scheduler `test/mocks/MockHederaScheduleService.sol`).
- No built-in template ships `.harness/`. We would be first: differentiator with DevRel judges.

## Competitor landscape (65 submissions as of 2026-10-02)

- Crowded: HCS provenance/receipts (~15), payments/checkout (~10), AI agent (~8), x402/MCP (4),
  SaucerSwap utilities (5), oracle escrow (5), RWA/ATS (6), lending/vault (4), HSS cron/DCA/limit (4).
- Strongest: Nocturne (HIP-1215 cron, 174 tests, harness, "landmines" doc), launchblocks (launchpad,
  59 tests, harness, CI scaffold gate), verifiable-settlement (95 tests), saucerswap-limit-orders, ats-finance.
- Quality bar is real: top 5 have harness + CI fresh-scaffold gate + dozens of tests.
- Empty niches: prediction market, bonding curve, token-gated storage, streaming, NFT royalties,
  liquid staking, on-Hedera DAO treasury trading SaucerSwap/Bonzo, LayerZero OApp beyond bridge.

## Settled decisions (grilling round 1, 2026-10-02)

- Use-case rule: hybrid. Heavily used ecosystem protocol, uncrowded use case.
- Harness: real use, but AFTER features are done (user call). Runs one post-feature increment,
  ships `.harness/` spec + Tier 0-2 + 3.5 validators. Fallback: validators only, stated in README.
- Foundry only. yarn + npm both, both tested from fresh scaffold. No yarn commands in `.tsx`.
- Wallet: blank template stack (RainbowKit + wagmi + MetaMask + burner). HashPack = README pointer.
- Testnet default; mainnet addresses labelled unaudited.
- Repo: `superhbar/prediction-market`. The org exists and the user is admin.
- Pyth: optional and server-side (`PYTH_API_KEY` in a Next.js API route). Hermes needs a key since 2026-08-26.
- Versions: latest stable of every dependency, checked at build time, but never break the blank
  template's compatibility (Node >=20.18.3, Yarn 3.2.3, csh v0.4.1 transforms).
- User timezone: NPT (UTC+5:45). Deadline Sun 23:59 ET = **Mon 09:44 NPT**.

## Use case (settled round 2)

Oracle-settled binary prediction markets: HTS position tokens, HIP-1215 self-scheduled settlement
reading a Chainlink push feed, a permissionless Pyth fallback pinned to the expiry time, and a void
path with refunds. The full spec is in `docs/SPEC.md`.
Base = official blank template via the generator (no hand-written Next.js app). Latest stable deps
where compatible (wagmi stays 2.x because of RainbowKit). PWA = manifest only, no service worker.

## Timeline (NPT)

- Fri night to Sat morning: feasibility spike (2h cap), skeleton that passes gate empty.
- Sat: contracts + tests + frontend.
- **Feature freeze Sun 09:44 NPT** (Sat 23:59 ET).
- Sun: docs, harness, gate matrix (npm + yarn), testnet tx, owner rename.
- **Submit by Mon 03:44 NPT** (Sun 18:00 ET), 6h buffer.

## Verification (gate rehearsal, run before submit and in CI)

1. Fresh scaffold, npm: `CREATE_SCAFFOLD_HBAR_TEMPLATE_DIR=<repo> npm create scaffold-hbar@latest t-npm`, choose npm and foundry. Then `npm run lint`, `npm run next:build`, `npm run foundry:test`, and `npm run next:check-types`.
2. Fresh scaffold, yarn: the same with yarn.
3. Fresh scaffold from GitHub: `npm create scaffold-hbar@latest -- --template superhbar/<repo>`.
4. Boot `next start` and curl every core route: `/`, `/markets/new`, `/markets/<id>`, `/portfolio`. Each must return 200 with no wallet connected and no Pyth key set.
5. Testnet end-to-end script: create, stake YES and NO, scheduled settle, redeem. Record the Hashscan links in the README.
6. Secret scan of the full git history (`git log -p | grep` for 64-hex keys and `PRIVATE_KEY=`), and confirm no `.env` is tracked.
7. Check that LICENSE is MIT, `template.json` is valid, and README.md, AGENTS.md and `.harness/` are present.
8. Harness: `npx hedera-harness doctor`, then `npx hedera-harness validate`.

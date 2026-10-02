# Feasibility spike (throwaway)

This folder holds the testnet experiments that settle the design questions in `docs/SPEC.md`.
None of it ships in the template.

Run on Hedera testnet (chain 296) through `https://testnet.hashio.io/api` on 2026-10-02.

## Results

| Question | Result | Evidence |
|---|---|---|
| Units of `msg.value` inside the EVM | Tinybar. Sending 1 HBAR (1e18 weibar over JSON-RPC) shows up as `100000000` | `stake()` emits `ValueSeen` |
| Maximum schedule horizon | `hasScheduleCapacity` is true at +62 days and false at +63 days | `capacity()` probe |
| Gas for `scheduleCall` in a normal transaction | About 1.46M gas. A 600k limit fails with `INSUFFICIENT_GAS` inside `0x16b` | tx `0xec13f9…` (fail), `0xb595d5…` (ok) |
| Scheduled call runs on time | Yes. It executes as a `CONTRACTCALL` with `scheduled=true`, and the contract pays a 0.022 HBAR fee | mirror node transactions for the spike contract |
| A scheduled call books the next one (self-rescheduling) | Works when the scheduled call has a 2.5M gas limit. The booking from inside the scheduled call cost the contract 1.17 HBAR, and the next hop ran on time for 0.022 HBAR. A 1.2M limit is too low to book. | `hop(2, 30, 2500000)`, hops went 3 to 5 |
| Who `msg.sender` is inside a scheduled call | The contract itself. `msg.sender`, `tx.origin` and `address(this)` all equal the contract's EVM address, so `msg.sender == address(this)` identifies a scheduled call | `WhoAmI.record()` |
| Token creation from a contract (contract is treasury, supply key and wipe key) | 190k gas plus an 11.45 HBAR fee. Testnet rate: $1 = 9.61 HBAR | `createToken` |
| Cost of mint and transfer | Mint 44k gas, transfer 43k gas. The first transfer to a new holder costs about 750k gas because of auto-association | `mintOnly`, `transferTo` |
| Redeem without an approval step | Works. `wipeTokenAccount` called by the contract (as wipe key) removed 40 of a holder's 100 tokens, and total supply dropped to 60 | `wipeFrom` |
| Chainlink round walk-back | Works. HBAR/USD testnet rounds are 3 to 46 minutes apart | `cast call getRoundData` |

## Implications for the template

- A market costs the creator about 23 HBAR in token fees, plus gas for one schedule booking. Developers need a Hedera Portal account (1000 HBAR a day), not the 10 HBAR a day faucet.
- The frontend must set an explicit gas limit for the first stake on each token, because of the auto-association cost.
- Self-healing retries are feasible. Each retry costs the market reserve about 1.17 HBAR, so the reserve is roughly `maxRetries x 1.2 HBAR` plus a small buffer.
- Settle on the first oracle round at or after expiry, not the latest round. The feed can be up to 46 minutes stale.

## Run it

```bash
cp .env.example .env   # HEDERA_PRIVATE_KEY=0x... (ECDSA, funded testnet account)
forge install hashgraph/hedera-forking --no-git
forge build
forge create src/Spike.sol:Spike --rpc-url https://testnet.hashio.io/api --private-key $HEDERA_PRIVATE_KEY --broadcast --legacy
```

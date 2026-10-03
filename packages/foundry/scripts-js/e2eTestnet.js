/**
 * End-to-end run of the full market lifecycle on Hedera testnet:
 * create -> stake YES and NO -> HIP-1215 scheduled settlement -> redeem the winner -> withdraw the reserve.
 *
 * Transactions are signed in-process with ethers, so the key never appears in a command line (see
 * deployHedera.js for why `forge script` is not used). The mirror node confirms that the settlement came
 * from the scheduled transaction. Every step prints a Hashscan link. A run takes about 17 minutes: a
 * 6 minute market plus the 10 minute settlement delay, longer when the first scheduled call has to retry.
 *
 * Usage:
 *   DEPLOYER_PRIVATE_KEY=0x... node scripts-js/e2eTestnet.js [--address 0x...] [--strike 0.10]
 * The account needs about 45 testnet HBAR (two HTS token creations, a 7 HBAR reserve and two stakes).
 */
import { ethers } from "ethers";
import { existsSync, readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const RPC = "https://testnet.hashio.io/api";
const CHAIN_ID = 296;
const MIRROR = "https://testnet.mirrornode.hedera.com/api/v1";
const HASHSCAN = "https://hashscan.io/testnet";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUTCOMES = ["Unresolved", "Yes", "No", "Invalid"];
const SOURCES = ["None", "Chainlink", "Pyth"];

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
}

function marketAddress() {
  const explicit = arg("address");
  if (explicit) return explicit;
  const file = join(ROOT, "deployments", `${CHAIN_ID}.json`);
  if (!existsSync(file))
    throw new Error(
      `No deployments/${CHAIN_ID}.json: deploy first or pass --address`,
    );
  const entry = Object.entries(JSON.parse(readFileSync(file, "utf8"))).find(
    ([, name]) => name === "PredictionMarkets",
  );
  if (!entry)
    throw new Error(`PredictionMarkets is not in deployments/${CHAIN_ID}.json`);
  return entry[0];
}

function abi() {
  const file = join(
    ROOT,
    "out",
    "PredictionMarkets.sol",
    "PredictionMarkets.json",
  );
  if (!existsSync(file))
    throw new Error("No build artifact: run `forge build` first");
  return JSON.parse(readFileSync(file, "utf8")).abi;
}

function entityId(longZero) {
  return `0.0.${BigInt(longZero)}`;
}

async function mirror(path) {
  const response = await fetch(`${MIRROR}${path}`);
  if (!response.ok)
    throw new Error(`mirror ${path} -> HTTP ${response.status}`);
  return response.json();
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const step = (label, detail) => console.log(`${label.padEnd(22)} ${detail}`);

/** Sends a contract call as a legacy transaction with an explicit gas limit and waits for success. */
async function send(contract, method, args, { value, gas }) {
  const gasPrice = await contract.provider.getGasPrice();
  const tx = await contract[method](...args, {
    type: 0,
    gasPrice,
    gasLimit: gas,
    value: value ? ethers.utils.parseEther(value) : 0,
  });
  const receipt = await contract.provider.waitForTransaction(tx.hash);
  if (receipt.status !== 1)
    throw new Error(`${method} reverted: ${HASHSCAN}/transaction/${tx.hash}`);
  return receipt;
}

async function main() {
  const key = process.env.DEPLOYER_PRIVATE_KEY;
  if (!key)
    throw new Error("Set DEPLOYER_PRIVATE_KEY to a funded testnet ECDSA key");
  const provider = new ethers.providers.JsonRpcProvider(RPC, CHAIN_ID);
  const pm = new ethers.Contract(
    marketAddress(),
    abi(),
    new ethers.Wallet(key, provider),
  );

  const strike = ethers.utils.parseUnits(arg("strike", "0.10"), 18);
  const expiry = Math.floor(Date.now() / 1000) + 360;
  const feedKey = ethers.utils.formatBytes32String("HBAR/USD");

  step("contract", `${HASHSCAN}/contract/${pm.address}`);
  const createReceipt = await send(
    pm,
    "createMarket",
    [feedKey, strike, expiry],
    { value: "35", gas: 3_000_000 },
  );
  // Read the id from this transaction's own MarketCreated log: marketCount() - 1 could be another
  // creator's market if one landed in between.
  const created = createReceipt.logs
    .filter((log) => log.address.toLowerCase() === pm.address.toLowerCase())
    .map((log) => pm.interface.parseLog(log))
    .find((event) => event.name === "MarketCreated");
  if (!created) throw new Error("createMarket emitted no MarketCreated event");
  const id = created.args.marketId;
  step(
    "create market",
    `#${id} ${HASHSCAN}/transaction/${createReceipt.transactionHash}`,
  );
  step(
    "YES / NO tokens",
    `${HASHSCAN}/token/${entityId(created.args.yesToken)} ${HASHSCAN}/token/${entityId(created.args.noToken)}`,
  );
  step(
    "settlement schedule",
    `${HASHSCAN}/schedule/${entityId(created.args.schedule)}`,
  );

  const yesStake = await send(pm, "stake", [id, true], {
    value: "5",
    gas: 1_500_000,
  });
  step(
    "stake YES 5 HBAR",
    `${HASHSCAN}/transaction/${yesStake.transactionHash}`,
  );
  const noStake = await send(pm, "stake", [id, false], {
    value: "3",
    gas: 1_500_000,
  });
  step("stake NO 3 HBAR", `${HASHSCAN}/transaction/${noStake.transactionHash}`);

  const settleBy = expiry + 600 + 3 * 900 + 120;
  console.log(
    `waiting for the scheduled settlement (expiry ${new Date(expiry * 1000).toISOString()})...`,
  );
  let market = await pm.getMarket(id);
  while (market.state === 0 && Date.now() / 1000 < settleBy) {
    await sleep(20_000);
    market = await pm.getMarket(id);
  }
  if (market.state !== 1)
    throw new Error(
      `market #${id} did not settle by ${new Date(settleBy * 1000).toISOString()}`,
    );

  const schedule = await mirror(`/schedules/${entityId(market.schedule)}`);
  if (!schedule.executed_timestamp)
    throw new Error(
      "settled, but the mirror node shows the schedule as not executed",
    );
  step(
    "scheduled settle",
    `executed at ${schedule.executed_timestamp} ${HASHSCAN}/schedule/${entityId(market.schedule)}`,
  );
  step(
    "outcome",
    `${OUTCOMES[market.outcome]} via ${SOURCES[market.source]} at $${ethers.utils.formatUnits(market.settlementPrice, 18)}, ` +
      `round ${market.settlementTime.toNumber() - market.expiry.toNumber()}s after expiry`,
  );

  const winnerYes = market.outcome === 1;
  const amount = winnerYes ? 500_000_000 : 300_000_000;
  const redeem = await send(pm, "redeem", [id, winnerYes, amount], {
    gas: 800_000,
  });
  step("redeem winner", `${HASHSCAN}/transaction/${redeem.transactionHash}`);
  const withdraw = await send(pm, "withdrawReserve", [id], { gas: 300_000 });
  step(
    "withdraw reserve",
    `${HASHSCAN}/transaction/${withdraw.transactionHash}`,
  );
  console.log("E2E PASS");
}

main().catch((error) => {
  console.error(`E2E FAIL: ${error.message}`);
  process.exit(1);
});

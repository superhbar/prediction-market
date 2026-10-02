/**
 * End-to-end run of the full market lifecycle on Hedera testnet:
 * create -> stake YES and NO -> HIP-1215 scheduled settlement -> redeem the winner -> withdraw the reserve.
 *
 * It uses `cast` for transactions (see deployHedera.js for why not `forge script`) and the mirror node to
 * confirm that the settlement came from the scheduled transaction. Every step prints a Hashscan link.
 * A run takes about 17 minutes: a 6 minute market plus the 10 minute settlement delay.
 *
 * Usage:
 *   DEPLOYER_PRIVATE_KEY=0x... node scripts-js/e2eTestnet.js [--address 0x...] [--strike 0.10]
 * The account needs about 45 testnet HBAR (two HTS token creations, a 7 HBAR reserve and two stakes).
 */
import { execFileSync } from "child_process";
import { existsSync, readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const RPC = "https://testnet.hashio.io/api";
const MIRROR = "https://testnet.mirrornode.hedera.com/api/v1";
const HASHSCAN = "https://hashscan.io/testnet";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MARKET_TUPLE =
  "(bytes32,int256,uint64,address,address,address,uint256,uint256,uint256,uint8,uint8,uint8,int256,uint64,uint8,address)";
const OUTCOMES = ["Unresolved", "Yes", "No", "Invalid"];
const SOURCES = ["None", "Chainlink", "Pyth"];

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
}

function cast(args) {
  try {
    return execFileSync("cast", args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch (error) {
    throw new Error(
      `cast ${args[0]} ${args[2] ?? ""} failed: ${String(error.stderr).split("\n")[0]}`,
    );
  }
}

function marketAddress() {
  const explicit = arg("address");
  if (explicit) return explicit;
  const file = join(ROOT, "deployments", "296.json");
  if (!existsSync(file))
    throw new Error("No deployments/296.json: deploy first or pass --address");
  const entry = Object.entries(JSON.parse(readFileSync(file, "utf8"))).find(
    ([, name]) => name === "PredictionMarkets",
  );
  if (!entry)
    throw new Error("PredictionMarkets is not in deployments/296.json");
  return entry[0];
}

function send(address, signature, args, { value, gas }) {
  const key = process.env.DEPLOYER_PRIVATE_KEY;
  const flags = [
    "--rpc-url",
    RPC,
    "--private-key",
    key,
    "--legacy",
    "--json",
    "--gas-limit",
    String(gas),
  ];
  if (value) flags.push("--value", value);
  const receipt = JSON.parse(
    cast(["send", ...flags, address, signature, ...args]),
  );
  if (receipt.status !== "0x1")
    throw new Error(
      `${signature} reverted: ${HASHSCAN}/transaction/${receipt.transactionHash}`,
    );
  return receipt.transactionHash;
}

function call(address, signature, args = []) {
  return cast(["call", "--rpc-url", RPC, address, signature, ...args]);
}

function readMarket(address, id) {
  const raw = call(address, `getMarket(uint256)(${MARKET_TUPLE})`, [
    String(id),
  ]);
  const fields = raw
    .replace(/^\(|\)$/g, "")
    .split(", ")
    .map((f) => f.split(" ")[0]);
  return {
    expiry: Number(fields[2]),
    yesToken: fields[4],
    noToken: fields[5],
    state: Number(fields[9]),
    outcome: Number(fields[10]),
    source: Number(fields[11]),
    price: BigInt(fields[12]),
    priceTime: Number(fields[13]),
    schedule: fields[15],
  };
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

async function main() {
  if (!process.env.DEPLOYER_PRIVATE_KEY)
    throw new Error("Set DEPLOYER_PRIVATE_KEY to a funded testnet ECDSA key");
  const pm = marketAddress();
  const strike =
    BigInt(Math.round(Number(arg("strike", "0.10")) * 1e8)) * 10n ** 10n;
  const expiry = Math.floor(Date.now() / 1000) + 360;
  const feedKey = cast(["format-bytes32-string", "HBAR/USD"]);

  step("contract", `${HASHSCAN}/contract/${pm}`);
  const createTx = send(
    pm,
    "createMarket(bytes32,int256,uint64)",
    [feedKey, strike.toString(), String(expiry)],
    {
      value: "35ether",
      gas: 3_000_000,
    },
  );
  const id = Number(call(pm, "marketCount()(uint256)").split(" ")[0]) - 1;
  const created = readMarket(pm, id);
  step("create market", `#${id} ${HASHSCAN}/transaction/${createTx}`);
  step(
    "YES / NO tokens",
    `${HASHSCAN}/token/${entityId(created.yesToken)} ${HASHSCAN}/token/${entityId(created.noToken)}`,
  );
  step(
    "settlement schedule",
    `${HASHSCAN}/schedule/${entityId(created.schedule)}`,
  );

  step(
    "stake YES 5 HBAR",
    `${HASHSCAN}/transaction/${send(pm, "stake(uint256,bool)", [String(id), "true"], { value: "5ether", gas: 1_500_000 })}`,
  );
  step(
    "stake NO 3 HBAR",
    `${HASHSCAN}/transaction/${send(pm, "stake(uint256,bool)", [String(id), "false"], { value: "3ether", gas: 1_500_000 })}`,
  );

  const settleBy = expiry + 600 + 3 * 900 + 120;
  console.log(
    `waiting for the scheduled settlement (expiry ${new Date(expiry * 1000).toISOString()})...`,
  );
  let market = readMarket(pm, id);
  while (market.state === 0 && Date.now() / 1000 < settleBy) {
    await sleep(20_000);
    market = readMarket(pm, id);
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
    `${OUTCOMES[market.outcome]} via ${SOURCES[market.source]} at $${(Number(market.price) / 1e18).toFixed(6)}, ` +
      `round ${market.priceTime - market.expiry}s after expiry`,
  );

  const winnerYes = market.outcome === 1;
  const amount = winnerYes ? "500000000" : "300000000";
  const redeemTx = send(
    pm,
    "redeem(uint256,bool,uint256)",
    [String(id), String(winnerYes), amount],
    { gas: 800_000 },
  );
  step("redeem winner", `${HASHSCAN}/transaction/${redeemTx}`);
  step(
    "withdraw reserve",
    `${HASHSCAN}/transaction/${send(pm, "withdrawReserve(uint256)", [String(id)], { gas: 300_000 })}`,
  );
  console.log("E2E PASS");
}

main().catch((error) => {
  console.error(`E2E FAIL: ${error.message}`);
  process.exit(1);
});

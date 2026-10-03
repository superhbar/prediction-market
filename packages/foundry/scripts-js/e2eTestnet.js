/**
 * End-to-end run of the full market lifecycle on Hedera testnet:
 * create -> stake YES and NO -> open a SaucerSwap YES/HBAR pool, buy and sell YES on it ->
 * HIP-1215 scheduled settlement -> redeem -> withdraw the reserve.
 *
 * Transactions are signed in-process with ethers, so the key never appears in a command line (see
 * deployHedera.js for why `forge script` is not used). The mirror node confirms that the settlement came
 * from the scheduled transaction. Every step prints a Hashscan link.
 *
 * A run takes about 17 minutes when Chainlink publishes a round soon after expiry: a 6 minute market plus
 * the 10 minute settlement delay. Testnet feeds only publish on deviation or heartbeat, so a quiet feed can
 * leave no round for an hour or more. The script then follows the same fallbacks a user has:
 *   1. wait for the scheduled call and its self-booked retries;
 *   2. call `settle` itself as soon as a round at or after expiry exists, until expiry + maxRoundLag;
 *   3. with PYTH_API_KEY set, settle with the first Pyth price at or after expiry;
 *   4. once expiry + gracePeriod has passed, void the market so every stake refunds 1:1.
 * If none applies yet, it prints when the market can be voided. Rerun with `--market <id>` to resume.
 *
 * Usage:
 *   DEPLOYER_PRIVATE_KEY=0x... node scripts-js/e2eTestnet.js [--address 0x...] [--strike 0.10] [--market <id>] [--skip-saucerswap]
 * The account needs about 75 testnet HBAR: two HTS token creations, an 8.5 HBAR reserve, two stakes and the
 * SaucerSwap step ($2 pool fee, 1 HBAR of liquidity, a 0.5 HBAR buy). `--skip-saucerswap` leaves that step out.
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
const STATES = { Open: 0, Settled: 1, Voided: 2 };
const OUTCOME_INVALID = 3;
const HERMES = process.env.PYTH_HERMES_URL ?? "https://hermes.pyth.network";

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
async function send(contract, method, args, { value, valueWei, gas }) {
  const gasPrice = await contract.provider.getGasPrice();
  const tx = await contract[method](...args, {
    type: 0,
    gasPrice,
    gasLimit: gas,
    value: valueWei ?? (value ? ethers.utils.parseEther(value) : 0),
  });
  const receipt = await contract.provider.waitForTransaction(tx.hash);
  if (receipt.status !== 1)
    throw new Error(`${method} reverted: ${HASHSCAN}/transaction/${tx.hash}`);
  return receipt;
}

/** Creates a market expiring in six minutes and stakes 5 HBAR on YES and 3 HBAR on NO. */
async function createAndStake(pm) {
  const strike = ethers.utils.parseUnits(arg("strike", "0.10"), 18);
  const expiry = Math.floor(Date.now() / 1000) + 360;
  const feedKey = ethers.utils.formatBytes32String("HBAR/USD");

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
  return id;
}

const now = () => Math.floor(Date.now() / 1000);
const iso = (sec) => new Date(sec * 1000).toISOString();

/** Polls getMarket until the market leaves Open or `deadline` (unix seconds) passes. */
async function waitWhileOpen(pm, id, deadline, intervalMs = 20_000) {
  let market = await pm.getMarket(id);
  while (market.state === STATES.Open && now() < deadline) {
    await sleep(intervalMs);
    market = await pm.getMarket(id);
  }
  return market;
}

/** Fetches signed Pyth update data for the first price at or after `publishTime` from Hermes. */
async function pythUpdateData(pythId, publishTime) {
  const response = await fetch(
    `${HERMES}/v2/updates/price/${publishTime}?ids[]=${pythId}&encoding=hex`,
    { headers: { Authorization: `Bearer ${process.env.PYTH_API_KEY}` } },
  );
  if (!response.ok) throw new Error(`Hermes -> HTTP ${response.status}`);
  const data = (await response.json()).binary?.data ?? [];
  return data.map((hex) => (hex.startsWith("0x") ? hex : `0x${hex}`));
}

/**
 * Drives market `id` to Settled or Voided through every path the contract offers, in order.
 * Returns the final market, or undefined when nothing can settle it yet.
 */
async function settleMarket(pm, id) {
  const [settlementDelay, retryDelay, maxRetries, maxRoundLag, gracePeriod] =
    await Promise.all([
      pm.settlementDelay(),
      pm.retryDelay(),
      pm.maxRetries(),
      pm.maxRoundLag(),
      pm.gracePeriod(),
    ]);
  let market = await pm.getMarket(id);
  const expiry = market.expiry.toNumber();

  // 1. The scheduled call and its self-booked retries.
  const scheduledBy =
    expiry + Number(settlementDelay) + maxRetries * Number(retryDelay) + 120;
  if (market.state === STATES.Open && now() < scheduledBy) {
    console.log(
      `waiting for the scheduled settlement (expiry ${iso(expiry)}, last retry by ${iso(scheduledBy)})...`,
    );
    market = await waitWhileOpen(pm, id, scheduledBy);
    if (market.state === STATES.Settled) {
      const schedule = await mirror(`/schedules/${entityId(market.schedule)}`);
      // Anyone may call settle once a round exists, so a pending schedule means someone else settled it.
      step(
        schedule.executed_timestamp
          ? "scheduled settle"
          : "settled by a caller",
        schedule.executed_timestamp
          ? `executed at ${schedule.executed_timestamp} ${HASHSCAN}/schedule/${entityId(market.schedule)}`
          : `before the pending schedule ${HASHSCAN}/schedule/${entityId(market.schedule)} ran`,
      );
      return market;
    }
  }

  // 2. A manual settle once Chainlink has a provably first round. The contract bounds when that round
  // was published (expiry + maxRoundLag), not when settle is called, so a late resume still tries once.
  const lagEnds = expiry + Number(maxRoundLag);
  if (market.state === STATES.Open) {
    if (now() < lagEnds)
      console.log(
        `no Chainlink round after expiry yet; trying settle() every minute until ${iso(lagEnds)}...`,
      );
    for (;;) {
      const ready = await pm.callStatic
        .settle(id, { gasLimit: 1_000_000 })
        .then(() => true)
        .catch(() => false);
      if (ready) {
        const receipt = await send(pm, "settle", [id], { gas: 1_000_000 });
        step(
          "manual settle",
          `${HASHSCAN}/transaction/${receipt.transactionHash}`,
        );
        return pm.getMarket(id);
      }
      if (now() >= lagEnds) break;
      await sleep(60_000);
    }
    market = await pm.getMarket(id);
  }

  // 3. The Pyth fallback, when a Hermes key is available.
  if (
    market.state === STATES.Open &&
    now() >= lagEnds &&
    process.env.PYTH_API_KEY
  ) {
    try {
      const { pythId } = await pm.feeds(market.feedKey);
      const updateData = await pythUpdateData(pythId, expiry);
      // 1 HBAR covers the Pyth update fee; the contract refunds the rest.
      const receipt = await send(pm, "settleWithPyth", [id, updateData], {
        value: "1",
        gas: 1_000_000,
      });
      step(
        "settle with Pyth",
        `${HASHSCAN}/transaction/${receipt.transactionHash}`,
      );
      return pm.getMarket(id);
    } catch (error) {
      // A Hermes outage must not block the void path below.
      console.log(`Pyth fallback failed: ${error.message}`);
      market = await pm.getMarket(id);
    }
  }

  // 4. Void after the grace period, so every stake refunds 1:1.
  const voidAt = expiry + Number(gracePeriod);
  if (market.state === STATES.Open && now() >= voidAt) {
    const receipt = await send(pm, "voidMarket", [id], { gas: 300_000 });
    step("void market", `${HASHSCAN}/transaction/${receipt.transactionHash}`);
    return pm.getMarket(id);
  }
  if (market.state === STATES.Open) {
    console.log(
      `market #${id} has no oracle price yet. Void opens at ${iso(voidAt)}: rerun with --market ${id} after that.`,
    );
    return undefined;
  }
  return market;
}

/** Redeems every position token the signer holds in market `id`. */
async function redeemAll(pm, id, market) {
  const owner = await pm.signer.getAddress();
  let redeemed = 0;
  const sides = [
    [true, market.yesToken],
    [false, market.noToken],
  ];
  for (const [yes, token] of sides) {
    // HTS tokens expose an ERC-20 facade, so balanceOf works on the token address.
    const balance = await new ethers.Contract(
      token,
      ["function balanceOf(address) view returns (uint256)"],
      pm.provider,
    ).balanceOf(owner);
    if (balance.isZero()) continue;
    const quote = await pm.quotePayout(id, yes, balance);
    if (quote.isZero()) continue;
    redeemed += 1;
    const receipt = await send(pm, "redeem", [id, yes, balance], {
      gas: 800_000,
    });
    step(
      `redeem ${yes ? "YES" : "NO"}`,
      `${ethers.utils.formatUnits(quote, 8)} HBAR ${HASHSCAN}/transaction/${receipt.transactionHash}`,
    );
  }
  return redeemed;
}

// SaucerSwap V1 on testnet: router 0.0.19264, factory 0.0.9959, WHBAR token 0.0.15058 (pair paths use the
// token; the router's WHBAR() returns the wrapper contract). Gas limits are measured, see docs/hedera-notes.md.
const SAUCER_ROUTER = "0x0000000000000000000000000000000000004b40";
const SAUCER_FACTORY = "0x00000000000000000000000000000000000026e7";
const WHBAR_TOKEN = "0x0000000000000000000000000000000000003ad2";
const EXCHANGE_RATE = "0x0000000000000000000000000000000000000168";

/** Opens a YES/HBAR pool with 2 YES and 1 HBAR, buys YES for 0.5 HBAR, then sells 0.5 YES back. */
async function tradeOnSaucerSwap(pm, id) {
  const signer = pm.signer;
  const owner = await signer.getAddress();
  const { yesToken } = await pm.getMarket(id);
  const token = new ethers.Contract(
    yesToken,
    ["function approve(address,uint256) returns (bool)"],
    signer,
  );
  const router = new ethers.Contract(
    SAUCER_ROUTER,
    [
      "function getAmountsOut(uint256,address[]) view returns (uint256[])",
      "function addLiquidityETHNewPool(address,uint256,uint256,uint256,address,uint256) payable returns (uint256,uint256,uint256)",
      "function swapExactETHForTokens(uint256,address[],address,uint256) payable returns (uint256[])",
      "function swapExactTokensForETH(uint256,uint256,address[],address,uint256) returns (uint256[])",
    ],
    signer,
  );
  const factory = new ethers.Contract(
    SAUCER_FACTORY,
    [
      "function pairCreateFee() view returns (uint256)",
      "function getPair(address,address) view returns (address)",
    ],
    pm.provider,
  );
  const rate = new ethers.Contract(
    EXCHANGE_RATE,
    ["function tinycentsToTinybars(uint256) view returns (uint256)"],
    pm.provider,
  );
  const deadline = () => Math.floor(Date.now() / 1000) + 600;
  const minOut = (quoted) => quoted.mul(99).div(100);
  const tinybarValue = (tinybar) =>
    ethers.utils.parseUnits(tinybar.toString(), 10);

  // The pool fee is a fixed USD amount; 3% over the converted rate covers drift until execution.
  const feeTinybar = await rate.tinycentsToTinybars(
    await factory.pairCreateFee(),
  );
  const deposit = ethers.BigNumber.from(200_000_000); // 2 YES (8 decimals)
  await send(token, "approve", [SAUCER_ROUTER, deposit], { gas: 1_000_000 });
  const pool = await send(
    router,
    "addLiquidityETHNewPool",
    [yesToken, deposit, 0, 0, owner, deadline()],
    {
      valueWei: tinybarValue(feeTinybar.mul(103).div(100).add(100_000_000)),
      gas: 8_000_000,
    },
  );
  const pair = await factory.getPair(yesToken, WHBAR_TOKEN);
  step(
    "SaucerSwap pool",
    `2 YES + 1 HBAR, fee ${ethers.utils.formatUnits(feeTinybar, 8)} HBAR ${HASHSCAN}/transaction/${pool.transactionHash} pair ${HASHSCAN}/contract/${pair}`,
  );

  const buyIn = ethers.BigNumber.from(50_000_000); // 0.5 HBAR in tinybar
  const [, boughtQuote] = await router.getAmountsOut(buyIn, [
    WHBAR_TOKEN,
    yesToken,
  ]);
  const buy = await send(
    router,
    "swapExactETHForTokens",
    [minOut(boughtQuote), [WHBAR_TOKEN, yesToken], owner, deadline()],
    { valueWei: tinybarValue(buyIn), gas: 500_000 },
  );
  step(
    "SaucerSwap buy",
    `0.5 HBAR -> ${ethers.utils.formatUnits(boughtQuote, 8)} YES ${HASHSCAN}/transaction/${buy.transactionHash}`,
  );

  const sellIn = ethers.BigNumber.from(50_000_000); // 0.5 YES
  const [, soldQuote] = await router.getAmountsOut(sellIn, [
    yesToken,
    WHBAR_TOKEN,
  ]);
  await send(token, "approve", [SAUCER_ROUTER, sellIn], { gas: 1_000_000 });
  const sell = await send(
    router,
    "swapExactTokensForETH",
    [sellIn, minOut(soldQuote), [yesToken, WHBAR_TOKEN], owner, deadline()],
    { gas: 1_200_000 },
  );
  step(
    "SaucerSwap sell",
    `0.5 YES -> ${ethers.utils.formatUnits(soldQuote, 8)} HBAR ${HASHSCAN}/transaction/${sell.transactionHash}`,
  );
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
  step("contract", `${HASHSCAN}/contract/${pm.address}`);

  const resume = arg("market");
  const id =
    resume === undefined
      ? await createAndStake(pm)
      : ethers.BigNumber.from(resume);
  if (resume !== undefined) step("resume market", `#${id}`);
  if (resume === undefined && !process.argv.includes("--skip-saucerswap"))
    await tradeOnSaucerSwap(pm, id);

  const market = await settleMarket(pm, id);
  if (!market) process.exit(2);
  if (market.state === STATES.Voided) {
    step("outcome", "Voided: every position refunds 1:1");
  } else {
    step(
      "outcome",
      `${OUTCOMES[market.outcome]} via ${SOURCES[market.source]} at $${ethers.utils.formatUnits(market.settlementPrice, 18)}` +
        (market.outcome === OUTCOME_INVALID
          ? ""
          : `, round ${market.settlementTime.toNumber() - market.expiry.toNumber()}s after expiry`),
    );
  }

  if ((await redeemAll(pm, id, market)) === 0)
    throw new Error(
      `the signer holds no redeemable position tokens in market #${id}`,
    );
  // The contract keeps one execution cost back while a scheduled call is still pending.
  const holdback = market.schedulePending
    ? await pm.SCHEDULED_EXECUTION_COST()
    : ethers.constants.Zero;
  const isCreator =
    market.creator.toLowerCase() ===
    (await pm.signer.getAddress()).toLowerCase();
  // withdrawReserve also needs balance surplus beyond every other liability; probe before sending.
  const withdrawable =
    isCreator &&
    market.reserve.gt(holdback) &&
    (await pm.callStatic
      .withdrawReserve(id, { gasLimit: 300_000 })
      .then(() => true)
      .catch(() => false));
  if (isCreator && !withdrawable)
    console.log("reserve: nothing withdrawable right now");
  if (withdrawable) {
    const withdraw = await send(pm, "withdrawReserve", [id], { gas: 300_000 });
    step(
      "withdraw reserve",
      `${HASHSCAN}/transaction/${withdraw.transactionHash}`,
    );
  }
  console.log("E2E PASS");
}

main().catch((error) => {
  console.error(`E2E FAIL: ${error.message}`);
  process.exit(1);
});

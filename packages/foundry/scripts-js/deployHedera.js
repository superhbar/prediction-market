/**
 * Deploys PredictionMarkets to Hedera testnet or mainnet: `cast send --create` with an encrypted
 * keystore, or an in-process ethers signer when DEPLOYER_PRIVATE_KEY is set (automation, Harness), so a
 * raw key is never passed on a command line where other processes could read it.
 *
 * Why not `forge script --broadcast`: Foundry 1.8 sends eth_getTransactionCount with an
 * EIP-1898 block object ({ blockHash }), which the Hashio JSON-RPC relay rejects with
 * "Invalid parameter 1". `cast send` uses a plain block tag and works.
 *
 * The script writes the same broadcast record and deployments file that `forge script`
 * would, so `generateTsAbis.js` keeps producing packages/nextjs/contracts/deployedContracts.ts.
 *
 * Usage (normally via `yarn deploy --network hederaTestnet`):
 *   node scripts-js/deployHedera.js --network hedera_testnet --account <keystore-name>
 *   DEPLOYER_PRIVATE_KEY=0x... node scripts-js/deployHedera.js --network hedera_testnet
 */
import { execFileSync } from "child_process";
import { ethers } from "ethers";
import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const NETWORKS = {
  hedera_testnet: {
    chainId: 296,
    rpcUrl: "https://testnet.hashio.io/api",
    name: "hedera_testnet",
  },
  hedera_mainnet: {
    chainId: 295,
    rpcUrl: "https://mainnet.hashio.io/api",
    name: "hedera_mainnet",
  },
};
const CONTRACT = "PredictionMarkets";
const SCRIPT = "Deploy.s.sol";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

function run(cmd, args) {
  try {
    return execFileSync(cmd, args, {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["inherit", "pipe", "inherit"],
    });
  } catch {
    // The failing command echoes the full init code; report only which tool failed.
    throw new Error(`${cmd} ${args[0]} failed (see output above)`);
  }
}

function constructorArgs(chainId) {
  const out = run("forge", [
    "script",
    `script/${SCRIPT}`,
    "--sig",
    "constructorArgs()",
    "--chain-id",
    String(chainId),
    "--json",
  ]);
  const line = out
    .split("\n")
    .find((l) => l.trim().startsWith("{") && l.includes('"returns"'));
  if (!line)
    throw new Error("forge script did not return constructor arguments");
  return JSON.parse(line).returns["0"].value;
}

function bytecode() {
  const artifact = JSON.parse(
    readFileSync(
      join(ROOT, "out", `${CONTRACT}.sol`, `${CONTRACT}.json`),
      "utf8",
    ),
  );
  return artifact.bytecode.object;
}

/** Sends the creation transaction from DEPLOYER_PRIVATE_KEY in-process. Returns a cast-shaped receipt. */
async function deployWithKey(network, initCode) {
  const provider = new ethers.providers.JsonRpcProvider(
    network.rpcUrl,
    network.chainId,
  );
  const wallet = new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY, provider);
  const request = { data: initCode, type: 0 };
  const gasLimit = (await wallet.estimateGas(request)).mul(12).div(10);
  const tx = await wallet.sendTransaction({
    ...request,
    gasLimit,
    gasPrice: await provider.getGasPrice(),
  });
  const receipt = await provider.waitForTransaction(tx.hash);
  return {
    status: receipt.status === 1 ? "0x1" : "0x0",
    transactionHash: receipt.transactionHash,
    contractAddress: receipt.contractAddress,
    blockNumber: receipt.blockNumber,
  };
}

/** Sends the creation transaction with `cast send` from an encrypted keystore account. */
function deployWithKeystore(network, initCode) {
  const account = arg("account");
  if (!account)
    throw new Error("Pass --account <keystore> or set DEPLOYER_PRIVATE_KEY");
  return JSON.parse(
    run("cast", [
      "send",
      "--rpc-url",
      network.rpcUrl,
      "--legacy",
      "--json",
      "--account",
      account,
      "--create",
      initCode,
    ]),
  );
}

function writeRecords(network, receipt) {
  const broadcastDir = join(ROOT, "broadcast", SCRIPT, String(network.chainId));
  mkdirSync(broadcastDir, { recursive: true });
  const record = {
    transactions: [
      {
        hash: receipt.transactionHash,
        transactionType: "CREATE",
        contractName: CONTRACT,
        contractAddress: receipt.contractAddress,
      },
    ],
    receipts: [
      {
        transactionHash: receipt.transactionHash,
        blockNumber: receipt.blockNumber,
      },
    ],
  };
  const json = JSON.stringify(record, null, 2);
  writeFileSync(
    join(broadcastDir, `run-${Math.floor(Date.now() / 1000)}.json`),
    json,
  );
  writeFileSync(join(broadcastDir, "run-latest.json"), json);

  mkdirSync(join(ROOT, "deployments"), { recursive: true });
  const deployments = {
    [receipt.contractAddress]: CONTRACT,
    networkName: network.name,
  };
  writeFileSync(
    join(ROOT, "deployments", `${network.chainId}.json`),
    JSON.stringify(deployments, null, 2),
  );
}

async function main() {
  const network = NETWORKS[arg("network")];
  if (!network)
    throw new Error(
      `--network must be one of: ${Object.keys(NETWORKS).join(", ")}`,
    );

  run("forge", ["build"]);
  const initCode = bytecode() + constructorArgs(network.chainId).slice(2);

  console.log(`Deploying ${CONTRACT} to ${network.name}...`);
  const receipt = process.env.DEPLOYER_PRIVATE_KEY
    ? await deployWithKey(network, initCode)
    : deployWithKeystore(network, initCode);
  if (receipt.status !== "0x1" || !receipt.contractAddress) {
    throw new Error(
      `Deployment failed: ${receipt.transactionHash ?? "no transaction hash"}`,
    );
  }

  writeRecords(network, receipt);
  const explorer = network.chainId === 296 ? "testnet" : "mainnet";
  console.log(`${CONTRACT} deployed at ${receipt.contractAddress}`);
  console.log(
    `https://hashscan.io/${explorer}/contract/${receipt.contractAddress}`,
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});

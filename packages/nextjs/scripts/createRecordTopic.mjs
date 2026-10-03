/**
 * Creates the HCS topic that settlement records are published to, with the operator as submit key so only
 * the app's server can write to it. Prints the topic id to put in HCS_RECORD_TOPIC_ID.
 *
 * Usage (from packages/nextjs, with HEDERA_OPERATOR_ID and HEDERA_OPERATOR_KEY set):
 *   node scripts/createRecordTopic.mjs [--mainnet]
 */
import { AccountId, Client, PrivateKey, TopicCreateTransaction } from "@hashgraph/sdk";

const operatorId = process.env.HEDERA_OPERATOR_ID;
const operatorKey = process.env.HEDERA_OPERATOR_KEY;
if (!operatorId || !operatorKey) {
  console.error("Set HEDERA_OPERATOR_ID and HEDERA_OPERATOR_KEY first.");
  process.exit(1);
}
const hex = operatorKey.startsWith("0x") ? operatorKey.slice(2) : operatorKey;
const key = /^[0-9a-fA-F]{64}$/.test(hex) ? PrivateKey.fromStringECDSA(hex) : PrivateKey.fromStringDer(operatorKey);
const client = (process.argv.includes("--mainnet") ? Client.forMainnet() : Client.forTestnet()).setOperator(
  AccountId.fromString(operatorId),
  key,
);

const response = await new TopicCreateTransaction()
  .setTopicMemo("Predera settlement records")
  .setSubmitKey(key.publicKey)
  .execute(client);
const receipt = await response.getReceipt(client);
console.log(`HCS_RECORD_TOPIC_ID=${receipt.topicId.toString()}`);
client.close();

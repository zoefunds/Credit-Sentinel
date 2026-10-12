import fs from "node:fs";
import keytar from "keytar";
import {
  createAccount,
  createClient,
  chains,
} from "genlayer-js";
import { TransactionStatus } from "genlayer-js/types";

const accountName = process.env.DEPLOYER_ACCOUNT ?? "cw-lender-e2e";
const privateKey = await keytar.getPassword("genlayer-cli", `account:${accountName}`);
if (!privateKey) throw new Error(`${accountName} is not unlocked in the GenLayer CLI keychain`);

const account = createAccount(privateKey);
const client = createClient({ chain: chains.studionet, account });
const code = fs.readFileSync(new URL("../contracts/credit_sentinel.py", import.meta.url), "utf8");

const hash = await client.deployContract({ code, args: [] });
console.log(JSON.stringify({ event: "submitted", deployer: account.address, transaction: hash }));

const receipt = await client.waitForTransactionReceipt({
  hash,
  status: TransactionStatus.FINALIZED,
  retries: 240,
  interval: 3000,
});

const address =
  receipt.contractAddress ??
  receipt.contract_address ??
  receipt.data?.contractAddress ??
  receipt.data?.contract_address ??
  receipt.consensusData?.leaderReceipt?.[0]?.contractAddress ??
  receipt.consensus_data?.leader_receipt?.[0]?.contract_address;

console.log(JSON.stringify({
  event: "finalized",
  deployer: account.address,
  transaction: hash,
  contract: address,
  status: receipt.statusName ?? receipt.status_name ?? receipt.status,
  execution: receipt.txExecutionResultName ?? receipt.executionResultName,
  receipt,
}, (_key, value) => typeof value === "bigint" ? value.toString() : value));

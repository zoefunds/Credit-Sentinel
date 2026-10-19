import keytar from "keytar";
import { createAccount, createClient, chains } from "genlayer-js";
import { ExecutionResult, TransactionStatus } from "genlayer-js/types";

const contract = process.env.CREDIT_SENTINEL_CONTRACT;
if (!contract) throw new Error("CREDIT_SENTINEL_CONTRACT is required");

const loadAccount = async (name) => {
  const key = await keytar.getPassword("genlayer-cli", `account:${name}`);
  if (!key) throw new Error(`${name} is not unlocked in the GenLayer CLI keychain`);
  return createAccount(key);
};

const lender = await loadAccount("cw-lender-e2e");
const borrower = await loadAccount("cw-borrower-e2e");
const endpoint = process.env.GENLAYER_RPC_URL;
const options = { chain: chains.studionet, ...(endpoint ? { endpoint } : {}) };
const lenderClient = createClient({ ...options, account: lender });
const borrowerClient = createClient({ ...options, account: borrower });
const evidence = [
  "https://en.wikipedia.org/wiki/Bitcoin",
  "https://river.com/learn/terms/1/21-million/",
  "https://www.fidelitydigitalassets.com/research-and-insights/understanding-bitcoin-and-ethereum-supply",
];

const read = (client, functionName, args = []) => client.readContract({
  address: contract, functionName, args, stateStatus: "finalized",
});

const receiptFor = async (client, hash) => client.waitForTransactionReceipt({
  hash,
  status: TransactionStatus.FINALIZED,
  retries: 360,
  interval: 3000,
});

const executionSucceeded = (receipt) => {
  const named = receipt.txExecutionResultName ?? receipt.executionResultName;
  const numeric = receipt.txExecutionResult ?? receipt.executionResult;
  const leader = (receipt.consensusData?.leaderReceipt ?? receipt.consensus_data?.leader_receipt ?? [])[0];
  return named === "FINISHED_WITH_RETURN" ||
    numeric === ExecutionResult.FINISHED_WITH_RETURN ||
    leader?.executionResult === "SUCCESS" || leader?.execution_result === "SUCCESS";
};

const writeSuccess = async (client, functionName, args = [], value = 0n) => {
  const hash = await client.writeContract({ address: contract, functionName, args, value });
  console.log(JSON.stringify({ event: "submitted", functionName, hash }));
  const receipt = await receiptFor(client, hash);
  if (!executionSucceeded(receipt)) throw new Error(`${functionName} failed: ${hash}`);
  return hash;
};

let loanId = process.env.GUARD_LOAN_ID === undefined
  ? Number(await read(lenderClient, "get_loan_count"))
  : Number(process.env.GUARD_LOAN_ID);
let create = null;
let lock = null;
if (process.env.GUARD_LOAN_ID === undefined) {
  const maturity = Math.floor(Date.now() / 1000) + 45 * 24 * 60 * 60;
  const covenant = {
    source_type: "OFFCHAIN",
    source_ref: "",
    source_refs: evidence,
    condition_field: "max_bitcoin_supply",
    operator: ">=",
    threshold: 22_000_000,
    description: "Challenge-admission guard test: three independent Bitcoin supply publications establish the 21,000,000 maximum, so a 22,000,000 minimum must open a breach without allowing unusable contrary evidence to erase it.",
    tier1_interest_step_up_bps: 350,
    tier2_seizure_bps: 2500,
  };
  create = await writeSuccess(
    lenderClient,
    "create_loan",
    [borrower.address, 2_000_000, 500, maturity, JSON.stringify([covenant]), 6 * 60 * 60],
    1_000_000n,
  );
  lock = await writeSuccess(borrowerClient, "lock_collateral", [loanId], 2_000_000n);
}
const rules = await read(lenderClient, "get_loan_covenants", [loanId]);
const covenantId = Number(rules[0].id);
let checks = await read(lenderClient, "get_check_history", [loanId]);
const trigger = checks.length === 0
  ? await writeSuccess(lenderClient, "trigger_covenant_check", [loanId, covenantId])
  : null;
checks = await read(lenderClient, "get_check_history", [loanId]);
const check = checks[checks.length - 1];
if (check.status !== "BREACH" || check.finalized !== false) {
  throw new Error(`expected an open original breach: ${JSON.stringify(check)}`);
}

const unusableUrl = "https://challenge-evidence-missing.invalid/report";
const challengeHash = await borrowerClient.writeContract({
  address: contract,
  functionName: "submit_challenge_evidence",
  args: [loanId, Number(check.id), unusableUrl, "Deliberately unreachable URL: must revert before admission."],
});
console.log(JSON.stringify({ event: "submitted", functionName: "submit_challenge_evidence", hash: challengeHash }));
const failedChallengeReceipt = await receiptFor(borrowerClient, challengeHash);
if (executionSucceeded(failedChallengeReceipt)) {
  throw new Error("unusable challenge URL unexpectedly succeeded");
}

const afterChecks = await read(lenderClient, "get_check_history", [loanId]);
const after = afterChecks[afterChecks.length - 1];
if (after.status !== "BREACH" || after.finalized !== false || Number(after.challenge_count) !== 0 || after.challenge_evidence_urls.length !== 0) {
  throw new Error(`failed challenge altered breach state: ${JSON.stringify(after)}`);
}

console.log(JSON.stringify({
  ok: true,
  network: "GenLayer StudioNet",
  chainId: 61999,
  contract,
  loanId,
  covenantId,
  evidence,
  observedOriginalStatus: check.status,
  observedOriginalValue: check.observed_value,
  observedOriginalFinalized: check.finalized,
  transactions: { create, lock, trigger, unusableChallenge: challengeHash },
  unusableChallengeExecution: failedChallengeReceipt.txExecutionResultName ?? failedChallengeReceipt.executionResultName ?? failedChallengeReceipt.txExecutionResult ?? failedChallengeReceipt.executionResult,
  postcondition: {
    status: after.status,
    finalized: after.finalized,
    challengeCount: after.challenge_count,
    storedChallengeUrls: after.challenge_evidence_urls.length,
  },
}, null, 2));

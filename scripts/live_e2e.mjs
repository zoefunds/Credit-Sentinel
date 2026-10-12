import keytar from "keytar";
import {
  createAccount,
  createClient,
  chains,
} from "genlayer-js";
import {
  ExecutionResult,
  TransactionStatus,
} from "genlayer-js/types";

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
const lenderClient = createClient({ chain: chains.studionet, account: lender, ...(endpoint ? { endpoint } : {}) });
const borrowerClient = createClient({ chain: chains.studionet, account: borrower, ...(endpoint ? { endpoint } : {}) });
const evidence = [
  "https://en.wikipedia.org/wiki/Bitcoin",
  "https://river.com/learn/terms/1/21-million/",
  "https://www.fidelitydigitalassets.com/research-and-insights/understanding-bitcoin-and-ethereum-supply",
];
const results = [];

const read = (client, functionName, args = []) => client.readContract({
  address: contract,
  functionName,
  args,
  stateStatus: "finalized",
});

const write = async (client, functionName, args = [], value = 0n) => {
  const hash = await client.writeContract({ address: contract, functionName, args, value });
  console.log(JSON.stringify({ event: "submitted", functionName, hash }));
  let receipt;
  let lastError;
  for (let attempt = 0; attempt < 8 && !receipt; attempt += 1) {
    try {
      receipt = await client.waitForTransactionReceipt({
        hash,
        status: TransactionStatus.FINALIZED,
        retries: 240,
        interval: 3000,
      });
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 2000 * (attempt + 1)));
    }
  }
  if (!receipt) throw lastError;
  const execution = receipt.txExecutionResultName ?? receipt.executionResultName;
  const executionNumber = receipt.txExecutionResult ?? receipt.executionResult;
  const leaderReceipts = receipt.consensusData?.leaderReceipt ?? receipt.consensus_data?.leader_receipt ?? [];
  const leaderExecution = leaderReceipts[0]?.executionResult ?? leaderReceipts[0]?.execution_result;
  const succeeded = execution === "FINISHED_WITH_RETURN" ||
    executionNumber === ExecutionResult.FINISHED_WITH_RETURN || leaderExecution === "SUCCESS";
  if (!succeeded) throw new Error(`${functionName} failed: tx=${hash} execution=${execution ?? executionNumber ?? leaderExecution}`);
  const votes = receipt.consensusData?.votes ?? receipt.consensus_data?.votes ?? {};
  const agreeingValidators = Object.values(votes).filter((vote) => String(vote).toLowerCase() === "agree").length;
  return { hash, agreeingValidators };
};

const covenant = ({ operator, threshold, description }) => ({
  source_type: "OFFCHAIN",
  source_ref: "",
  source_refs: evidence,
  condition_field: "max_bitcoin_supply",
  operator,
  threshold,
  description,
  tier1_interest_step_up_bps: 350,
  tier2_seizure_bps: 2500,
});

const createAndLock = async ({ principal, collateral, interestBps, terms }) => {
  const loanId = Number(await read(lenderClient, "get_loan_count"));
  const maturity = Math.floor(Date.now() / 1000) + 45 * 24 * 60 * 60;
  const create = await write(
    lenderClient,
    "create_loan",
    [borrower.address, Number(collateral), interestBps, maturity, JSON.stringify([terms]), 6 * 60 * 60],
    principal,
  );
  const lock = await write(borrowerClient, "lock_collateral", [loanId], collateral);
  const rules = await read(lenderClient, "get_loan_covenants", [loanId]);
  return { loanId, covenantId: Number(rules[0].id), create, lock };
};

// Scenario 1: independently corroborated 21 million cap, draw, repay, settle.
{
  const principal = 1_000_000n;
  const collateral = 2_000_000n;
  const opened = await createAndLock({
    principal,
    collateral,
    interestBps: 475,
    terms: covenant({
      operator: "==",
      threshold: 21_000_000,
      description: "Digital-asset treasury facility: three independent publishers must corroborate Bitcoin's protocol maximum supply at exactly 21,000,000 BTC before principal may be drawn.",
    }),
  });
  const trigger = await write(lenderClient, "trigger_covenant_check", [opened.loanId, opened.covenantId]);
  const checks = await read(lenderClient, "get_check_history", [opened.loanId]);
  const check = checks[checks.length - 1];
  if (check.status !== "COMPLIANT" || check.finalized !== true) throw new Error(`scenario 1 expected finalized COMPLIANT: ${JSON.stringify(check)}`);
  if (await read(lenderClient, "can_claim_principal", [opened.loanId]) !== true) throw new Error("scenario 1 principal was not enabled");
  const draw = await write(borrowerClient, "claim_principal", [opened.loanId]);
  const due = principal + (principal * 475n) / 10_000n;
  const repay = await write(borrowerClient, "repay_loan", [opened.loanId], due);
  const lenderClaim = await write(lenderClient, "claim_settlement", [opened.loanId]);
  const borrowerClaim = await write(borrowerClient, "claim_settlement", [opened.loanId]);
  const finalLoan = await read(lenderClient, "get_loan", [opened.loanId]);
  if (finalLoan.status !== "REPAID") throw new Error(`scenario 1 expected REPAID: ${JSON.stringify(finalLoan)}`);
  results.push({
    scenario: 1,
    title: "Bitcoin-cap compliant draw and repayment",
    terms: { principalWei: principal.toString(), collateralWei: collateral.toString(), interestBps: 475, operator: "==", threshold: 21_000_000 },
    loanId: opened.loanId,
    covenantId: opened.covenantId,
    evidence,
    check: { status: check.status, observedValue: check.observed_value, observedNote: check.observed_note, sourceHash: check.result_source_hash, finalized: check.finalized },
    finalLoanStatus: finalLoan.status,
    transactions: { create: opened.create.hash, lock: opened.lock.hash, trigger: trigger.hash, draw: draw.hash, repay: repay.hash, lenderClaim: lenderClaim.hash, borrowerClaim: borrowerClaim.hash },
    agreeingValidators: trigger.agreeingValidators,
  });
}

// Scenario 2: the same public fact is tested against an impossible 22 million floor.
{
  const opened = await createAndLock({
    principal: 1_200_000n,
    collateral: 2_400_000n,
    interestBps: 525,
    terms: covenant({
      operator: ">=",
      threshold: 22_000_000,
      description: "Acquisition facility supply covenant: the independently documented Bitcoin maximum supply must be at least 22,000,000 BTC; failure opens the contractual challenge window before penalties can be finalized.",
    }),
  });
  const trigger = await write(lenderClient, "trigger_covenant_check", [opened.loanId, opened.covenantId]);
  const checks = await read(lenderClient, "get_check_history", [opened.loanId]);
  const check = checks[checks.length - 1];
  const loan = await read(lenderClient, "get_loan", [opened.loanId]);
  if (check.status !== "BREACH" || check.finalized !== false) throw new Error(`scenario 2 expected open BREACH: ${JSON.stringify(check)}`);
  if (Number(check.challenge_window_ends_at) <= Number(check.evaluated_at)) throw new Error("scenario 2 challenge window was not opened");
  results.push({
    scenario: 2,
    title: "Bitcoin-cap breach and live challenge window",
    terms: { principalWei: "1200000", collateralWei: "2400000", interestBps: 525, operator: ">=", threshold: 22_000_000, challengeWindowSeconds: 21_600 },
    loanId: opened.loanId,
    covenantId: opened.covenantId,
    evidence,
    check: { status: check.status, observedValue: check.observed_value, observedNote: check.observed_note, sourceHash: check.result_source_hash, finalized: check.finalized, challengeWindowEndsAt: check.challenge_window_ends_at },
    loanStatus: loan.status,
    transactions: { create: opened.create.hash, lock: opened.lock.hash, trigger: trigger.hash },
    agreeingValidators: trigger.agreeingValidators,
  });
}

// Scenario 3: exercise the lender's pre-collateral cancellation and pull refund.
{
  const loanId = Number(await read(lenderClient, "get_loan_count"));
  const principal = 1_500_000n;
  const maturity = Math.floor(Date.now() / 1000) + 60 * 24 * 60 * 60;
  const terms = covenant({
    operator: "<=",
    threshold: 21_000_000,
    description: "Undrawn bridge facility: Bitcoin's maximum protocol supply must remain no greater than 21,000,000 BTC, with lender cancellation permitted only before the borrower posts collateral.",
  });
  const create = await write(lenderClient, "create_loan", [borrower.address, 3_000_000, 450, maturity, JSON.stringify([terms]), 6 * 60 * 60], principal);
  const cancel = await write(lenderClient, "cancel_loan", [loanId]);
  const beforeClaim = await read(lenderClient, "get_loan", [loanId]);
  if (beforeClaim.status !== "CANCELLED" || BigInt(beforeClaim.claimable_lender_wei) !== principal) throw new Error(`scenario 3 cancellation ledger mismatch: ${JSON.stringify(beforeClaim)}`);
  const refund = await write(lenderClient, "claim_settlement", [loanId]);
  const finalLoan = await read(lenderClient, "get_loan", [loanId]);
  if (finalLoan.status !== "CANCELLED" || BigInt(finalLoan.claimable_lender_wei) !== 0n) throw new Error(`scenario 3 refund did not settle: ${JSON.stringify(finalLoan)}`);
  results.push({
    scenario: 3,
    title: "Detailed undrawn facility cancellation and refund",
    terms: { principalWei: principal.toString(), collateralWei: "3000000", interestBps: 450, operator: "<=", threshold: 21_000_000 },
    loanId,
    evidence,
    finalLoanStatus: finalLoan.status,
    transactions: { create: create.hash, cancel: cancel.hash, refund: refund.hash },
  });
}

console.log(JSON.stringify({
  ok: true,
  network: "GenLayer StudioNet",
  chainId: 61999,
  contract,
  lender: lender.address,
  borrower: borrower.address,
  scenarios: results,
}, null, 2));

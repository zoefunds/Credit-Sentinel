# Credit Sentinel StudioNet live test report

## Deployment

| Field | Value |
|---|---|
| Date | 2026-10-12 |
| Network | GenLayer StudioNet (`61999`) |
| Contract | `0xB15FfAa6A42901Db55d985f24F99806C9e563a43` |
| Deployment transaction | `0xacc98388694842a1cf4c0f2e917f0b9c63d037bbf93ca6ac8d73ff54249c9134` |
| Consensus | `MAJORITY_AGREE` / `FINALIZED` |
| Deployer | `0x1c2e587043568239B2fcaeC5f96F278EB134b7f5` |
| Source SHA-256 | `ee80f682f2620f1840068f57761d7f2347bd383e6aa4d08baea152ca698fcae0` |

The deployed class is `CreditSentinel`. The old product name does not appear in the deployed source.

> Historical deployment note: this report records the first StudioNet deployment. The challenge-flow remediation is submitted and deployed as a new contract instance; its address and fresh source hash are recorded in the current deployment record and README after the remediation deployment finalizes. The historical instance must not be used for challenge adjudication.

## Real evidence set

The nondeterministic checks used three independent, public sources describing Bitcoin's fixed maximum supply:

1. `https://en.wikipedia.org/wiki/Bitcoin`
2. `https://river.com/learn/terms/1/21-million/`
3. `https://www.fidelitydigitalassets.com/research-and-insights/understanding-bitcoin-and-ethereum-supply`

Validators independently fetched these pages. Both evaluated scenarios recorded `observed_value = 21000000.000000` and `corroborated by 3/3 independent publishers`. No mock web result, local fixture, forced model output, or placeholder fact was used.

## Scenario 1 — compliant draw, repayment, and settlement

Loan `1`, covenant `1` modeled a digital-asset treasury facility:

- Principal: `1,000,000` wei
- Collateral: `2,000,000` wei
- Base interest: `475` bps
- Maturity: 45 days after creation
- Condition: `max_bitcoin_supply == 21,000,000`
- Finding: `COMPLIANT`, finalized automatically
- Observed source quorum: `3/3`
- Result source hash: `1ac219a4ef0ca2eeb983afd4a02e494f89e509ca98e22faa5b71d8ff58ae111c`
- Final loan state: `REPAID`; lender and borrower settlement balances were both claimed

| Action | Transaction |
|---|---|
| Create loan | `0x7cba9d7e3d19cee37a27ba490d2ca8641214c0a7b7e72599f62aaf8eaa16d952` |
| Lock collateral | `0xe47e083aabb0cd9e212148bf9ba4f889d461bfddee473e3d29b37ba899555325` |
| Trigger real evidence check | `0x0df3b13684c795e89328c6e2c7ded32c171976d94e5ea8296dfcc6e7e1163858` |
| Draw principal | `0x35faaa51efc8aaf08ca66ff5177af2861e20c21aa4faf2d34928c7c1628d3831` |
| Repay | `0xd372226eea92a55cf89a74871383e8775196d778cc79be0301dd2ad8c533473d` |
| Lender settlement | `0x5e4231cf62f1be47df56911be7efb7b80abc17f66a216d46033fb5a47f678b13` |
| Borrower settlement | `0x2c46600faffc6f5f78255c6307861c829f57751732d3c10e26658d2633bb3686` |

## Scenario 2 — confirmed breach with challenge protection

Loan `2`, covenant `2` modeled an acquisition facility with an intentionally unsatisfied numeric condition:

- Principal: `1,200,000` wei
- Collateral: `2,400,000` wei
- Base interest: `525` bps
- Condition: `max_bitcoin_supply >= 22,000,000`
- Actual corroborated observation: `21,000,000`
- Finding: `BREACH`
- Challenge window: six hours, ending 2026-10-13 04:05:49 WAT
- Finding finalized: `false`; no irreversible consequence was applied early
- Result source hash: `13409ad1eafdcd3d321a4079103432dac87222a84de57598c94c95fa4d5832ce`
- Loan state during the open challenge window: `ACTIVE`

| Action | Transaction |
|---|---|
| Create loan | `0x28016f708e40e897ea6aa4d1c53b445011c8fe8b2dfa8850fb2640d8b84ac6c3` |
| Lock collateral | `0xde90e24cb6ac494d53f552c158220d37883f6ddad282c5d6db2bff04c9090305` |
| Trigger real evidence check | `0x4fb00205dd9fe885bb1170bdb8bf19e4ce8bc3478001f28856bf7a4aeb2002dd` |

This test deliberately stops at the open challenge boundary. Finalizing it before the six-hour deadline must revert by contract design.

## Scenario 3 — undrawn facility cancellation and refund

Loan `3` modeled an undrawn bridge facility:

- Principal: `1,500,000` wei
- Required collateral: `3,000,000` wei
- Base interest: `450` bps
- Precommitted condition: `max_bitcoin_supply <= 21,000,000`
- Borrower never posted collateral
- Lender cancelled, then claimed the full principal refund
- Final loan state: `CANCELLED`
- Remaining lender claimable balance: `0`

| Action | Transaction |
|---|---|
| Create loan | `0x63b7fac4c471323735e4c13d377eb4b49767fa7a6484e9c9247616bc62a72040` |
| Cancel | `0x25431c4edb08c70a1295ecc2fa3ae5a670501b7373aeb7b6fbfa258f82f5fda6` |
| Claim refund | `0x94fdc6d9b4d6a9f46f9ac35d0c5ced56b7223f7e7d3c55847d6a0cbc5f8b6659` |

## Interrupted-attempt cleanup

The initial run suffered a transient StudioNet gateway/TLS polling failure after loan `0` had become active. The run was resumed against that exact loan. Its real three-source check finalized `COMPLIANT` with `21,000,000.000000`, and it completed draw, repayment, and both settlements. Final state: `REPAID`. This ensured no accidental test funds were stranded.

## Post-deployment verification

- Python compilation: passed
- Static tests: 4 passed
- Direct GenLayer tests: 38 passed
- GenVM lint: 3 checks passed, no warnings
- Live deployment: `MAJORITY_AGREE`, finalized
- Three requested live E2E scenarios: passed

# Testing and operating Credit Sentinel

This document describes the repository as deployed on 2026-10-12. It contains no hypothetical deployment address or unimplemented integration-test path.

## Verified deployment target

| Field | Value |
|---|---|
| Network | GenLayer StudioNet |
| Chain ID | `61999` |
| Contract | `0xB15FfAa6A42901Db55d985f24F99806C9e563a43` |
| Deployment transaction | `0xacc98388694842a1cf4c0f2e917f0b9c63d037bbf93ca6ac8d73ff54249c9134` |
| Deployer | `0x1c2e587043568239B2fcaeC5f96F278EB134b7f5` |
| Deployment result | `MAJORITY_AGREE`, `FINALIZED` |
| Source SHA-256 | `ee80f682f2620f1840068f57761d7f2347bd383e6aa4d08baea152ca698fcae0` |

The authoritative machine-readable record is `proof/deployment.json`. Detailed live outcomes and transaction hashes are in `docs/LIVE_TEST_REPORT.md`.

## Offline verification

Python 3.12 or newer and the GenLayer test tools are required:

```bash
python3 -m pip install -r requirements-dev.txt
python3 -m py_compile contracts/credit_sentinel.py
python3 -m pytest -q tests/static
gltest tests/direct -q
genvm-lint lint contracts/credit_sentinel.py --json
shasum -a 256 contracts/credit_sentinel.py
```

Verified results on the deployed source:

- Python compilation succeeded.
- Static identity and safety checks: `4 passed`.
- Direct GenLayer behavior tests: `38 passed`.
- GenVM lint: `3 passed`, no warnings.
- SHA-256 matched the deployment record.

Direct tests deliberately mock web and model calls. They cover validation, authorization, escrow accounting, principal readiness, repayment, cancellation, cooldowns, challenges, three breach tiers, maturity settlement, double-claim prevention, and safe `INCONCLUSIVE` handling. Challenge-specific coverage proves that an unusable challenge URL reverts before storage and leaves the breach, evidence count, and both parties' challenge lanes unchanged.

## Live runner setup

Install JavaScript dependencies:

```bash
npm install
```

The scripts read named GenLayer CLI accounts from the operating-system keychain. The verified run used:

| Role | CLI account | Address |
|---|---|---|
| Lender/deployer | `cw-lender-e2e` | `0x1c2e587043568239B2fcaeC5f96F278EB134b7f5` |
| Borrower | `cw-borrower-e2e` | `0x034d85C75b3902892C2F1D5887744Ab65d333176` |

Unlock those accounts before running live writes. Never put private keys or keystore passwords in this repository.

## Reproduce live E2E coverage

Run the three-scenario suite against the verified deployment:

```bash
CREDIT_SENTINEL_CONTRACT=0xB15FfAa6A42901Db55d985f24F99806C9e563a43 \
  npm run test:live
```

The runner uses these real public sources:

```text
https://en.wikipedia.org/wiki/Bitcoin
https://river.com/learn/terms/1/21-million/
https://www.fidelitydigitalassets.com/research-and-insights/understanding-bitcoin-and-ethereum-supply
```

Expected outcomes:

1. `max_bitcoin_supply == 21000000` becomes finalized `COMPLIANT`, allows the principal draw, and completes repayment plus both settlement claims.
2. `max_bitcoin_supply >= 22000000` observes `21000000.000000`, becomes an unfinalized `BREACH`, and opens the mandatory six-hour challenge window. Any proposed challenge URL must independently return `COMPLIANT` before it is admitted; three admitted URLs from one party must then corroborate compliance while the original publisher set is re-read.
3. An undrawn facility is cancelled before collateral and returns the full principal through `claim_settlement`.

Every write waits for StudioNet finality. The model-backed checks perform real independent validator fetches; they can take several minutes.

## Deploy a new instance

Deployment is an external state change and creates a new contract identity:

```bash
DEPLOYER_ACCOUNT=cw-lender-e2e npm run deploy:studionet
```

The runner prints the submission hash, finalized contract address, receipt status, and consensus receipt. After deployment:

1. Record the new address and transaction in `proof/deployment.json`.
2. Recompute and record the exact source SHA-256.
3. Run the offline verification commands.
4. Run `scripts/live_e2e.mjs` against the new address.
5. Replace, rather than append to, stale deployment claims in README and reports.

## StudioNet transport recovery

During the verified run, StudioNet once returned an HTML gateway response while the client was polling `eth_getTransactionByHash`. The submitted transaction was not lost. The E2E runner now retries receipt polling. If the host's Node TLS transport remains unstable, route JSON-RPC through a local curl bridge and set `GENLAYER_RPC_URL` to that bridge. Before retrying a write, read contract state or inspect the original transaction hash to avoid duplicating an already-finalized action.

The interrupted loan from the verified run was resumed by ID and completely repaid and settled; no accidental test balance remained stranded.

## Local GLSim option

`gltest.config.yaml` retains a `localnet` target at `http://127.0.0.1:4123/api` for development. A typical five-validator process is:

```bash
glsim --port 4123 --validators 5 --llm-provider openai:gpt-4o-mini
```

GLSim results are development evidence only. They do not replace the StudioNet deployment and transaction evidence recorded in this repository.

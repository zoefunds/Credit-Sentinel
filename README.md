# Credit Sentinel

Credit Sentinel is a standalone GenLayer Intelligent Contract for collateralized, GEN-denominated loans with publicly verifiable numeric covenants. A lender commits the evidence sources, comparison rule, threshold, and consequence schedule when the loan is originated. Neither party can later replace those terms. GenLayer validators independently inspect the committed sources, agree on a structured result, and the contract applies economic consequences through deterministic code.

## Verified StudioNet deployment

| Field | Verified value |
|---|---|
| Network | GenLayer StudioNet |
| Chain ID | `61999` |
| Contract | `0x6c9D7850C726c1a49295DCd43DDBfF3E489D416b` |
| Deployment transaction | `0x6682e6661fe395cb586f99d167849c3ebed20c9cf27d18ceb0b91a1a788a6e76` |
| Deployment consensus | `MAJORITY_AGREE`, finalized; 5/5 validator votes agree |
| Deployer | `0x1c2e587043568239B2fcaeC5f96F278EB134b7f5` |
| Contract class | `CreditSentinel` |
| Submitted source | [`0c35720`](https://github.com/zoefunds/Credit-Sentinel/commit/0c35720d6f487cbb1adec5264182c478b59879cb) |
| Source SHA-256 | `672a79635c870171a66f646d1fd2192a695dec0497093f06b11cc14bbc51f8e5` |
| Deployment date | 2026-10-19 |

See [the deployment record](proof/deployment.json) for machine-readable identity and [the live report](docs/LIVE_TEST_REPORT.md) for every E2E transaction.

## What the contract enforces

- Principal is escrowed by the lender at loan creation; collateral must be posted by the named borrower in the exact agreed amount.
- Every loan contains one to eight precommitted covenants with a source type, source reference set, field, operator, numeric threshold, description, and consequence schedule.
- Offchain covenants require three to five unique public HTTPS sources on distinct hostnames.
- Vague conditions such as “financially healthy” or “commercially reasonable” are rejected at creation.
- Validators independently fetch and interpret every committed source. A strict publisher majority must corroborate a numeric value within a 2% tolerance.
- Unreachable evidence, malformed model output, insufficient publisher agreement, or validator disagreement produces `INCONCLUSIVE`, never an invented compliance or breach result.
- A borrower cannot draw principal until every covenant's latest check is finalized `COMPLIANT`.
- Breaches open a challenge window before irreversible consequences. A candidate challenge URL is stored only after independent validator inspection establishes a usable `COMPLIANT` observation. Each party has a separate three-source lane; unusable, ambiguous, unreachable, or breach-supporting URLs revert without consuming either party's lane. A lane can overturn only when its three admitted sources corroborate compliance and the original precommitted publisher set is independently re-read.
- Nondeterministic evaluation never moves funds. Transfers occur only in deterministic pull-settlement paths with ledger balances zeroed before transfer.

## Loan and breach lifecycle

```text
CREATED --lock collateral--> ACTIVE --repay--> REPAID
   |                          |
   +--cancel before lock------> CANCELLED
                              |
                              +--1st finalized breach--> BREACH_TIER1
                              +--2nd finalized breach--> BREACH_TIER2
                              +--3rd finalized breach--> DEFAULTED
```

Tier 1 applies the precommitted interest increase. Tier 2 allocates the precommitted collateral portion to the lender. Tier 3 defaults the loan and allocates the remaining collateral. A matured drawn loan that remains unpaid after the fixed grace period defaults; an undrawn matured loan unwinds its escrows.

## Public API

Write methods:

- `create_loan`
- `lock_collateral`
- `claim_principal`
- `trigger_covenant_check`
- `submit_challenge_evidence`
- `finalize_covenant_check`
- `repay_loan`
- `settle_matured_loan`
- `reclaim_collateral_timeout`
- `cancel_loan`
- `claim_settlement`

Read methods:

- `get_loan`, `get_covenant`, `get_loan_covenants`
- `get_check`, `get_check_history`, `get_covenant_check_history`
- `get_challenge_state`, `get_cooldown_remaining`
- `get_loan_count`, `get_current_time`, `can_claim_principal`

## Historical real-data E2E results

Validators used three independent public sources from Wikipedia, River Financial, and Fidelity Digital Assets to corroborate Bitcoin's maximum supply as `21,000,000.000000`.

| Scenario | Contract result | Final state |
|---|---|---|
| `max_bitcoin_supply == 21,000,000`; 1,000,000 wei principal, 2,000,000 wei collateral, 475 bps | `COMPLIANT`, 3/3 sources | Principal drawn, loan `REPAID`, both settlements claimed |
| `max_bitcoin_supply >= 22,000,000`; 1,200,000 wei principal, 2,400,000 wei collateral, 525 bps | `BREACH`, observed 21,000,000, six-hour challenge opened | `ACTIVE` during challenge; no early consequence |
| Undrawn bridge facility; 1,500,000 wei principal, 3,000,000 wei required collateral, 450 bps | Cancelled before collateral | `CANCELLED`, full lender refund claimed |

These were live StudioNet writes with real validator web fetches and model execution. No local fixture, placeholder fact, mocked web response, or forced verdict was used. They were performed on the superseded v1 instance and demonstrate the loan lifecycle, not the v2 challenge-flow remediation. See [the live report](docs/LIVE_TEST_REPORT.md) for the active v2 deployment identity and its verification scope.

The active v2 instance separately passed a live challenge-admission guard: its original three-source check recorded an open `BREACH` at `21,000,000.000000`; the unreachable distinct-host URL `https://challenge-evidence-missing.invalid/report` rolled back in transaction `0x9a882cee8fa0754423385d4e1332fb951b7ea5faf3e4ab42c08b3d194f073273`. A finalized read then confirmed the breach remained open with `challenge_count = 0` and no stored challenge URLs or submitters.

## Repository layout

```text
contracts/credit_sentinel.py          deployment source
tests/direct/                         41 direct-mode behavior tests
tests/static/                         identity and safety checks
scripts/deploy_studionet.mjs          keychain-backed StudioNet deployer
scripts/live_e2e.mjs                  three-scenario finalized E2E runner
scripts/live_challenge_guard.mjs      live rejected-challenge/no-state-change guard
proof/deployment.json                 deployment identity
docs/LIVE_TEST_REPORT.md              detailed live evidence and transactions
docs/TESTING.md                       reproduction and operations guide
gltest.config.yaml                    local and StudioNet targets
```

## Verify

```bash
python3 -m pip install -r requirements-dev.txt
python3 -m py_compile contracts/credit_sentinel.py
python3 -m pytest -q tests/static
gltest tests/direct -q
genvm-lint lint contracts/credit_sentinel.py --json
```

Verified result: 46 tests passed and all three GenVM lint checks passed without warnings.

For exact live commands, account requirements, retry behavior, and redeployment steps, see [docs/TESTING.md](docs/TESTING.md).

## Security boundary

This contract executes economic transfers. Review source, terms, evidence URLs, thresholds, challenge duration, and consequence basis points before deployment or use. The recorded StudioNet instance is a verified test deployment, not a representation that any real-world borrower, lender, asset, or publication has endorsed a loan.

## License

No license file is present. No permission beyond rights implied by the repository's availability is granted until the maintainers add an explicit license.

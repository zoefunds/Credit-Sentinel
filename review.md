# Challenge-flow remediation review

This review records the changes made in response to the team’s challenge-flow findings:

> Arbitrary distinct-host URLs could produce `INCONCLUSIVE`, finalize a previously corroborated breach without consequence, and consume all available challenge submissions.

## Scope and active deployment

| Item | Value |
|---|---|
| Active contract | `0x6c9D7850C726c1a49295DCd43DDBfF3E489D416b` |
| Network | GenLayer StudioNet, chain ID `61999` |
| Deployment transaction | `0x6682e6661fe395cb586f99d167849c3ebed20c9cf27d18ceb0b91a1a788a6e76` |
| Deployment consensus | `MAJORITY_AGREE`, finalized; 5/5 validator votes agree |
| Exact deployed-source commit | [`0c35720`](https://github.com/zoefunds/Credit-Sentinel/commit/0c35720d6f487cbb1adec5264182c478b59879cb) |
| Source SHA-256 | `672a79635c870171a66f646d1fd2192a695dec0497093f06b11cc14bbc51f8e5` |

The previous StudioNet address, `0xB15FfAa6A42901Db55d985f24F99806C9e563a43`, is superseded for challenge adjudication. It must not be used as the active contract.

## Finding-to-fix traceability

| Team concern | Implemented correction | Result |
|---|---|---|
| Challenge evidence could replace the original evidence set. | `_evaluate_offchain` always evaluates the covenant’s precommitted source set first. | Original evidence remains the authoritative starting point for every challenge decision. |
| Non-corroborating URLs could erase a breach through `INCONCLUSIVE`. | A non-corroborating, ambiguous, or breach-supporting challenge lane returns a pending `BREACH`; the submit path does not mutate or finalize the existing check on that result. | The established breach remains open until the challenge window closes or a valid override succeeds. |
| Arbitrary URLs could consume all submissions. | Each candidate URL is consensus-evaluated before it is stored. It must independently establish `COMPLIANT`; failed candidates revert before any state mutation. | Unusable, unreachable, ambiguous, and breach-supporting URLs consume no capacity. |
| One party could deny the other a meaningful challenge opportunity. | Challenge capacity is split into separate three-source lanes per party, for six admitted URLs total. Submitter addresses are stored alongside admitted evidence. | One party can admit at most three sources and cannot exhaust the other party’s lane. |
| A contrary claim could override without independent corroboration. | Only a caller’s third admitted, distinct-host source invokes lane adjudication. That three-source lane must corroborate `COMPLIANT`, while the original source set is re-read. | A breach can be overturned only by independently corroborated contrary compliance evidence. |

## Contract behavior after remediation

1. A finalized original `BREACH` opens the normal challenge window.
2. Either loan party may submit a distinct-host candidate URL to their own lane.
3. Validators first evaluate that one URL. If it is not independently `COMPLIANT`, the transaction rolls back and stores nothing.
4. On a party’s third admitted URL, validators evaluate the three-source lane and independently re-read the original precommitted sources.
5. Only a corroborated `COMPLIANT` lane can overturn the breach. All other lane outcomes preserve the prior open breach.
6. When the challenge window expires with no successful override, normal deterministic breach finalization applies.

## Verification evidence

### Offline verification

The exact submitted contract source passed:

- Python compilation.
- 5 static safety tests.
- 39 direct GenLayer behavior tests.
- 3 GenVM lint checks with no warnings.

The direct tests cover the failure mode explicitly: an unusable challenge candidate reverts, leaves the check in `BREACH`, leaves the evidence count at zero, and does not prevent a later valid submission from the other party.

### Live StudioNet guard test

The active v2 deployment was tested with real, public Bitcoin supply evidence from Wikipedia, River Financial, and Fidelity Digital Assets.

| Step | Transaction / observation |
|---|---|
| Three-source original check | `0x10558b4824d5d8b5d23484de69231ae9d612fb0eb2a5981078ff1971ac57a88d` |
| Original result | Open `BREACH`; `21000000.000000`; `corroborated by 3/3 independent publishers` |
| Rejected candidate | `https://challenge-evidence-missing.invalid/report` |
| Challenge submission | `0x9a882cee8fa0754423385d4e1332fb951b7ea5faf3e4ab42c08b3d194f073273` |
| Consensus outcome | Expected rollback: `challenge URL did not independently establish contrary compliant evidence` |
| Finalized postcondition | `BREACH`, `finalized = false`, `challenge_count = 0`, zero stored URLs, zero stored submitters |

The validator receipt reported `independent-source quorum not reached (0/1)` for the unreachable URL. The finalized state read proves that the rejected transaction did not erase the breach or consume either party’s challenge capacity.

## Operational artifacts

- [Contract source](contracts/credit_sentinel.py)
- [Deployment record](proof/deployment.json)
- [Live verification report](docs/LIVE_TEST_REPORT.md)
- [Testing and operations guide](docs/TESTING.md)
- [Reproducible live challenge guard](scripts/live_challenge_guard.mjs)

The source remediation was committed in `0c35720`; the deployment evidence was added in the following documentation commit. This review consolidates the remediation, test, and deployment trail.

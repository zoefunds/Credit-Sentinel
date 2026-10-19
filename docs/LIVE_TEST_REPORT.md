# Credit Sentinel StudioNet verification report

## Active deployment — challenge-safe v2

| Field | Value |
|---|---|
| Date | 2026-10-19 |
| Network | GenLayer StudioNet (`61999`) |
| Contract | `0x6c9D7850C726c1a49295DCd43DDBfF3E489D416b` |
| Deployment transaction | `0x6682e6661fe395cb586f99d167849c3ebed20c9cf27d18ceb0b91a1a788a6e76` |
| Consensus | `MAJORITY_AGREE` / `FINALIZED`; 5/5 validator votes agree |
| Deployer | `0x1c2e587043568239B2fcaeC5f96F278EB134b7f5` |
| Submitted source commit | [`0c35720`](https://github.com/zoefunds/Credit-Sentinel/commit/0c35720d6f487cbb1adec5264182c478b59879cb) |
| Source SHA-256 | `672a79635c870171a66f646d1fd2192a695dec0497093f06b11cc14bbc51f8e5` |

This is the current contract to use. Its deployment input was the exact `contracts/credit_sentinel.py` file at commit `0c35720`; the SHA-256 above is the matching source identity. The prior instance, `0xB15FfAa6A42901Db55d985f24F99806C9e563a43`, is retained only as historical E2E evidence and must not be used for challenge adjudication.

### Challenge-flow guarantees deployed in v2

- The original, precommitted publisher set is re-read before any challenge lane is considered.
- A URL is admitted only when its own consensus evaluation establishes `COMPLIANT`; unreachable, malformed, ambiguous, or breach-supporting submissions revert before storage.
- Each party has an independent three-source lane, with a six-source aggregate capacity. A failed submission consumes no party's capacity.
- A lane can overturn a breach only if its three distinct-host admitted sources independently corroborate `COMPLIANT` while the original set is re-read. Any non-corroborating lane leaves the original breach open and unchanged.

## Verification run against the submitted source

| Check | Result |
|---|---|
| Python compilation | passed |
| Static safety checks | 5 passed |
| Direct GenLayer behavior tests | 41 passed |
| GenVM lint | 3 checks passed; no warnings |
| StudioNet deployment | finalized with `MAJORITY_AGREE`, 5/5 agree |

## Live v2 challenge-admission guard

This stateful StudioNet test was executed against the active v2 address after deployment.

| Field | Observed result |
|---|---|
| Test loan / covenant | `0` / `0` |
| Original evidence check | `0x10558b4824d5d8b5d23484de69231ae9d612fb0eb2a5981078ff1971ac57a88d` |
| Original sources | Wikipedia, River Financial, Fidelity Digital Assets |
| Original result | open `BREACH`; `21000000.000000`; `corroborated by 3/3 independent publishers` |
| Candidate challenge URL | `https://challenge-evidence-missing.invalid/report` |
| Challenge transaction | `0x9a882cee8fa0754423385d4e1332fb951b7ea5faf3e4ab42c08b3d194f073273` |
| Challenge execution | expected rollback: `challenge URL did not independently establish contrary compliant evidence` |
| Final check state | `BREACH`, `finalized = false`, `challenge_count = 0`, zero stored URLs and submitters |

The validator receipt recorded no usable evidence from the `.invalid` host (`independent-source quorum not reached (0/1)`) and rolled the whole write back. The subsequent finalized state read proves that the failed attempt neither erased the original breach nor consumed either party's challenge capacity.

The direct suite uses URL-specific evidence responses to verify the actual adjudication boundary: original publishers can remain `BREACH` while a distinct three-source contrary lane is required to overturn it; three individually admissible but mutually non-corroborating candidates preserve the open breach; and an `INCONCLUSIVE` candidate reverts before storage. It also verifies that each party retains a separate lane.

## Historical real-data E2E record (v1, not the active instance)

The following historical StudioNet transactions used three independent public sources that report Bitcoin's fixed maximum supply: Wikipedia, River Financial, and Fidelity Digital Assets. They were executed on the superseded v1 deployment above. They demonstrate real validator web retrieval and the broader loan lifecycle, but are not evidence for v2 challenge adjudication.

| Scenario | Result | Key transaction |
|---|---|---|
| `max_bitcoin_supply == 21,000,000`; 1,000,000 wei principal / 2,000,000 wei collateral / 475 bps | `COMPLIANT`, principal drawn, repaid, both settlements claimed | check `0x0df3b13684c795e89328c6e2c7ded32c171976d94e5ea8296dfcc6e7e1163858` |
| `max_bitcoin_supply >= 22,000,000`; 1,200,000 wei principal / 2,400,000 wei collateral / 525 bps | `BREACH`, observed `21,000,000`, challenge window opened | check `0x4fb00205dd9fe885bb1170bdb8bf19e4ce8bc3478001f28856bf7a4aeb2002dd` |
| Undrawn bridge facility; 1,500,000 wei principal / 3,000,000 wei collateral / 450 bps | cancelled and lender refund claimed | refund `0x94fdc6d9b4d6a9f46f9ac35d0c5ced56b7223f7e7d3c55847d6a0cbc5f8b6659` |

The concrete evidence URLs were:

1. `https://en.wikipedia.org/wiki/Bitcoin`
2. `https://river.com/learn/terms/1/21-million/`
3. `https://www.fidelitydigitalassets.com/research-and-insights/understanding-bitcoin-and-ethereum-supply`

The historical checks observed `21000000.000000` with a 3/3 publisher quorum. They used no local fixture, placeholder fact, mocked web response, or forced verdict.

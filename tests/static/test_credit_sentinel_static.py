import ast
from pathlib import Path


SOURCE = Path(__file__).parents[2] / "contracts" / "credit_sentinel.py"


def _tree():
    return ast.parse(SOURCE.read_text())


def _contract():
    return next(
        node
        for node in _tree().body
        if isinstance(node, ast.ClassDef) and node.name == "CreditSentinel"
    )


def test_contract_parses_and_has_new_identity():
    assert _contract().name == "CreditSentinel"
    source = SOURCE.read_text()
    assert "CovenantWatch" not in source
    assert "Covenant Watch" not in source
    assert "covenant_watch" not in source
    assert "Credit Sentinel" in source


def test_public_lifecycle_api_is_present():
    methods = {node.name for node in _contract().body if isinstance(node, ast.FunctionDef)}
    assert {
        "create_loan",
        "lock_collateral",
        "claim_principal",
        "trigger_covenant_check",
        "submit_challenge_evidence",
        "finalize_covenant_check",
        "repay_loan",
        "claim_settlement",
        "cancel_loan",
        "settle_matured_loan",
        "get_loan",
        "get_covenant",
        "get_check",
    } <= methods


def test_consensus_and_transfer_boundaries_are_explicit():
    source = SOURCE.read_text()
    assert "gl.vm.run_nondet_unsafe" in source
    assert source.count("emit_transfer(") == 1
    assert "COVENANT_INCONCLUSIVE" in source
    assert "MIN_OFFCHAIN_SOURCES: int = 3" in source
    assert "MAX_OFFCHAIN_SOURCES: int = 5" in source


def test_challenge_adjudication_cannot_replace_or_erase_original_breach():
    source = SOURCE.read_text()
    # Original publishers are always re-evaluated before a challenge lane.
    assert "original = self._evaluate_source_set(covenant, source_urls)" in source
    assert "if int(original[\"status\"]) == COVENANT_COMPLIANT:" in source
    # A party URL must independently establish compliance before storage.
    assert "_run_challenge_submission_evaluation(covenant, url)" in source
    assert "challenge URL did not independently establish contrary compliant evidence" in source
    # Failed corroboration explicitly preserves BREACH instead of finalizing
    # an INCONCLUSIVE no-op.
    assert '"status": COVENANT_BREACH' in source
    assert "contrary evidence did not corroborate compliance" in source
    # Each party owns a separate three-source lane.
    assert "MAX_CHALLENGE_EVIDENCE_PER_PARTY: int = 3" in source
    assert "challenge_evidence_submitters: DynArray[Address]" in source
    assert "caller_admitted_count < MAX_CHALLENGE_EVIDENCE_PER_PARTY" in source


def test_contract_uses_consensus_time_not_wall_clock():
    source = SOURCE.read_text()
    assert "datetime.datetime.now(datetime.timezone.utc)" in source
    assert "caller-supplied argument" in source

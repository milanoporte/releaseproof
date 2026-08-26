import json


CONTRACT = "contracts/ReleaseProof.py"
CRITERIA = """Mandatory requirements:
- Public source repository
- Installation instructions
- Automated tests
"""


def create_default(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy(CONTRACT)
    direct_vm.sender = direct_alice
    contract.create_verification(
        "release-001",
        "https://github.com/example/project.git",
        "v1.0.0",
        CRITERIA,
    )
    return contract


def mock_result(direct_vm, verdict, score, met, total=3):
    direct_vm.mock_web(r".*github\.com.*", {"status": 200, "body": "Repository README, tests, and release evidence."})
    direct_vm.mock_llm(
        r".*verify whether a software repository or release.*",
        json.dumps({
            "verdict": verdict,
            "score": score,
            "reason_code": "TEST_REASON",
            "criteria_met": met,
            "criteria_total": total,
            "summary": "Independent evidence-based assessment.",
        }),
    )


def prepare_validator(direct_vm, direct_deploy, direct_alice):
    contract = create_default(direct_vm, direct_deploy, direct_alice)
    mock_result(direct_vm, "VERIFIED", 90, 3)
    contract.request_verification("release-001")
    assert direct_vm._captured_validators
    return contract


def test_create_verification(direct_vm, direct_deploy, direct_alice):
    contract = create_default(direct_vm, direct_deploy, direct_alice)
    value = contract.get_verification("release-001")
    assert value["repository_url"] == "https://github.com/example/project"
    assert value["release_ref"] == "v1.0.0"
    assert value["status"] == "CREATED"
    assert value["score"] == 0


def test_duplicate_id_rejected(direct_vm, direct_deploy, direct_alice):
    contract = create_default(direct_vm, direct_deploy, direct_alice)
    with direct_vm.expect_revert("Verification already exists"):
        contract.create_verification("release-001", "https://github.com/a/b", "", CRITERIA)


def test_invalid_repository_url_rejected(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy(CONTRACT)
    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("Repository URL must be an HTTPS GitHub repository URL"):
        contract.create_verification("bad", "https://gitlab.com/a/b", "", CRITERIA)


def test_request_unknown_verification_rejected(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy(CONTRACT)
    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("Verification does not exist"):
        contract.request_verification("missing")


def test_verified_result(direct_vm, direct_deploy, direct_alice):
    contract = create_default(direct_vm, direct_deploy, direct_alice)
    mock_result(direct_vm, "VERIFIED", 94, 3)
    contract.request_verification("release-001")
    value = contract.get_verification("release-001")
    assert value["status"] == value["verdict"] == "VERIFIED"
    assert value["score"] == 94


def test_verified_four_of_four_with_percentage_score_is_valid(
    direct_vm, direct_deploy, direct_alice
):
    contract = create_default(direct_vm, direct_deploy, direct_alice)
    mock_result(direct_vm, "VERIFIED", 100, 4, total=4)
    result = contract.request_verification("release-001")
    assert result["criteria_met"] == result["criteria_total"] == 4
    assert contract.get_verification("release-001")["score"] == 100


def test_verified_four_of_four_with_count_as_score_is_invalid(
    direct_vm, direct_deploy, direct_alice
):
    contract = create_default(direct_vm, direct_deploy, direct_alice)
    mock_result(direct_vm, "VERIFIED", 4, 4, total=4)
    with direct_vm.expect_revert("Evaluation returned an invalid result"):
        contract.request_verification("release-001")


def test_failed_result(direct_vm, direct_deploy, direct_alice):
    contract = create_default(direct_vm, direct_deploy, direct_alice)
    mock_result(direct_vm, "FAILED", 35, 1)
    contract.request_verification("release-001")
    assert contract.get_verification("release-001")["status"] == "FAILED"


def test_inconclusive_result(direct_vm, direct_deploy, direct_alice):
    contract = create_default(direct_vm, direct_deploy, direct_alice)
    mock_result(direct_vm, "INCONCLUSIVE", 50, 1)
    contract.request_verification("release-001")
    assert contract.get_verification("release-001")["status"] == "INCONCLUSIVE"


def test_validator_matching_verdict_accepted(direct_vm, direct_deploy, direct_alice):
    prepare_validator(direct_vm, direct_deploy, direct_alice)
    assert direct_vm.run_validator() is True


def test_validator_conflicting_verdict_rejected(direct_vm, direct_deploy, direct_alice):
    prepare_validator(direct_vm, direct_deploy, direct_alice)
    direct_vm.clear_mocks()
    mock_result(direct_vm, "FAILED", 85, 2)
    assert direct_vm.run_validator() is False


def test_score_difference_within_tolerance_accepted(direct_vm, direct_deploy, direct_alice):
    prepare_validator(direct_vm, direct_deploy, direct_alice)
    direct_vm.clear_mocks()
    mock_result(direct_vm, "VERIFIED", 80, 3)
    assert direct_vm.run_validator() is True


def test_score_difference_above_tolerance_rejected(direct_vm, direct_deploy, direct_alice):
    prepare_validator(direct_vm, direct_deploy, direct_alice)
    direct_vm.clear_mocks()
    mock_result(direct_vm, "VERIFIED", 74, 3)
    assert direct_vm.run_validator() is False

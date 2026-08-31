import json


CONTRACT = "contracts/ReleaseProof.py"
SHA = "0123456789abcdef0123456789abcdef01234567"
UPPER_SHA = SHA.upper()
REPOSITORY = "https://github.com/example/project"
ORDINARY_CRITERIA = """Mandatory requirements:
- Installation documentation exists
- MIT license is present
"""


def create_verification(
    direct_vm,
    direct_deploy,
    direct_alice,
    criteria=ORDINARY_CRITERIA,
    release_ref="",
    commit_sha=SHA,
):
    contract = direct_deploy(CONTRACT)
    direct_vm.sender = direct_alice
    contract.create_verification(
        "release-001", REPOSITORY + ".git", commit_sha, release_ref, criteria
    )
    return contract


def mock_assessment(direct_vm, verdict="VERIFIED", score=95, met=2, total=2):
    direct_vm.mock_llm(
        r".*verify whether a software repository or release.*",
        json.dumps({
            "verdict": verdict,
            "score": score,
            "reason_code": "TEST_REASON",
            "criteria_met": met,
            "criteria_total": total,
            "summary": "Independent commit-bound assessment.",
        }),
    )


def mock_core_evidence(direct_vm, sha=SHA):
    direct_vm.mock_web(
        rf"{REPOSITORY}/commit/{sha}$",
        {"status": 200, "body": f"Commit {sha} in example/project"},
    )
    direct_vm.mock_web(
        rf"{REPOSITORY}/tree/{sha}$",
        {"status": 200, "body": f"Tree for commit {sha}"},
    )
    direct_vm.mock_web(
        rf"{REPOSITORY}/blob/{sha}/README\.md$",
        {"status": 200, "body": "Pinned installation documentation and MIT license."},
    )


def request_with_core(direct_vm, contract, verdict="VERIFIED", score=95, met=2, total=2):
    mock_core_evidence(direct_vm)
    mock_assessment(direct_vm, verdict, score, met, total)
    return contract.request_verification("release-001")


def prepare_validator(direct_vm, direct_deploy, direct_alice):
    contract = create_verification(direct_vm, direct_deploy, direct_alice)
    request_with_core(direct_vm, contract, score=96)
    assert direct_vm._captured_validators
    return contract


def prepare_inconclusive_validator(direct_vm, direct_deploy, direct_alice):
    contract = create_verification(direct_vm, direct_deploy, direct_alice)
    request_with_core(direct_vm, contract, "INCONCLUSIVE", 50, 1, 2)
    assert direct_vm._captured_validators
    return contract


# Input and storage


def test_valid_full_commit_sha_accepted(direct_vm, direct_deploy, direct_alice):
    contract = create_verification(direct_vm, direct_deploy, direct_alice)
    value = contract.get_verification("release-001")
    assert value["repository_url"] == REPOSITORY
    assert value["commit_sha"] == SHA
    assert value["status"] == "CREATED"


def test_uppercase_commit_sha_normalized(direct_vm, direct_deploy, direct_alice):
    contract = create_verification(
        direct_vm, direct_deploy, direct_alice, commit_sha=UPPER_SHA
    )
    assert contract.get_verification("release-001")["commit_sha"] == SHA


def test_invalid_commit_shas_rejected(direct_vm, direct_deploy, direct_alice):
    invalid = [SHA[:-1], SHA + "0", "g" * 40, "HEAD", "main", "master", "refs/tags/v1"]
    contract = direct_deploy(CONTRACT)
    direct_vm.sender = direct_alice
    for index, commit_sha in enumerate(invalid):
        with direct_vm.expect_revert("Commit SHA must be a full 40-character hexadecimal hash"):
            contract.create_verification(
                "bad-" + str(index), REPOSITORY, commit_sha, "", ORDINARY_CRITERIA
            )


def test_duplicate_id_rejected(direct_vm, direct_deploy, direct_alice):
    contract = create_verification(direct_vm, direct_deploy, direct_alice)
    with direct_vm.expect_revert("Verification already exists"):
        contract.create_verification("release-001", REPOSITORY, SHA, "", ORDINARY_CRITERIA)


def test_invalid_repository_url_rejected(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy(CONTRACT)
    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("Repository URL must be an HTTPS GitHub repository URL"):
        contract.create_verification("bad", "https://gitlab.com/a/b", SHA, "", ORDINARY_CRITERIA)


# Immutable evidence and verdict gates


def test_commit_pinned_urls_support_verified_flow(direct_vm, direct_deploy, direct_alice):
    contract = create_verification(direct_vm, direct_deploy, direct_alice)
    result = request_with_core(direct_vm, contract)
    assert result["verdict"] == "VERIFIED"
    assert contract.get_verification("release-001")["commit_sha"] == SHA


def test_contract_contains_no_mutable_authoritative_urls():
    with open(CONTRACT, encoding="utf-8") as contract_file:
        source = contract_file.read()
    assert '"/blob/HEAD/' not in source
    assert '"/tree/main' not in source
    assert '"/tree/master' not in source


def test_unavailable_commit_blocks_verified(direct_vm, direct_deploy, direct_alice):
    contract = create_verification(direct_vm, direct_deploy, direct_alice)
    direct_vm.mock_web(rf"{REPOSITORY}/tree/{SHA}$", {"status": 200, "body": "tree"})
    mock_assessment(direct_vm)
    result = contract.request_verification("release-001")
    assert result["verdict"] == "INCONCLUSIVE"
    assert result["reason_code"] == "COMMIT_IDENTITY_UNPROVEN"


def test_unavailable_tree_blocks_verified(direct_vm, direct_deploy, direct_alice):
    contract = create_verification(direct_vm, direct_deploy, direct_alice)
    direct_vm.mock_web(rf"{REPOSITORY}/commit/{SHA}$", {"status": 200, "body": SHA})
    mock_assessment(direct_vm)
    result = contract.request_verification("release-001")
    assert result["verdict"] == "INCONCLUSIVE"
    assert result["reason_code"] == "COMMIT_TREE_UNAVAILABLE"


def test_wrong_commit_evidence_blocks_verified(direct_vm, direct_deploy, direct_alice):
    contract = create_verification(direct_vm, direct_deploy, direct_alice)
    direct_vm.mock_web(rf"{REPOSITORY}/commit/{SHA}$", {"status": 200, "body": "Commit " + "f" * 40})
    direct_vm.mock_web(rf"{REPOSITORY}/tree/{SHA}$", {"status": 200, "body": "tree"})
    mock_assessment(direct_vm)
    result = contract.request_verification("release-001")
    assert result["verdict"] == "INCONCLUSIVE"
    assert result["reason_code"] == "COMMIT_IDENTITY_UNPROVEN"


def test_wrong_abbreviated_sha_is_unproven(direct_vm, direct_deploy, direct_alice):
    contract = create_verification(direct_vm, direct_deploy, direct_alice)
    direct_vm.mock_web(
        rf"{REPOSITORY}/commit/{SHA}$",
        {"status": 200, "body": "Commit fedcba9"},
    )
    direct_vm.mock_web(
        rf"{REPOSITORY}/tree/{SHA}$", {"status": 200, "body": "tree"}
    )
    mock_assessment(direct_vm)
    result = contract.request_verification("release-001")
    assert result["verdict"] == "INCONCLUSIVE"
    assert result["reason_code"] == "COMMIT_IDENTITY_UNPROVEN"


def test_commit_page_with_abbreviated_sha_prefix_is_accepted(
    direct_vm, direct_deploy, direct_alice
):
    contract = create_verification(direct_vm, direct_deploy, direct_alice)
    direct_vm.mock_web(
        rf"{REPOSITORY}/commit/{SHA}$",
        {"status": 200, "body": "Commit " + SHA[:7]},
    )
    direct_vm.mock_web(
        rf"{REPOSITORY}/tree/{SHA}$", {"status": 200, "body": "Pinned tree"}
    )
    mock_assessment(direct_vm)
    assert contract.request_verification("release-001")["verdict"] == "VERIFIED"


def test_unrelated_commit_page_is_unproven(direct_vm, direct_deploy, direct_alice):
    contract = create_verification(direct_vm, direct_deploy, direct_alice)
    direct_vm.mock_web(
        rf"{REPOSITORY}/commit/{SHA}$",
        {"status": 200, "body": "GitHub repository landing page"},
    )
    direct_vm.mock_web(
        rf"{REPOSITORY}/tree/{SHA}$", {"status": 200, "body": "tree"}
    )
    mock_assessment(direct_vm)
    result = contract.request_verification("release-001")
    assert result["verdict"] == "INCONCLUSIVE"
    assert result["reason_code"] == "COMMIT_IDENTITY_UNPROVEN"


def test_failed_flow(direct_vm, direct_deploy, direct_alice):
    contract = create_verification(direct_vm, direct_deploy, direct_alice)
    request_with_core(direct_vm, contract, "FAILED", 30, 1)
    assert contract.get_verification("release-001")["status"] == "FAILED"


def test_inconclusive_flow_with_missing_evidence(direct_vm, direct_deploy, direct_alice):
    contract = create_verification(direct_vm, direct_deploy, direct_alice)
    mock_assessment(direct_vm, "INCONCLUSIVE", 20, 0)
    contract.request_verification("release-001")
    assert contract.get_verification("release-001")["status"] == "INCONCLUSIVE"


def test_low_score_verified_is_invalid(direct_vm, direct_deploy, direct_alice):
    contract = create_verification(direct_vm, direct_deploy, direct_alice)
    mock_core_evidence(direct_vm)
    mock_assessment(direct_vm, "VERIFIED", 79, 2)
    result = contract.request_verification("release-001")
    assert result["verdict"] == "INCONCLUSIVE"
    assert result["reason_code"] == "VERIFIED_GATES_NOT_MET"


def test_partial_criteria_verified_is_invalid(direct_vm, direct_deploy, direct_alice):
    contract = create_verification(direct_vm, direct_deploy, direct_alice)
    mock_core_evidence(direct_vm)
    mock_assessment(direct_vm, "VERIFIED", 95, 1, 2)
    result = contract.request_verification("release-001")
    assert result["verdict"] == "INCONCLUSIVE"
    assert result["reason_code"] == "VERIFIED_GATES_NOT_MET"


# Release relationship


def mock_release_evidence(direct_vm, ref="v1.0.0", target=SHA):
    direct_vm.mock_web(rf"{REPOSITORY}/releases/tag/{ref}$", {"status": 200, "body": "Release assets"})
    direct_vm.mock_web(rf"{REPOSITORY}/commit/{ref}$", {"status": 200, "body": f"Commit {target}"})
    direct_vm.mock_web(rf"{REPOSITORY}/tree/{ref}$", {"status": 200, "body": f"Tree {target}"})


def test_release_ref_resolves_to_same_sha(direct_vm, direct_deploy, direct_alice):
    contract = create_verification(direct_vm, direct_deploy, direct_alice, release_ref="v1.0.0")
    mock_core_evidence(direct_vm)
    mock_release_evidence(direct_vm)
    mock_assessment(direct_vm)
    assert contract.request_verification("release-001")["verdict"] == "VERIFIED"


def test_release_ref_resolving_to_different_sha_fails(direct_vm, direct_deploy, direct_alice):
    contract = create_verification(direct_vm, direct_deploy, direct_alice, release_ref="v1.0.0")
    mock_core_evidence(direct_vm)
    mock_release_evidence(direct_vm, target="f" * 40)
    mock_assessment(direct_vm)
    result = contract.request_verification("release-001")
    assert result["verdict"] == "FAILED"
    assert result["reason_code"] == "RELEASE_TARGET_MISMATCH"


def test_unavailable_release_association_is_inconclusive(direct_vm, direct_deploy, direct_alice):
    contract = create_verification(direct_vm, direct_deploy, direct_alice, release_ref="v1.0.0")
    mock_core_evidence(direct_vm)
    direct_vm.mock_web(rf"{REPOSITORY}/releases/tag/v1\.0\.0$", {"status": 200, "body": "Release exists"})
    mock_assessment(direct_vm)
    result = contract.request_verification("release-001")
    assert result["verdict"] == "INCONCLUSIVE"
    assert result["reason_code"] == "RELEASE_TARGET_UNPROVEN"


def test_empty_release_ref_does_not_require_release_evidence(
    direct_vm, direct_deploy, direct_alice
):
    contract = create_verification(direct_vm, direct_deploy, direct_alice, release_ref="")
    assert request_with_core(direct_vm, contract)["verdict"] == "VERIFIED"


def test_slash_in_release_ref_is_url_encoded(direct_vm, direct_deploy, direct_alice):
    contract = create_verification(direct_vm, direct_deploy, direct_alice, release_ref="release/v1")
    mock_core_evidence(direct_vm)
    mock_release_evidence(direct_vm, ref="release%2Fv1")
    mock_assessment(direct_vm)
    assert contract.request_verification("release-001")["verdict"] == "VERIFIED"


# Conditional evidence


def test_ci_criteria_require_commit_specific_checks(direct_vm, direct_deploy, direct_alice):
    contract = create_verification(direct_vm, direct_deploy, direct_alice, criteria="Mandatory: CI tests passing")
    mock_core_evidence(direct_vm)
    mock_assessment(direct_vm, met=1, total=1)
    result = contract.request_verification("release-001")
    assert result["verdict"] == "INCONCLUSIVE"
    assert result["reason_code"] == "CI_EVIDENCE_UNAVAILABLE"


def test_successful_sha_specific_checks_allow_verified(direct_vm, direct_deploy, direct_alice):
    contract = create_verification(direct_vm, direct_deploy, direct_alice, criteria="Mandatory: GitHub Actions successful")
    mock_core_evidence(direct_vm)
    direct_vm.mock_web(rf"{REPOSITORY}/commit/{SHA}/checks$", {"status": 200, "body": f"All checks successful for {SHA}"})
    mock_assessment(direct_vm, met=1, total=1)
    assert contract.request_verification("release-001")["verdict"] == "VERIFIED"


def test_failed_checks_support_failed(direct_vm, direct_deploy, direct_alice):
    contract = create_verification(direct_vm, direct_deploy, direct_alice, criteria="Mandatory: build passing")
    mock_core_evidence(direct_vm)
    direct_vm.mock_web(rf"{REPOSITORY}/commit/{SHA}/checks$", {"status": 200, "body": f"Build failed for {SHA}"})
    mock_assessment(direct_vm, "FAILED", 90, 0, 1)
    assert contract.request_verification("release-001")["verdict"] == "FAILED"


def test_workflow_file_alone_is_inconclusive(direct_vm, direct_deploy, direct_alice):
    contract = create_verification(direct_vm, direct_deploy, direct_alice, criteria="Mandatory: tests pass")
    mock_core_evidence(direct_vm)
    mock_assessment(direct_vm, "INCONCLUSIVE", 40, 0, 1)
    assert contract.request_verification("release-001")["verdict"] == "INCONCLUSIVE"


def required_category_case(direct_vm, direct_deploy, direct_alice, criteria, release_body):
    contract = create_verification(
        direct_vm, direct_deploy, direct_alice, criteria=criteria, release_ref="v1.0.0"
    )
    mock_core_evidence(direct_vm)
    mock_release_evidence(direct_vm)
    direct_vm.mock_web(rf"{REPOSITORY}/releases/tag/v1\.0\.0$", {"status": 200, "body": release_body})
    mock_assessment(direct_vm, met=1, total=1)
    return contract


def test_artifact_keyword_triggers_artifact_evidence(direct_vm, direct_deploy, direct_alice):
    contract = required_category_case(direct_vm, direct_deploy, direct_alice, "Mandatory release artifact", "asset: app.tar.gz")
    assert contract.request_verification("release-001")["verdict"] == "VERIFIED"


def test_checksum_keyword_triggers_checksum_evidence(direct_vm, direct_deploy, direct_alice):
    contract = required_category_case(direct_vm, direct_deploy, direct_alice, "Mandatory SHA256 checksum", "asset: SHA256SUMS")
    assert contract.request_verification("release-001")["verdict"] == "VERIFIED"


def test_signature_keyword_triggers_signature_evidence(direct_vm, direct_deploy, direct_alice):
    contract = required_category_case(direct_vm, direct_deploy, direct_alice, "Mandatory GPG signature", "asset: app.tar.gz.asc")
    assert contract.request_verification("release-001")["verdict"] == "VERIFIED"


def test_required_supply_chain_category_without_release_blocks_verified(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy(CONTRACT)
    direct_vm.sender = direct_alice
    for index, criteria in enumerate(["Mandatory artifact", "Mandatory checksum"]):
        verification_id = "release-" + str(index)
        contract.create_verification(verification_id, REPOSITORY, SHA, "", criteria)
        mock_core_evidence(direct_vm)
        mock_assessment(direct_vm, met=1, total=1)
        result = contract.request_verification(verification_id)
        assert result["verdict"] == "INCONCLUSIVE"
        direct_vm.clear_mocks()


def test_missing_required_signature_evidence_blocks_verified(direct_vm, direct_deploy, direct_alice):
    contract = create_verification(
        direct_vm, direct_deploy, direct_alice,
        criteria="Mandatory signature", release_ref="v1.0.0",
    )
    mock_core_evidence(direct_vm)
    direct_vm.mock_web(rf"{REPOSITORY}/releases/tag/v1\.0\.0$", {"status": 200, "body": "release"})
    mock_assessment(direct_vm, met=1, total=1)
    result = contract.request_verification("release-001")
    assert result["verdict"] == "INCONCLUSIVE"
    assert result["reason_code"] == "RELEASE_TARGET_UNPROVEN"


def test_ordinary_criteria_do_not_require_supply_chain_evidence(direct_vm, direct_deploy, direct_alice):
    contract = create_verification(direct_vm, direct_deploy, direct_alice)
    assert request_with_core(direct_vm, contract)["verdict"] == "VERIFIED"


def test_nondet_evaluation_does_not_access_storage_dataclass():
    with open(CONTRACT, encoding="utf-8") as contract_file:
        source = contract_file.read()
    evaluate_body = source.split("        def evaluate() -> dict:", 1)[1].split(
        "        def structurally_valid", 1
    )[0]
    assert "verification." not in evaluate_body
    assert "self.verifications" not in evaluate_body


# Validator equivalence


def test_validator_matching_result_accepted(direct_vm, direct_deploy, direct_alice):
    prepare_validator(direct_vm, direct_deploy, direct_alice)
    assert direct_vm.run_validator() is True


def test_validator_verdict_mismatch_rejected(direct_vm, direct_deploy, direct_alice):
    prepare_validator(direct_vm, direct_deploy, direct_alice)
    direct_vm.clear_mocks()
    mock_core_evidence(direct_vm)
    mock_assessment(direct_vm, "FAILED", 90, 1)
    assert direct_vm.run_validator() is False


def test_validator_criteria_met_mismatch_rejected(direct_vm, direct_deploy, direct_alice):
    prepare_inconclusive_validator(direct_vm, direct_deploy, direct_alice)
    direct_vm.clear_mocks()
    mock_core_evidence(direct_vm)
    mock_assessment(direct_vm, "INCONCLUSIVE", 50, 0, 2)
    assert direct_vm.run_validator() is False


def test_validator_criteria_total_mismatch_rejected(direct_vm, direct_deploy, direct_alice):
    prepare_inconclusive_validator(direct_vm, direct_deploy, direct_alice)
    direct_vm.clear_mocks()
    mock_core_evidence(direct_vm)
    mock_assessment(direct_vm, "INCONCLUSIVE", 50, 1, 3)
    assert direct_vm.run_validator() is False


def test_validator_score_within_tolerance_accepted(direct_vm, direct_deploy, direct_alice):
    prepare_validator(direct_vm, direct_deploy, direct_alice)
    direct_vm.clear_mocks()
    mock_core_evidence(direct_vm)
    mock_assessment(direct_vm, "VERIFIED", 81, 2, 2)
    assert direct_vm.run_validator() is True


def test_validator_score_above_tolerance_rejected(direct_vm, direct_deploy, direct_alice):
    prepare_validator(direct_vm, direct_deploy, direct_alice)
    direct_vm.clear_mocks()
    mock_core_evidence(direct_vm)
    mock_assessment(direct_vm, "VERIFIED", 80, 2, 2)
    assert direct_vm.run_validator() is False

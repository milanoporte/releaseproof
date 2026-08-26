# ReleaseProof

ReleaseProof is a GenLayer application for evaluating software-release claims against live, public GitHub evidence. A user records a repository, an optional release reference, and natural-language acceptance criteria. An Intelligent Contract gathers the relevant web pages, asks validators to assess the same evidence, reaches equivalence on a structured result, and persists that result on Studionet.

ReleaseProof is an evidence-based review tool. It does not prove build reproducibility, artifact provenance, repository ownership, or the absence of defects.

## Problem

Software release checks often combine facts that are easy to automate with requirements that need interpretation: whether documentation is usable, source code is present, licensing is clear, or a release page supports a stated claim. Manual review is slow and difficult to reproduce, while a single off-chain evaluator creates a central point of trust.

## Solution

ReleaseProof puts the request and final assessment in an Intelligent Contract. For each request, validators retrieve the public repository, README, and relevant release or branch pages; evaluate every supplied criterion; and return a structured verdict, score, reason code, criterion counts, and short summary. The contract validates that structure before persisting the result.

The three possible verdicts are:

- `VERIFIED`: every mandatory criterion is supported by the available evidence.
- `FAILED`: at least one mandatory criterion clearly fails.
- `INCONCLUSIVE`: evidence is inaccessible, insufficient, contradictory, or ambiguous.

## Why GenLayer

This workflow needs current web access and judgment over natural-language evidence, neither of which fits a conventional deterministic smart contract. GenLayer Intelligent Contracts can perform nondeterministic web retrieval and model evaluation while using multiple validators to establish an equivalent result. The durable request and result remain accessible through the contract.

## Architecture

```text
Browser / Next.js frontend
  ├─ MetaMask wallet and Studionet RPC
  ├─ create_verification(...)
  ├─ request_verification(...)
  └─ get_verification(...)
               │
               ▼
ReleaseProof Intelligent Contract
  ├─ validates and stores the request
  ├─ renders live public GitHub pages
  ├─ evaluates evidence through GenLayer validators
  ├─ checks result structure and validator equivalence
  └─ persists verdict, score, reason code, and summary
```

- `contracts/ReleaseProof.py` contains storage, input validation, evidence retrieval, evaluation, and consensus logic.
- `frontend/` is a Next.js interface for wallet connection, request creation, verification, lifecycle feedback, and result lookup.
- `deploy/deployScript.ts` deploys the contract with the GenLayer CLI.
- `tests/direct/test_releaseproof.py` covers contract behavior in direct mode.

## Intelligent Contract design

Each verification record contains its ID, creator address, normalized GitHub repository URL, optional release reference, acceptance criteria, status, verdict, score, reason code, and summary.

The public interface is:

- `create_verification(verification_id, repository_url, release_ref, criteria)` validates input and stores a request with status `CREATED`.
- `request_verification(verification_id)` retrieves live evidence, runs the validator evaluation, and persists the final result.
- `get_verification(verification_id)` returns the stored request and result.

IDs are unique and completed requests cannot be evaluated again. Inputs and evidence are length-limited. Repository URLs are restricted to public HTTPS GitHub repository URLs, and release references accept a conservative character set.

## Live GitHub and web-evidence flow

The evaluator renders the repository page and its README view. If a release reference is supplied, it also renders the corresponding GitHub release and tree pages. An unavailable page is explicitly represented as `[UNAVAILABLE]` rather than inferred.

Rendered content is treated as untrusted factual evidence. The evaluation prompt tells validators not to follow instructions embedded in repository content, not to invent missing facts, and to assess every acceptance criterion. Public-page availability, GitHub rendering behavior, and rate limits can therefore affect a result.

## Consensus and equivalence design

The leader produces a JSON result containing `verdict`, `score`, `reason_code`, `criteria_met`, `criteria_total`, and `summary`. A result is structurally valid only when the verdict is recognized, numeric fields are in range, criterion counts are coherent, and a `VERIFIED` result has all criteria met with a score of at least 80.

Validators independently evaluate the same URLs and acceptance criteria. Equivalence requires:

- the same verdict;
- scores within 15 points; and
- a structurally valid result from both leader and validator.

Exact prose, reason codes, and criterion segmentation are not compared. This avoids treating harmless wording differences as disagreement, while still requiring agreement on the decision and broadly comparable confidence. It is an application-specific equivalence policy, not a guarantee that every evaluator used identical reasoning.

## Transaction lifecycle

Verification uses two wallet-signed writes:

1. Create and persist the verification request.
2. Request the live, web-backed evaluation.

The frontend reports signature, submission, pending consensus, finalization, and GenVM execution states. A transaction is treated as successful only after finalization and successful execution; consensus status alone is not presented as completion. Rollbacks and `FINISHED_WITH_ERROR` responses are surfaced as failures with their available payload.

## Studionet deployment

The validated public-release contract is deployed on GenLayer Studionet:

| Item | Value |
| --- | --- |
| Network | GenLayer Studionet |
| Chain ID | `61999` |
| RPC | `https://studio.genlayer.com/api` |
| Contract | `0x261b8C90F511284f1a69e24CCE825f059FB23EdC` |
| Deployment transaction | `0x6f05588ae5e3f752e2e8d1782a772de936d593aefc5b2103c46c6a2becd6ec3d` |

### Verified live example

The following result was persisted during live Studionet validation:

| Field | Value |
| --- | --- |
| Verification ID | `releaseproof-demo-003` |
| Repository | `https://github.com/genlayerlabs/genlayer-project-boilerplate` |
| Release reference | `main` |
| Status | `VERIFIED` |
| Verdict | `VERIFIED` |
| Score | `95` |
| Reason code | `ALL_CRITERIA_MET` |
| Summary | The repository is publicly accessible, includes detailed README installation instructions, working project source code, and an MIT license. |

This is one recorded validation result for the cited repository and criteria at evaluation time. It should not be generalized to later repository states or unrelated release claims.

## Local development

Prerequisites are Node.js with npm, Python 3 with the GenLayer contract tooling, and MetaMask for browser writes.

```bash
npm install
cp frontend/.env.example frontend/.env.local
npm run dev
```

The committed `frontend/.env.example` contains the public Studionet configuration and deployed contract address. Override values in `frontend/.env.local` when needed; that file is ignored and must not contain credentials intended for source control. All `NEXT_PUBLIC_*` values are browser-visible and must never be used for secrets.

## Tests

Run contract syntax checks, GenVM validation, and direct-mode tests from the repository root:

```bash
python3 -m py_compile contracts/ReleaseProof.py
genvm-lint lint contracts/ReleaseProof.py
genvm-lint validate contracts/ReleaseProof.py
pytest tests/direct/test_releaseproof.py -v
```

Run frontend type checking and a production build from `frontend/`:

```bash
npm run lint
npm run build
```

## Known limitations

- Only public GitHub repository URLs are accepted.
- Evidence is limited to pages that GenLayer web rendering can retrieve; private repositories, deleted references, outages, rate limits, and dynamic page behavior may lead to `INCONCLUSIVE`.
- A release reference is checked through GitHub release and tree URLs, but ReleaseProof does not independently resolve commits or verify downloaded artifacts.
- Natural-language criteria can be ambiguous and should state mandatory requirements clearly.
- Prompt-injection defenses instruct evaluators to treat page content as untrusted, but model-based evaluation remains probabilistic.
- Results describe the evidence available during one transaction and are not automatically refreshed when a repository changes.
- There is no retry, update, cancellation, or administrative override flow for an existing verification record.
- The deployment is on Studionet, not a production mainnet.

## Future improvements

- Bind evaluations to resolved commit hashes and include additional evidence sources such as checksums, CI attestations, and signed releases.
- Store evidence timestamps or compact evidence references to improve later auditability.
- Add explicit retry/versioning semantics while preserving prior results.
- Expand repository-provider support without weakening URL validation and untrusted-content handling.
- Add end-to-end Studionet tests and richer handling for temporarily unavailable evidence.

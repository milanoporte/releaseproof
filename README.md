# ReleaseProof V2

> **Naming:** “Milestone v1” is the first ReleaseProof Portal delivery milestone. “ReleaseProof V2” identifies the current application and intelligent-contract generation. They describe different version axes and do not conflict.

ReleaseProof is a GenLayer application that evaluates software-release claims against public, commit-bound GitHub evidence. Every V2 request records a full Git commit SHA, natural-language acceptance criteria, and an optional release/tag. Independent validators inspect the same immutable source snapshot and conditionally inspect CI, artifact, checksum, and signature evidence when the criteria require it.

ReleaseProof is an evidence-based review tool. It does not prove build reproducibility, independently hash downloaded binaries, establish artifact provenance beyond the rendered evidence, or guarantee the absence of defects.

## Problem and solution

Software release checks combine objective facts with requirements that need interpretation. Mutable repository pages are unsuitable as the authoritative record because `HEAD`, a default branch, or a README can change after adjudication.

V2 binds every request to a normalized 40-character commit SHA and uses these authoritative source URLs:

```text
<repository>/commit/<sha>
<repository>/tree/<sha>
<repository>/blob/<sha>/README.md
```

Current `HEAD`, `main`, `master`, and repository-root content cannot substitute for this pinned evidence. If the commit or tree relationship cannot be established, the result cannot be `VERIFIED`.

## Changes made in response to steward review

**Issue: Verdicts relied on mutable GitHub pages.**

Resolution: Every V2 verification is bound to a required full 40-character immutable commit SHA. Authoritative evidence is fetched from commit-pinned commit, tree, and README URLs.

**Issue: CI, signatures, checksums, and release artifacts were not verified when criteria depended on them.**

Resolution: V2 deterministically classifies criteria and conditionally requires CI, artifact, checksum, and signature evidence. Missing required evidence cannot produce `VERIFIED` and canonicalizes conservatively to `INCONCLUSIVE` unless available evidence clearly proves failure.

Release/tag targets must match the reviewed SHA. No mutable `HEAD`, `main`, default-branch, or repository-root evidence can substitute for the reviewed commit. V2 inspects checksum and signature publication, but does not claim binary hashing or independent cryptographic verification.

## Architecture

```text
Browser / Next.js frontend
  ├─ create_verification(id, repository, commit SHA, optional release, criteria)
  ├─ request_verification(id)
  └─ get_verification(id)
               │
               ▼
ReleaseProof V2 Intelligent Contract
  ├─ validates and stores the immutable request
  ├─ classifies conditional evidence requirements
  ├─ renders categorized GitHub evidence
  ├─ applies deterministic VERIFIED gates
  ├─ evaluates evidence through GenLayer validators
  └─ persists the compact canonical result
```

- `contracts/ReleaseProof.py` contains storage, validation, evidence retrieval, prompt rules, and consensus logic.
- `frontend/` provides wallet connection, request creation, lifecycle feedback, and result display.
- `deploy/deployScript.ts` deploys the contract through the GenLayer CLI.
- `tests/direct/test_releaseproof.py` covers V2 behavior in direct mode.

## Stored verification and public interface

Each record contains:

```text
id
creator
repository_url
commit_sha
release_ref
criteria
status
verdict
score
reason_code
summary
```

Rendered evidence bodies are bounded and used only during adjudication; they are not persisted.

The public interface is:

- `create_verification(verification_id, repository_url, commit_sha, release_ref, criteria)`
- `request_verification(verification_id)`
- `get_verification(verification_id)`

The commit SHA is trimmed, lowercased, and must contain exactly 40 hexadecimal characters. Abbreviations and symbolic refs such as `HEAD`, `main`, and `master` are not valid commit inputs.

GitHub's rendered commit page may expose the full SHA in canonical page metadata while showing only a short SHA in visible text. ReleaseProof always requests the exact `/commit/<full-sha>` URL. It accepts a visible, boundary-delimited 7–12 character hexadecimal identifier only when it is a prefix of that requested full SHA; a different or absent identifier leaves commit identity unproven and produces `INCONCLUSIVE`.

## Evidence model

Each in-memory item has a category, URL, availability (`AVAILABLE`, `UNAVAILABLE`, or `NOT_REQUESTED`), and bounded rendered content. Categories include:

```text
repository_commit
commit_tree
commit_readme
release
release_target
release_tree
ci
artifacts
checksums
signatures
```

Unavailable or unrequested evidence never counts as success. All rendered content is untrusted factual material; validators are instructed never to follow instructions embedded in it.

## Release/tag relationship

When a release ref is supplied, V2 renders its release page, commit target, and tree. Release-page or tree existence alone does not prove association: the evaluator must establish that the release/tag target resolves to the exact stored commit SHA. A clear mismatch supports `FAILED`; an inaccessible or unprovable relationship supports `INCONCLUSIVE`.

## Conditional integrity evidence

The contract uses conservative, deterministic keyword classifiers:

- CI terms include CI, continuous integration, GitHub Actions, and passing/successful tests, builds, checks, or workflows.
- Artifact terms include artifacts, release assets, binaries, and packages.
- Checksum terms include checksums, SHA-256/SHA-512, digests, and cryptographic hashes.
- Signature terms include signatures, signed, GPG, PGP, Sigstore, and cosign.

Ordinary documentation, source, or licensing criteria do not automatically require these categories.

For CI criteria, V2 renders `<repository>/commit/<sha>/checks`. A workflow file, Actions page, or README badge is not proof of passing CI. Success requires completed successful checks tied to the reviewed SHA.

Artifact, checksum, and signature criteria use visible release assets and metadata. A checksum asset proves publication only; V2 does not download and independently hash binary bytes. Likewise, a signature filename proves publication, not cryptographic validity. The evaluator distinguishes visible GitHub verification status from the mere presence of `.asc`, `.sig`, `.minisig`, or Sigstore-related assets.

## Verdict and consensus

- `VERIFIED`: every mandatory criterion is supported by evidence tied to the immutable review target.
- `FAILED`: at least one mandatory criterion is clearly contradicted.
- `INCONCLUSIVE`: required evidence is missing, inaccessible, ambiguous, or unprovable.

Independent of the model, `VERIFIED` is structurally rejected unless commit and tree evidence are available, every conditionally required evidence category is available, every criterion is met, and the score is at least 80.

Validators must agree exactly on verdict, `criteria_met`, and `criteria_total`; scores may differ by at most 15 points. Summary and reason-code wording are not exact-matched.

## Frontend transaction lifecycle

Verification uses two wallet-signed writes: one stores the request and one runs validator consensus. The frontend reports signature, submission, pending consensus, finalization, and GenVM execution states. A transaction is successful only after finalization and successful execution.

The compact form requests a verification ID, repository URL, required full commit SHA, optional release/tag, and acceptance criteria. Results link to the reviewed commit and supplied release.

## Deployment status and V1 history

The final V2 release candidate is deployed and live-validated on GenLayer Studionet:

| Item | Value |
| --- | --- |
| Network | GenLayer Studionet |
| Chain ID | `61999` |
| RPC | `https://studio.genlayer.com/api` |
| Current V2 contract | `0xA69F25F03936CFa436453a3A00F820ae5e0745fb` |
| Deployment transaction | `0x27d92f4635672c7a4a4df23ac1ea4d206ceba893485ec2ca4da086b90c6d4877` |

The historical, deprecated V1 contract remains available only for its existing records:

```text
0x261b8C90F511284f1a69e24CCE825f059FB23EdC
```

V1 is retained for historical results but should not be used for new steward-compliant reviews. It used mutable repository/`HEAD` evidence, did not persist a commit SHA, and did not conditionally require CI, artifact, checksum, or signature evidence.

## Live Studionet verification examples

### Immutable commit-only verification

| Field | Value |
| --- | --- |
| Verification ID | `releaseproof-v2-immutable-demo-002` |
| Repository | `https://github.com/genlayerlabs/genlayer-project-boilerplate` |
| Commit SHA | `a713d30a23f58d77d4bb1e714e2dc3ff08e53055` |
| Release evidence | `NOT_REQUESTED` |
| Create transaction | `0xcf1e2bd199755bd0cef6016b72e2a12069b54606fe92b076bb9069f92f2baf05` |
| Request transaction | `0x46adb5b81d767b82fe252c43aeca7dc97cb063e412a52413825d498fd9f66e57` |
| Result | `VERIFIED` — score 97, criteria 3/3 |
| Reason code | `COMMIT_PINNED_EVIDENCE_ALL_CRITERIA_MET` |

### Exact-commit CI verification

| Field | Value |
| --- | --- |
| Verification ID | `releaseproof-v2-ci-demo-002` |
| Repository | `https://github.com/genlayerlabs/genlayer-project-boilerplate` |
| Commit SHA | `e685f1f12c4c357787d48390692a654baf576f03` |
| CI evidence | `AVAILABLE` from the exact commit checks page |
| Create transaction | `0xb4ae9461851eeb9e0fb8d7678953f1ad6e1fcd88f4192241c49d01708804055e` |
| Request transaction | `0xf5639209f139e6eb7ee103d1bfc8a6bca9fdd9f5caf07b8f79bd788509c650b6` |
| Result | `VERIFIED` — score 100, criteria 1/1 |
| Reason code | `CI_SHA_MATCH_SUCCESS` |

## Portal Milestone v1: verifiable release manifest

Portal Milestone v1 adds a repository-native integrity gate for release-critical committed inputs. [`release/manifest.json`](release/manifest.json) is canonical JSON containing a sorted list of governed paths, byte sizes, and lowercase SHA-256 digests. A reviewer at an immutable Git commit can recompute those values locally and confirm that the committed inputs match the manifest at that same commit.

The manifest also contains declared runtime metadata. Its `verification_status` explicitly labels those values as documentary declarations that this integrity check does not independently verify. The containing Git commit is deliberately not embedded in the committed manifest because doing so would create a circular identity problem.

The governed scope is:

- `contracts/` and `deploy/`;
- frontend application source under `frontend/app/`, `frontend/components/`, and `frontend/lib/`;
- frontend public assets and committed frontend configuration;
- root and frontend package manifests plus the workspace lockfile;
- `gltest.config.yaml`; and
- the manifest schema, verifier, tests, and CI integrity workflow.

The manifest excludes itself to avoid self-hashing recursion. It also excludes generated output and caches, `node_modules`, `.git`, local or secret environment files, virtual environments, `.next`, `.vercel`, `artifacts`, `__pycache__`, `.pyc`, and `.tsbuildinfo` files. A new non-excluded file inside a governed directory is treated as unexpected until the manifest is regenerated and reviewed.

Generate or verify the manifest from the repository root:

```bash
npm run manifest:generate
npm run manifest:verify
npm run test:manifest
```

`manifest:generate` discovers the governed set, rejects unsafe paths and symlinks, and writes deterministic JSON with a final newline. `manifest:verify` runs in check-only mode: it validates the structure, recomputes every byte size and digest, checks the exact governed set, and rejects stale, reordered, or otherwise non-canonical content without rewriting files. Missing, unexpected, duplicate, absolute, traversing, or symlink paths and any size or digest mismatch cause a non-zero exit.

The `Verify release integrity` GitHub Actions workflow runs this check and its tamper-detection tests for pull requests, pushes to `main`, and version-like tags. It also type-checks and builds the frontend from the committed npm lockfile. The existing direct-mode contract tests and GenVM lint/validate/schema commands are not in CI yet because this repository does not declare a reproducible, pinned Python GenLayer toolchain; CI intentionally does not guess dependency versions.

### Security boundary

This feature verifies committed release-input integrity at a reviewed Git commit. It does **not** prove reproducible builds, deployed-byte equivalence, publisher honesty, correctness of checksums for remote release artifacts, or cryptographic signature validity. It also does not independently validate the declared network, chain ID, or contract address. Reviewers must obtain the reviewed commit identity through a trusted channel and review changes to the verifier, workflow, schema, and manifest together.

## Local development

```bash
npm install
cp frontend/.env.example frontend/.env.local
npm run dev
```

The committed example configuration and runtime default point to the current V2 contract. Override `NEXT_PUBLIC_CONTRACT_ADDRESS` only when intentionally targeting another compatible deployment. All `NEXT_PUBLIC_*` values are browser-visible and must never contain secrets.

GenLayer CLI 0.39.1 coerces an empty positional argument to numeric `0`, so it cannot safely encode `release_ref = ""` for this ABI. Live CLI smoke tests should use a real release ref or use `genlayer-js`, which preserves the empty string. The browser frontend already sends `release_ref` as a string. The contract intentionally does not accept integer `0` as an empty release ref.

Validation commands:

```bash
python3 -m py_compile contracts/ReleaseProof.py
genvm-lint lint contracts/ReleaseProof.py
genvm-lint validate contracts/ReleaseProof.py
genvm-lint schema contracts/ReleaseProof.py
pytest tests/direct/test_releaseproof.py -v
cd frontend
npm run lint
npm run build
```

## Known limitations

- Only public HTTPS GitHub repositories are supported.
- Public GitHub pages can be unavailable, rate-limited, or incompletely rendered when content is loaded dynamically; required missing evidence leads to `INCONCLUSIVE` and cannot support `VERIFIED`.
- Web-rendered commit pages establish the repository context available through GitHub, but may not prove every Git reachability distinction without an API or local clone.
- Release pages and tags can change unless the repository separately enforces immutable releases; V2 records the reviewed source SHA and evaluates the observed relationship during consensus.
- CI conclusions are limited to what the public commit checks page exposes.
- V2 inspects published artifact, checksum, and signature evidence but does not download binaries, recompute checksums, or independently perform cryptographic signature verification.
- Natural-language adjudication remains probabilistic, with deterministic validation and multi-validator equivalence limiting acceptable outcomes.
- There is no retry, update, cancellation, or administrative override for an existing verification ID.
- Studionet is not a production mainnet.

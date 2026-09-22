import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rename, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";

import {
  ManifestError,
  buildManifest,
  canonicalJson,
  generateManifest,
  readManifest,
  runCli,
  verifyManifest,
} from "../scripts/release-manifest.mjs";

const CLI_PATH = fileURLToPath(new URL("../scripts/release-manifest.mjs", import.meta.url));

const REQUIRED_FIXTURE_FILES = [
  ".github/workflows/verify-release.yml",
  "contracts/ReleaseProof.py",
  "deploy/deployScript.ts",
  "frontend/app/page.tsx",
  "frontend/components/Panel.tsx",
  "frontend/components.json",
  "frontend/lib/client.ts",
  "frontend/next-env.d.ts",
  "frontend/next.config.ts",
  "frontend/package.json",
  "frontend/postcss.config.mjs",
  "frontend/public/favicon.svg",
  "frontend/tailwind.config.ts",
  "frontend/tsconfig.json",
  "gltest.config.yaml",
  "package-lock.json",
  "package.json",
  "release/manifest.schema.json",
  "scripts/release-manifest.mjs",
  "tests/release-manifest.test.mjs",
];

async function fixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), "releaseproof-manifest-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const relativePath of REQUIRED_FIXTURE_FILES) {
    const absolutePath = path.join(root, ...relativePath.split("/"));
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, `fixture:${relativePath}\n`, "utf8");
  }
  await generateManifest(root);
  return root;
}

async function mutateManifest(root, mutate, { canonical = true } = {}) {
  const { manifest } = await readManifest(root);
  mutate(manifest);
  const source = canonical ? canonicalJson(manifest) : `${JSON.stringify(manifest)}\n`;
  await writeFile(path.join(root, "release/manifest.json"), source, "utf8");
}

async function rejectsWithMessage(promise, pattern) {
  await assert.rejects(promise, (error) => error instanceof ManifestError && pattern.test(error.message));
}

test("generation is deterministic and byte-identical", async (t) => {
  const root = await fixture(t);
  const first = await readFile(path.join(root, "release/manifest.json"));
  await generateManifest(root);
  const second = await readFile(path.join(root, "release/manifest.json"));
  assert.deepEqual(second, first);
  assert.equal(canonicalJson(await buildManifest(root)), first.toString("utf8"));
});

test("a valid manifest verifies successfully", async (t) => {
  const root = await fixture(t);
  const result = await verifyManifest(root, { checkCanonical: true });
  assert.equal(result.filesVerified, REQUIRED_FIXTURE_FILES.length);
});

test("one-byte tampering is detected", async (t) => {
  const root = await fixture(t);
  await writeFile(path.join(root, "contracts/ReleaseProof.py"), "Xfixture:contracts/ReleaseProof.py\n", "utf8");
  await rejectsWithMessage(verifyManifest(root), /(size|sha256) mismatch/);
});

test("a missing governed file is rejected", async (t) => {
  const root = await fixture(t);
  await rm(path.join(root, "frontend/app/page.tsx"));
  await rejectsWithMessage(verifyManifest(root), /manifest-listed file is missing: frontend\/app\/page\.tsx/);
});

test("an unexpected governed file is rejected", async (t) => {
  const root = await fixture(t);
  await writeFile(path.join(root, "contracts/Unexpected.py"), "unexpected\n", "utf8");
  await rejectsWithMessage(verifyManifest(root), /governed file is absent from manifest: contracts\/Unexpected\.py/);
});

test("a duplicate manifest path is rejected", async (t) => {
  const root = await fixture(t);
  await mutateManifest(root, (manifest) => manifest.files.splice(1, 0, { ...manifest.files[0] }));
  await rejectsWithMessage(verifyManifest(root), /duplicate manifest path/);
});

test("an absolute manifest path is rejected", async (t) => {
  const root = await fixture(t);
  await mutateManifest(root, (manifest) => { manifest.files[0].path = "/etc/passwd"; });
  await rejectsWithMessage(verifyManifest(root), /unsafe manifest path/);
});

test("a Windows absolute manifest path is rejected", async (t) => {
  const root = await fixture(t);
  await mutateManifest(root, (manifest) => { manifest.files[0].path = "C:/Windows/System32/config"; });
  await rejectsWithMessage(verifyManifest(root), /unsafe manifest path/);
});

test("a parent traversal manifest path is rejected", async (t) => {
  const root = await fixture(t);
  await mutateManifest(root, (manifest) => { manifest.files[0].path = "../outside"; });
  await rejectsWithMessage(verifyManifest(root), /unsafe manifest path/);
});

test("a symlink in governed scope is rejected", async (t) => {
  const root = await fixture(t);
  await symlink("ReleaseProof.py", path.join(root, "contracts/link.py"));
  await rejectsWithMessage(verifyManifest(root), /symlink is not allowed: contracts\/link\.py/);
});

test("a symlinked parent directory is rejected", async (t) => {
  const root = await fixture(t);
  await rename(path.join(root, ".github"), path.join(root, ".github-real"));
  try {
    await symlink(".github-real", path.join(root, ".github"), "dir");
  } catch (error) {
    if (error?.code === "EPERM") {
      t.skip("directory symlinks are not supported by this platform");
      return;
    }
    throw error;
  }
  await rejectsWithMessage(verifyManifest(root), /symlink is not allowed: \.github/);
});

test("an incorrect byte size is rejected", async (t) => {
  const root = await fixture(t);
  await mutateManifest(root, (manifest) => { manifest.files[0].size_bytes += 1; });
  await rejectsWithMessage(verifyManifest(root), /size mismatch/);
});

test("a malformed digest is rejected", async (t) => {
  const root = await fixture(t);
  await mutateManifest(root, (manifest) => { manifest.files[0].sha256 = "ABC"; });
  await rejectsWithMessage(verifyManifest(root), /malformed sha256/);
});

test("a digest mismatch is rejected", async (t) => {
  const root = await fixture(t);
  await mutateManifest(root, (manifest) => { manifest.files[0].sha256 = "0".repeat(64); });
  await rejectsWithMessage(verifyManifest(root), /sha256 mismatch/);
});

test("reordered entries are rejected as non-canonical", async (t) => {
  const root = await fixture(t);
  await mutateManifest(root, (manifest) => { manifest.files = manifest.files.toReversed(); });
  await rejectsWithMessage(verifyManifest(root, { checkCanonical: true }), /not in lexicographic order/);
});

test("--check detects non-canonical JSON without modifying it", async (t) => {
  const root = await fixture(t);
  await mutateManifest(root, () => {}, { canonical: false });
  const manifestPath = path.join(root, "release/manifest.json");
  const before = await readFile(manifestPath);
  await rejectsWithMessage(runCli(["verify", "--check"], root), /stale or is not canonical/);
  const after = await readFile(manifestPath);
  assert.deepEqual(after, before);
});

test("the CLI works outside the repository root", async (t) => {
  const outside = await mkdtemp(path.join(tmpdir(), "releaseproof-outside-"));
  t.after(() => rm(outside, { recursive: true, force: true }));
  const originalCwd = process.cwd();
  const originalArgv = [...process.argv];
  const originalLog = console.log;
  const originalExitCode = process.exitCode;
  const output = [];
  try {
    process.chdir(outside);
    process.argv = [process.execPath, CLI_PATH, "verify", "--check"];
    console.log = (message) => output.push(String(message));
    await import(`${pathToFileURL(CLI_PATH).href}?outside-root-test=${Date.now()}`);
  } finally {
    process.chdir(originalCwd);
    process.argv = originalArgv;
    console.log = originalLog;
    process.exitCode = originalExitCode;
  }
  assert.match(output.join("\n"), /verified \d+ release-critical files and canonical manifest/);
});

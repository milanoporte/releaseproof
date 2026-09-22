#!/usr/bin/env node

import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MANIFEST_PATH = "release/manifest.json";
const DIRECTORY_ROOTS = [
  "contracts",
  "deploy",
  "frontend/app",
  "frontend/components",
  "frontend/lib",
  "frontend/public",
];
const REQUIRED_FILES = [
  ".github/workflows/verify-release.yml",
  "frontend/components.json",
  "frontend/next-env.d.ts",
  "frontend/next.config.ts",
  "frontend/package.json",
  "frontend/postcss.config.mjs",
  "frontend/tailwind.config.ts",
  "frontend/tsconfig.json",
  "gltest.config.yaml",
  "package-lock.json",
  "package.json",
  "release/manifest.schema.json",
  "scripts/release-manifest.mjs",
  "tests/release-manifest.test.mjs",
];
const EXCLUDED_DIRECTORY_NAMES = new Set([
  ".git",
  ".next",
  ".pytest_cache",
  ".venv",
  ".vercel",
  "__pycache__",
  "artifacts",
  "node_modules",
]);
const EXCLUDED_FILE_SUFFIXES = [".pyc", ".tsbuildinfo"];

export const manifestMetadata = Object.freeze({
  schema_version: 1,
  milestone_id: "releaseproof-portal-v1",
  repository: "https://github.com/milanoporte/releaseproof",
  hash_algorithm: "sha256",
  declared_runtime_metadata: Object.freeze({
    verification_status: "documentary_declaration_not_independently_verified",
    network: "GenLayer Studionet",
    chain_id: 61999,
    contract_address: "0xA69F25F03936CFa436453a3A00F820ae5e0745fb",
  }),
});

export class ManifestError extends Error {}

function toPosix(relativePath) {
  return relativePath.split(path.sep).join("/");
}

function comparePaths(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function assertSafeRelativePath(relativePath) {
  if (typeof relativePath !== "string" || relativePath.length === 0) {
    throw new ManifestError("manifest paths must be non-empty strings");
  }
  if (/[\u0000-\u001F\u007F]/.test(relativePath)) {
    throw new ManifestError("unsafe manifest path contains control characters");
  }
  if (relativePath.normalize("NFC") !== relativePath) {
    throw new ManifestError("unsafe manifest path is not Unicode-normalized");
  }
  if (
    relativePath.includes("\\") ||
    path.posix.isAbsolute(relativePath) ||
    /^[A-Za-z]:[\\/]/.test(relativePath)
  ) {
    throw new ManifestError(`unsafe manifest path: ${relativePath}`);
  }
  const segments = relativePath.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    throw new ManifestError(`unsafe manifest path: ${relativePath}`);
  }
  if (relativePath === MANIFEST_PATH) {
    throw new ManifestError("the manifest cannot hash itself");
  }
}

function shouldExclude(relativePath, isDirectory) {
  const name = path.posix.basename(toPosix(relativePath));
  if (isDirectory && EXCLUDED_DIRECTORY_NAMES.has(name)) return true;
  if (!isDirectory && (name === ".env" || name.startsWith(".env."))) return true;
  return !isDirectory && EXCLUDED_FILE_SUFFIXES.some((suffix) => name.endsWith(suffix));
}

async function inspectGovernedPath(root, relativePath) {
  assertSafeRelativePath(relativePath);
  const segments = relativePath.split("/");
  let absolutePath = root;
  let stat;
  for (let index = 0; index < segments.length; index += 1) {
    absolutePath = path.join(absolutePath, segments[index]);
    try {
      stat = await lstat(absolutePath);
    } catch (error) {
      if (error?.code === "ENOENT") throw new ManifestError(`missing governed path: ${relativePath}`);
      throw error;
    }
    const inspectedPath = segments.slice(0, index + 1).join("/");
    if (stat.isSymbolicLink()) throw new ManifestError(`symlink is not allowed: ${inspectedPath}`);
    if (index < segments.length - 1 && !stat.isDirectory()) {
      throw new ManifestError(`governed path component is not a directory: ${inspectedPath}`);
    }
  }
  return { absolutePath, stat };
}

async function inspectRegularFile(root, relativePath) {
  const { absolutePath, stat } = await inspectGovernedPath(root, relativePath);
  if (!stat.isFile()) throw new ManifestError(`governed path is not a regular file: ${relativePath}`);
  return absolutePath;
}

async function walkGovernedDirectory(root, relativeDirectory, results) {
  const { absolutePath: absoluteDirectory, stat: directoryStat } = await inspectGovernedPath(root, relativeDirectory);
  if (!directoryStat.isDirectory()) throw new ManifestError(`governed path is not a directory: ${relativeDirectory}`);

  const entries = await readdir(absoluteDirectory, { withFileTypes: true });
  entries.sort((left, right) => comparePaths(left.name, right.name));
  for (const entry of entries) {
    const relativePath = `${relativeDirectory}/${entry.name}`;
    if (shouldExclude(relativePath, entry.isDirectory())) continue;
    if (entry.isSymbolicLink()) throw new ManifestError(`symlink is not allowed: ${relativePath}`);
    if (entry.isDirectory()) {
      await walkGovernedDirectory(root, relativePath, results);
    } else if (entry.isFile()) {
      assertSafeRelativePath(relativePath);
      results.add(relativePath);
    } else {
      throw new ManifestError(`governed path is not a regular file: ${relativePath}`);
    }
  }
}

export async function discoverGovernedFiles(root) {
  const results = new Set();
  for (const relativeDirectory of DIRECTORY_ROOTS) {
    await walkGovernedDirectory(root, relativeDirectory, results);
  }
  for (const relativePath of REQUIRED_FILES) {
    await inspectRegularFile(root, relativePath);
    results.add(relativePath);
  }
  return [...results].sort(comparePaths);
}

async function describeFile(root, relativePath) {
  const absolutePath = await inspectRegularFile(root, relativePath);
  const bytes = await readFile(absolutePath);
  return {
    path: relativePath,
    size_bytes: bytes.byteLength,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

export async function buildManifest(root) {
  const governedFiles = await discoverGovernedFiles(root);
  const files = [];
  for (const relativePath of governedFiles) files.push(await describeFile(root, relativePath));
  return {
    schema_version: manifestMetadata.schema_version,
    milestone_id: manifestMetadata.milestone_id,
    repository: manifestMetadata.repository,
    hash_algorithm: manifestMetadata.hash_algorithm,
    declared_runtime_metadata: { ...manifestMetadata.declared_runtime_metadata },
    files,
  };
}

export function canonicalJson(manifest) {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

function validateManifestStructure(manifest) {
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    throw new ManifestError("manifest root must be an object");
  }
  const expectedRootFields = [
    "schema_version",
    "milestone_id",
    "repository",
    "hash_algorithm",
    "declared_runtime_metadata",
    "files",
  ];
  const rootFields = Object.keys(manifest);
  if (rootFields.length !== expectedRootFields.length || rootFields.some((field) => !expectedRootFields.includes(field))) {
    throw new ManifestError("manifest has missing or unexpected root fields");
  }
  if (manifest.schema_version !== 1) throw new ManifestError("unsupported schema_version");
  if (typeof manifest.milestone_id !== "string" || manifest.milestone_id.length === 0) {
    throw new ManifestError("milestone_id must be a non-empty string");
  }
  if (typeof manifest.repository !== "string" || !/^https:\/\/github\.com\/[^/]+\/[^/]+$/.test(manifest.repository)) {
    throw new ManifestError("repository must be a canonical HTTPS GitHub repository URL");
  }
  if (manifest.hash_algorithm !== "sha256") throw new ManifestError("hash_algorithm must be sha256");

  const runtime = manifest.declared_runtime_metadata;
  if (!runtime || typeof runtime !== "object" || Array.isArray(runtime)) {
    throw new ManifestError("declared_runtime_metadata must be an object");
  }
  if (runtime.verification_status !== "documentary_declaration_not_independently_verified") {
    throw new ManifestError("runtime metadata must be labeled as documentary and unverified");
  }
  const runtimeFields = Object.keys(runtime);
  if (
    runtimeFields.length !== 4 ||
    runtimeFields.some((field) => !["verification_status", "network", "chain_id", "contract_address"].includes(field))
  ) {
    throw new ManifestError("runtime metadata has missing or unexpected fields");
  }
  if (typeof runtime.network !== "string" || runtime.network.length === 0) {
    throw new ManifestError("runtime metadata network must be a non-empty string");
  }
  if (!Number.isSafeInteger(runtime.chain_id) || runtime.chain_id < 0) {
    throw new ManifestError("runtime metadata chain_id must be a non-negative integer");
  }
  if (typeof runtime.contract_address !== "string" || !/^0x[0-9A-Fa-f]{40}$/.test(runtime.contract_address)) {
    throw new ManifestError("runtime metadata contract_address is malformed");
  }
  if (!Array.isArray(manifest.files) || manifest.files.length === 0) {
    throw new ManifestError("files must be a non-empty array");
  }

  const seen = new Set();
  let previousPath = null;
  for (const entry of manifest.files) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new ManifestError("every file entry must be an object");
    }
    const fields = Object.keys(entry);
    if (fields.length !== 3 || fields.some((field) => !["path", "size_bytes", "sha256"].includes(field))) {
      throw new ManifestError("file entry has missing or unexpected fields");
    }
    assertSafeRelativePath(entry.path);
    if (seen.has(entry.path)) throw new ManifestError(`duplicate manifest path: ${entry.path}`);
    seen.add(entry.path);
    if (previousPath !== null && comparePaths(previousPath, entry.path) >= 0) {
      throw new ManifestError("manifest file entries are not in lexicographic order");
    }
    previousPath = entry.path;
    if (!Number.isSafeInteger(entry.size_bytes) || entry.size_bytes < 0) {
      throw new ManifestError(`invalid size_bytes for ${entry.path}`);
    }
    if (typeof entry.sha256 !== "string" || !/^[0-9a-f]{64}$/.test(entry.sha256)) {
      throw new ManifestError(`malformed sha256 for ${entry.path}`);
    }
  }
}

export async function readManifest(root) {
  const absolutePath = path.join(root, ...MANIFEST_PATH.split("/"));
  let source;
  try {
    source = await readFile(absolutePath, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") throw new ManifestError(`missing manifest: ${MANIFEST_PATH}`);
    throw error;
  }
  let manifest;
  try {
    manifest = JSON.parse(source);
  } catch {
    throw new ManifestError("manifest is not valid JSON");
  }
  return { manifest, source };
}

export async function verifyManifest(root, { checkCanonical = false } = {}) {
  const { manifest, source } = await readManifest(root);
  validateManifestStructure(manifest);

  const governedFiles = await discoverGovernedFiles(root);
  const manifestPaths = manifest.files.map((entry) => entry.path);
  const governedSet = new Set(governedFiles);
  const manifestSet = new Set(manifestPaths);
  for (const relativePath of manifestPaths) {
    if (!governedSet.has(relativePath)) {
      try {
        await inspectRegularFile(root, relativePath);
      } catch (error) {
        if (error instanceof ManifestError && error.message.startsWith("missing governed path:")) {
          throw new ManifestError(`manifest-listed file is missing: ${relativePath}`);
        }
        throw error;
      }
      throw new ManifestError(`manifest contains unexpected file: ${relativePath}`);
    }
  }
  for (const relativePath of governedFiles) {
    if (!manifestSet.has(relativePath)) throw new ManifestError(`governed file is absent from manifest: ${relativePath}`);
  }

  for (const expected of manifest.files) {
    const actual = await describeFile(root, expected.path);
    if (actual.size_bytes !== expected.size_bytes) throw new ManifestError(`size mismatch: ${expected.path}`);
    if (actual.sha256 !== expected.sha256) throw new ManifestError(`sha256 mismatch: ${expected.path}`);
  }

  if (checkCanonical) {
    const regenerated = canonicalJson(await buildManifest(root));
    if (source !== regenerated) {
      throw new ManifestError("manifest is stale or is not canonical; run manifest:generate");
    }
  }
  return { filesVerified: manifest.files.length };
}

export async function generateManifest(root) {
  const manifest = await buildManifest(root);
  const destination = path.join(root, ...MANIFEST_PATH.split("/"));
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, canonicalJson(manifest), "utf8");
  return { filesWritten: manifest.files.length };
}

export async function runCli(args, root) {
  const [command, ...options] = args;
  if (command === "generate" && options.length === 0) {
    const result = await generateManifest(root);
    return `generated ${MANIFEST_PATH} with ${result.filesWritten} files`;
  }
  if (command === "verify" && (options.length === 0 || (options.length === 1 && options[0] === "--check"))) {
    const result = await verifyManifest(root, { checkCanonical: options[0] === "--check" });
    return `verified ${result.filesVerified} release-critical files${options[0] === "--check" ? " and canonical manifest" : ""}`;
  }
  throw new ManifestError("usage: release-manifest.mjs <generate|verify [--check]>");
}

const scriptPath = fileURLToPath(import.meta.url);
const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === scriptPath) {
  const repositoryRoot = path.resolve(path.dirname(scriptPath), "..");
  try {
    console.log(await runCli(process.argv.slice(2), repositoryRoot));
  } catch (error) {
    console.error(`release-manifest: ${error instanceof Error ? error.message : "unknown failure"}`);
    process.exitCode = 1;
  }
}

#!/usr/bin/env node
/**
 * Phase 1 reproducibility gate.
 *
 * Verifies that the interpreter and package manager actually in use match the
 * versions pinned by the repository (00 §4.1 "Node.js LTS, zaključan u
 * `.nvmrc`/`.node-version` i `package.json engines`", 00 §5.3).
 *
 * Exits non-zero with a human readable diff when a version does not match.
 * Prints no environment values other than the tool versions themselves.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

/** @param {string} relativePath */
function readRepositoryFile(relativePath) {
  return readFileSync(join(repositoryRoot, relativePath), 'utf8');
}

const rootPackageJson = JSON.parse(readRepositoryFile('package.json'));
const nodeVersionFile = readRepositoryFile('.node-version').trim();

const expectedNode = rootPackageJson.engines?.node;
const expectedPnpm = rootPackageJson.engines?.pnpm;
const packageManagerField = rootPackageJson.packageManager ?? '';
const packageManagerPnpm = packageManagerField.startsWith('pnpm@')
  ? packageManagerField.slice('pnpm@'.length)
  : undefined;

/** @type {string[]} */
const failures = [];

if (expectedNode !== nodeVersionFile) {
  failures.push(
    `.node-version (${nodeVersionFile}) does not match package.json engines.node (${expectedNode}).`,
  );
}

if (expectedPnpm !== packageManagerPnpm) {
  failures.push(
    `package.json packageManager (${packageManagerField}) does not match engines.pnpm (${expectedPnpm}).`,
  );
}

const actualNode = process.versions.node;
if (actualNode !== expectedNode) {
  failures.push(`Running Node ${actualNode}, but this repository pins ${expectedNode}.`);
}

// The running pnpm version is read from the user agent that pnpm sets for its scripts.
// Spawning the launcher instead would need `shell: true` on Windows, where pnpm is a
// `.cmd` file, and that concatenates arguments unescaped (Node DEP0190).
const userAgent = process.env.npm_config_user_agent ?? '';
const pnpmFromUserAgent = /(?:^|\s)pnpm\/(\S+)/.exec(userAgent)?.[1];

let actualPnpm = pnpmFromUserAgent ?? 'not reported';

if (pnpmFromUserAgent === undefined) {
  console.warn(
    'Warning: pnpm version could not be determined. Run this script as `pnpm verify:toolchain`.',
  );
} else if (pnpmFromUserAgent !== expectedPnpm) {
  failures.push(`Running pnpm ${pnpmFromUserAgent}, but this repository pins ${expectedPnpm}.`);
}

if (failures.length > 0) {
  console.error('Toolchain verification failed:');
  for (const failure of failures) {
    console.error(`  - ${failure}`);
  }
  process.exit(1);
}

console.log(`Toolchain OK: node ${actualNode}, pnpm ${actualPnpm}.`);

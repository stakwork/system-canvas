#!/usr/bin/env node
// Sync all package versions and internal cross-deps to the root package.json version.
// Run after `npm version` at the root to propagate the bump into every workspace.

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const rootPkg = JSON.parse(readFileSync(resolve(repoRoot, 'package.json'), 'utf8'));
const version = rootPkg.version;

const workspaces = [
  'packages/core',
  'packages/react',
  'packages/standalone',
  'packages/collab',
];

// Names of packages in this monorepo whose cross-dependency ranges should
// track the lockstep version.
const internalNames = new Set([
  'system-canvas',
  'system-canvas-react',
  'system-canvas-standalone',
  'system-canvas-collab',
]);

const depFields = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];

for (const ws of workspaces) {
  const path = resolve(repoRoot, ws, 'package.json');
  const pkg = JSON.parse(readFileSync(path, 'utf8'));
  pkg.version = version;
  for (const field of depFields) {
    const deps = pkg[field];
    if (!deps) continue;
    for (const name of Object.keys(deps)) {
      if (internalNames.has(name)) {
        deps[name] = `^${version}`;
      }
    }
  }
  writeFileSync(path, JSON.stringify(pkg, null, 2) + '\n');
  console.log(`  ${ws} -> ${version}`);
}

console.log(`\nSynced ${workspaces.length} packages to v${version}`);

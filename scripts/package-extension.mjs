#!/usr/bin/env node
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const extensionDir = join(root, 'extension');
const distDir = join(root, 'dist');
const manifest = JSON.parse(await import('node:fs/promises').then(fs => fs.readFile(join(extensionDir, 'manifest.json'), 'utf8')));

const PACKAGE_FILES = [
  'manifest.json',
  'background.js',
  'index.html',
  'app.js',
  'style.css',
  'theme-init.js',
  'sidepanel.html',
  'sidepanel.css',
  'sidepanel.js',
  'tools.html',
  'tools.css',
  'tools.js',
  'services/html-service.js',
  'services/storage-service.js',
  'services/tabs-service.js',
  'services/search-service.js',
  'services/metrics-service.js',
  'services/tools-service.js',
  'vendor/qrcodegen.js',
  'icons/icon16.png',
  'icons/icon48.png',
  'icons/icon128.png',
];

const targets = process.argv.slice(2);
const requestedTargets = targets.length > 0 ? targets : ['chrome', 'edge'];
const validTargets = new Set(['chrome', 'edge']);

for (const target of requestedTargets) {
  if (!validTargets.has(target)) {
    throw new Error(`Unknown package target "${target}". Use "chrome" or "edge".`);
  }
}

for (const file of PACKAGE_FILES) {
  if (!existsSync(join(extensionDir, file))) {
    throw new Error(`Package file is missing: ${file}`);
  }
}

mkdirSync(distDir, { recursive: true });

for (const target of requestedTargets) {
  const output = join(distDir, `super-tab-out-${target}-${manifest.version}.zip`);
  rmSync(output, { force: true });

  const result = spawnSync('zip', ['-X', '-q', output, ...PACKAGE_FILES], {
    cwd: extensionDir,
    encoding: 'utf8',
  });

  if (result.status !== 0) {
    throw new Error(`Failed to create ${relative(root, output)}:\n${result.stderr || result.stdout}`);
  }

  console.log(`Created ${relative(root, output)}`);
}

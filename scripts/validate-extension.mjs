#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const extensionDir = join(root, 'extension');
const failures = [];

function fail(message) {
  failures.push(message);
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    fail(`${relative(root, path)} is not valid JSON: ${error.message}`);
    return null;
  }
}

function checkManifest() {
  const manifestPath = join(extensionDir, 'manifest.json');
  const manifest = readJson(manifestPath);
  if (!manifest) return;

  if (manifest.manifest_version !== 3) fail('manifest.json must use manifest_version 3');
  if (!manifest.chrome_url_overrides?.newtab) fail('manifest.json must override the new tab page');

  for (const permission of ['tabs', 'storage', 'tabGroups', 'sidePanel', 'sessions']) {
    if (!manifest.permissions?.includes(permission)) {
      fail(`manifest.json is missing permission: ${permission}`);
    }
  }

  for (const path of [
    manifest.chrome_url_overrides?.newtab,
    manifest.side_panel?.default_path,
    manifest.background?.service_worker,
    'app.js',
    'style.css',
    'tools.html',
    'tools.css',
    'theme-init.js',
  ]) {
    if (path && !existsSync(join(extensionDir, path))) {
      fail(`manifest or runtime references missing file: ${path}`);
    }
  }
}

async function collectFiles(dir, predicate, out = []) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      await collectFiles(path, predicate, out);
    } else if (predicate(path)) {
      out.push(path);
    }
  }
  return out;
}

async function checkSyntax() {
  const jsFiles = await collectFiles(extensionDir, path => path.endsWith('.js'));
  for (const file of jsFiles) {
    const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
    if (result.status !== 0) {
      fail(`${relative(root, file)} failed syntax check:\n${result.stderr || result.stdout}`);
    }
  }
}

function checkHtmlScripts(htmlFile, expectedServices = []) {
  const indexPath = join(extensionDir, htmlFile);
  const html = readFileSync(indexPath, 'utf8');
  const scripts = [...html.matchAll(/<script\s+src="([^"]+)"/g)].map(match => match[1]);

  for (const script of scripts) {
    if (script === 'config.local.js') continue;
    if (!existsSync(join(extensionDir, script))) fail(`${htmlFile} references missing script: ${script}`);
  }

  const appIndex = scripts.indexOf('app.js');
  for (const service of expectedServices) {
    const serviceIndex = scripts.indexOf(service);
    if (serviceIndex === -1) fail(`${htmlFile} does not load ${service}`);
    if (appIndex !== -1 && serviceIndex > appIndex) fail(`${service} must load before app.js`);
  }
}

function checkIndexScripts() {
  checkHtmlScripts('index.html', [
    'services/html-service.js',
    'services/storage-service.js',
    'services/tabs-service.js',
    'services/search-service.js',
    'services/metrics-service.js',
    'services/actions-service.js',
    'services/tools-service.js',
  ]);
  checkHtmlScripts('sidepanel.html', [
    'services/html-service.js',
    'services/storage-service.js',
    'services/tabs-service.js',
    'services/search-service.js',
    'services/metrics-service.js',
    'services/tools-service.js',
  ]);
  checkHtmlScripts('tools.html', [
    'services/html-service.js',
    'services/storage-service.js',
    'services/tabs-service.js',
    'services/tools-service.js',
  ]);
}

function checkCommandDockContracts() {
  const indexHtml = readFileSync(join(extensionDir, 'index.html'), 'utf8');
  const sidepanelJs = readFileSync(join(extensionDir, 'sidepanel.js'), 'utf8');
  const dockIndex = indexHtml.indexOf('id="commandDockFavorites"');
  const drawerIndex = indexHtml.indexOf('id="commandDrawer"');

  if (dockIndex !== -1 && drawerIndex !== -1 && dockIndex < drawerIndex) {
    if (!sidepanelJs.includes("actionEl.closest('.command-dock-rail')")) {
      fail('sidepanel.js must allow command dock actions rendered outside commandDrawer');
    }
  }

  if (sidepanelJs.includes("const DOCK_BOTTOM_QUERY = '(min-width: 0px)'")) {
    fail('sidepanel.js DOCK_BOTTOM_QUERY must not force desktop dock sorting to horizontal');
  }
}

function checkDistZip(zipPath) {
  if (!existsSync(zipPath)) return;
  const result = spawnSync('unzip', ['-Z1', zipPath], { encoding: 'utf8' });
  if (result.status !== 0) {
    fail(`Could not inspect ${relative(root, zipPath)} with unzip`);
    return;
  }

  const entries = result.stdout.split('\n').filter(Boolean);
  if (!entries.includes('manifest.json')) fail(`${relative(root, zipPath)} must contain manifest.json at the ZIP root`);

  const forbidden = [
    '.git/',
    '.DS_Store',
    '__MACOSX',
    'config.local.js',
    '.claude/',
    'tools/',
  ];
  for (const entry of entries) {
    if (forbidden.some(token => entry.includes(token))) {
      fail(`${relative(root, zipPath)} contains forbidden entry: ${entry}`);
    }
  }
}

async function main() {
  checkManifest();
  checkIndexScripts();
  checkCommandDockContracts();
  await checkSyntax();
  checkDistZip(join(root, 'dist/super-tab-out-chrome-1.0.2.zip'));
  checkDistZip(join(root, 'dist/super-tab-out-edge-1.0.2.zip'));

  if (failures.length > 0) {
    console.error('Extension validation failed:');
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
  }

  console.log('Extension validation passed.');
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});

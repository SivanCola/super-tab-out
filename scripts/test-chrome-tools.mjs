#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const extensionDir = join(root, 'extension');
const defaultChromeBin = join(root, 'tools/chrome-for-testing/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
const chromeBin = process.env.CHROME_BIN || defaultChromeBin;
const headless = process.env.HEADLESS !== '0';

if (!existsSync(chromeBin)) {
  throw new Error(`Chrome for Testing binary not found: ${chromeBin}`);
}

class CdpPage {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.nextId = 1;
    this.pending = new Map();
    this.events = new Map();
    this.opened = new Promise((resolve, reject) => {
      this.ws.addEventListener('open', resolve, { once: true });
      this.ws.addEventListener('error', reject, { once: true });
    });
    this.ws.addEventListener('message', event => {
      const message = JSON.parse(event.data);
      if (message.id && this.pending.has(message.id)) {
        const { resolve: ok, reject } = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) reject(new Error(message.error.message));
        else ok(message.result);
        return;
      }
      if (message.method && this.events.has(message.method)) {
        for (const handler of this.events.get(message.method)) handler(message.params || {});
      }
    });
  }

  on(method, handler) {
    if (!this.events.has(method)) this.events.set(method, []);
    this.events.get(method).push(handler);
  }

  async send(method, params = {}) {
    await this.opened;
    const id = this.nextId++;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      setTimeout(() => {
        if (!this.pending.has(id)) return;
        this.pending.delete(id);
        reject(new Error(`CDP timeout: ${method}`));
      }, 8000);
    });
  }

  async evaluate(expression) {
    const result = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.text || 'Runtime evaluation failed');
    }
    return result.result?.value;
  }

  async navigate(url) {
    await this.send('Page.navigate', { url });
    await this.waitFor('document.readyState === "complete"');
  }

  async waitFor(expression, timeoutMs = 5000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try {
        if (await this.evaluate(`Boolean(${expression})`)) return;
      } catch {}
      await sleep(80);
    }
    throw new Error(`Timed out waiting for: ${expression}`);
  }

  close() {
    try { this.ws.close(); } catch {}
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function freePort() {
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return response.json();
}

async function waitForJson(url, timeoutMs = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try { return await fetchJson(url); } catch { await sleep(100); }
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function newTarget(port, url) {
  return fetchJson(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' });
}

async function findExtensionBase(port) {
  await newTarget(port, 'chrome://newtab/');
  const start = Date.now();
  while (Date.now() - start < 10000) {
    const targets = await fetchJson(`http://127.0.0.1:${port}/json/list`);
    const worker = targets.find(item => item.type === 'service_worker' && /^chrome-extension:\/\/[^/]+\/background\.js/.test(item.url || ''));
    if (worker) return worker.url.replace(/\/background\.js.*$/, '');
    const target = targets.find(item => item.type === 'page' && /^chrome-extension:\/\/[^/]+\/index\.html/.test(item.url || ''));
    if (target) return target.url.replace(/\/index\.html.*$/, '');
    await sleep(150);
  }
  throw new Error('Could not discover Super Tab Out extension URL from Chrome targets');
}

async function stopChrome(chrome) {
  if (!chrome || chrome.exitCode != null) return;
  const exited = new Promise(resolve => chrome.once('exit', resolve));
  chrome.kill('SIGTERM');
  await Promise.race([exited, sleep(2000)]);
  if (chrome.exitCode == null) {
    chrome.kill('SIGKILL');
    await Promise.race([exited, sleep(1000)]);
  }
}

async function openExtensionPage(port, url) {
  const target = await newTarget(port, url);
  const page = new CdpPage(target.webSocketDebuggerUrl);
  const errors = [];
  page.on('Runtime.exceptionThrown', params => {
    const details = params.exceptionDetails;
    errors.push(details?.exception?.description || details?.text || 'Runtime exception');
  });
  page.on('Log.entryAdded', params => {
    if (params.entry?.level === 'error') {
      const details = [params.entry.text, params.entry.url].filter(Boolean).join(' ');
      errors.push(details);
    }
  });
  await page.send('Runtime.enable');
  await page.send('Log.enable');
  await page.send('Page.enable');
  await page.waitFor('document.readyState === "complete"');
  page.errors = errors;
  return page;
}

async function setStorage(page, values) {
  const json = JSON.stringify(values);
  await page.evaluate(`new Promise(resolve => chrome.storage.local.set(${json}, resolve))`);
}

async function removeStorage(page, keys) {
  const json = JSON.stringify(keys);
  await page.evaluate(`new Promise(resolve => chrome.storage.local.remove(${json}, resolve))`);
}

async function main() {
  const port = await freePort();
  const profile = await mkdtemp(join(tmpdir(), 'super-tab-out-chrome-tools-'));
  const chrome = spawn(chromeBin, [
    `--user-data-dir=${profile}`,
    `--remote-debugging-port=${port}`,
    '--remote-allow-origins=*',
    `--load-extension=${extensionDir}`,
    `--disable-extensions-except=${extensionDir}`,
    '--disable-background-networking',
    '--disable-component-update',
    '--disable-default-apps',
    '--disable-sync',
    '--metrics-recording-only',
    '--no-first-run',
    '--no-default-browser-check',
    '--window-size=1365,900',
    ...(headless ? ['--headless=new'] : []),
    'chrome://newtab/',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });

  let page;
  try {
    await waitForJson(`http://127.0.0.1:${port}/json/version`);
    const extensionBase = await findExtensionBase(port);

    page = await openExtensionPage(port, `${extensionBase}/index.html`);
    await page.waitFor('document.querySelector("#themeCurrentBtn")');
    const defaultTheme = await page.evaluate(`(() => {
      const activeOption = document.querySelector('.theme-option[aria-pressed="true"]');
      const firstOption = document.querySelector('.theme-option[data-theme-name]');
      return {
        theme: document.documentElement.dataset.theme,
        activeTheme: activeOption?.dataset.themeName || '',
        firstTheme: firstOption?.dataset.themeName || '',
        activeLabel: document.querySelector('#activeThemeLabel')?.textContent.trim() || '',
        storedTheme: localStorage.getItem('tab-out-theme')
      };
    })()`);
    assert.equal(defaultTheme.theme, 'system');
    assert.equal(defaultTheme.activeTheme, 'system');
    assert.equal(defaultTheme.firstTheme, 'system');
    assert.equal(defaultTheme.activeLabel, 'Adaptive Glow');
    assert.equal(defaultTheme.storedTheme, null);
    await page.waitFor('document.querySelector("#statTabs")?.textContent.trim() !== "—"');
    assert.match(await page.evaluate(`document.querySelector('#statTabs')?.textContent.trim() || ''`), /^\d+$/);
    assert.deepEqual(
      await page.evaluate(`Array.from(document.querySelectorAll('.theme-option[data-theme-name]')).map(btn => btn.dataset.themeName).slice(0, 4)`),
      ['system', 'white', 'material', 'cupertino']
    );
    await page.evaluate(`document.querySelector('[data-theme-name="material"]').click()`);
    await page.waitFor('document.documentElement.dataset.theme === "material"');
    assert.equal(await page.evaluate(`document.querySelector('#activeThemeLabel')?.textContent.trim()`), 'Material Orbit');
    await page.evaluate(`document.querySelector('[data-theme-name="cupertino"]').click()`);
    await page.waitFor('document.documentElement.dataset.theme === "cupertino"');
    assert.equal(await page.evaluate(`document.querySelector('#activeThemeLabel')?.textContent.trim()`), 'Cupertino Mist');
    await page.evaluate(`document.querySelector('[data-language="zh"]').click()`);
    await page.waitFor('document.documentElement.dataset.lang === "zh"');
    assert.deepEqual(
      await page.evaluate(`Array.from(document.querySelectorAll('.theme-option[data-theme-name]')).map(btn => btn.querySelector('.theme-option-label')?.textContent.trim())`),
      ['随光', '素笺', '星轨', '雾岸', '暖笺', '夜航', '霜原', '森屿', '墨金', '珊潮', '梅影', '茶岚', '烬岩', '薰风']
    );
    await page.evaluate(`document.querySelector('[data-theme-name="system"]').click()`);
    await page.waitFor('document.querySelector("#activeThemeLabel")?.textContent.trim() === "随光"');
    await page.evaluate(`new Promise(resolve => chrome.storage.local.set({
      toolFavorites: ['json', 'url', 'codec', 'timestamp', 'qr', 'uuid', 'hash', 'cookie', 'session-export'],
      toolOrder: ['json', 'url', 'codec', 'timestamp', 'qr', 'uuid', 'hash', 'cookie', 'session-export']
    }, resolve))`);
    await page.evaluate(`document.dispatchEvent(new Event('super-tab-out-panel-refresh'))`);
    await page.waitFor('document.querySelectorAll("#commandDockFavorites .command-dock-tool[data-tool-id]").length === 8');
    assert.deepEqual(
      await page.evaluate(`Array.from(document.querySelectorAll('#commandDockFavorites .command-dock-tool[data-tool-id]')).map(btn => btn.dataset.toolId)`),
      ['json', 'url', 'codec', 'timestamp', 'qr', 'uuid', 'hash', 'cookie']
    );
    assert.equal(await page.evaluate(`document.querySelector('#commandDockFavorites .command-dock-tool.more') !== null`), true);
    assert.equal(await page.evaluate(`document.querySelector('#refreshBtn') === null && document.querySelector('#commandDrawerClose') === null`), true);
    assert.equal(await page.evaluate(`document.body.classList.contains('command-drawer-open')`), false);
    await page.evaluate(`document.querySelector('#commandDockToolsBtn').click()`);
    await page.waitFor('document.body.classList.contains("command-drawer-open")');
    await page.evaluate(`document.querySelector('#commandDockToolsBtn').click()`);
    await page.waitFor('!document.body.classList.contains("command-drawer-open")');
    await page.evaluate(`document.querySelector('#commandDockToolsBtn').click()`);
    await page.waitFor('document.body.classList.contains("command-drawer-open")');
    assert.deepEqual(
      await page.evaluate(`Array.from(document.querySelectorAll('#toolList .tool-directory-card[data-tool-id]')).map(card => card.dataset.toolId).slice(0, 4)`),
      ['json', 'url', 'codec', 'timestamp']
    );
    const draggedOrder = await page.evaluate(`(async () => {
      const first = document.querySelector('#toolList .tool-directory-card[data-tool-id="json"]');
      const second = document.querySelector('#toolList .tool-directory-card[data-tool-id="url"]');
      const start = first.getBoundingClientRect();
      const end = second.getBoundingClientRect();
      const pointer = (type, x, y) => new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        pointerId: 23,
        pointerType: 'mouse',
        isPrimary: true,
        button: 0,
        clientX: x,
        clientY: y
      });
      first.dispatchEvent(pointer('pointerdown', start.left + start.width / 2, start.top + start.height / 2));
      document.dispatchEvent(pointer('pointermove', end.left + end.width / 2, end.bottom + 12));
      document.dispatchEvent(pointer('pointerup', end.left + end.width / 2, end.bottom + 12));
      await new Promise(resolve => setTimeout(resolve, 520));
      const stored = await new Promise(resolve => chrome.storage.local.get('toolOrder', resolve));
      return {
        list: Array.from(document.querySelectorAll('#toolList .tool-directory-card[data-tool-id]')).map(card => card.dataset.toolId).slice(0, 3),
        dock: Array.from(document.querySelectorAll('#commandDockFavorites .command-dock-tool[data-tool-id]')).map(btn => btn.dataset.toolId).slice(0, 3),
        stored: stored.toolOrder.slice(0, 3)
      };
    })()`);
    assert.deepEqual(draggedOrder.list, ['url', 'json', 'codec']);
    assert.deepEqual(draggedOrder.dock, ['url', 'json', 'codec']);
    assert.deepEqual(draggedOrder.stored, ['url', 'json', 'codec']);
    await page.evaluate(`document.querySelector('#commandDockToolsBtn').click()`);
    await page.waitFor('!document.body.classList.contains("command-drawer-open")');
    await page.send('Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 844,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await page.evaluate(`window.scrollTo(0, 0); document.querySelector('#privacySettingsBtn').click()`);
    const mobileSettingsPanel = await page.evaluate(`(() => {
      const panel = document.querySelector('#privacySettings');
      const rect = panel.getBoundingClientRect();
      const centerEl = document.elementFromPoint(rect.left + rect.width / 2, rect.top + Math.min(rect.height / 2, 120));
      return {
        display: getComputedStyle(panel).display,
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        centerInside: panel === centerEl || panel.contains(centerEl),
      };
    })()`);
    assert.notEqual(mobileSettingsPanel.display, 'none');
    assert.ok(mobileSettingsPanel.left >= 0, `Settings panel left overflow: ${JSON.stringify(mobileSettingsPanel)}`);
    assert.ok(mobileSettingsPanel.right <= mobileSettingsPanel.viewportWidth, `Settings panel right overflow: ${JSON.stringify(mobileSettingsPanel)}`);
    assert.ok(mobileSettingsPanel.top >= 0, `Settings panel top overflow: ${JSON.stringify(mobileSettingsPanel)}`);
    assert.ok(mobileSettingsPanel.bottom <= mobileSettingsPanel.viewportHeight, `Settings panel bottom overflow: ${JSON.stringify(mobileSettingsPanel)}`);
    assert.equal(mobileSettingsPanel.centerInside, true);
    const escapeState = await page.evaluate(`(() => {
      document.querySelector('[data-settings-view="privacy"]').click();
      const input = document.querySelector('#psMottoInput');
      input.focus();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      const panel = document.querySelector('#privacySettings');
      return {
        activeId: document.activeElement?.id || '',
        panelOpen: getComputedStyle(panel).display !== 'none',
      };
    })()`);
    assert.notEqual(escapeState.activeId, 'psMottoInput');
    assert.equal(escapeState.panelOpen, true);
    assert.deepEqual(page.errors.filter(error => !error.includes('/config.local.js')), []);
    page.close();
    page = null;

    page = await openExtensionPage(port, `${extensionBase}/sidepanel.html`);
    await page.waitFor('document.querySelector("#tabsView") && document.querySelector("#toolsView")');
    await page.evaluate(`document.querySelector('.panel-tab[data-view="tools"]').click()`);
    await page.waitFor('document.querySelector("#toolsView").classList.contains("active")');
    await page.waitFor('document.querySelectorAll("#toolList .tool-directory-card[data-tool-id]").length >= 9');
    const sidePanelState = await page.evaluate(`({
      tabsActive: document.querySelector('#tabsView').classList.contains('active'),
      toolsActive: document.querySelector('#toolsView').classList.contains('active'),
      hasHealthView: document.querySelector('#healthView') !== null,
      hasCurrentTabTools: document.querySelectorAll('[data-action="open-tool-current"]').length,
      firstTools: Array.from(document.querySelectorAll('#toolList .tool-directory-card[data-tool-id]')).map(card => card.dataset.toolId).slice(0, 3)
    })`);
    assert.equal(sidePanelState.tabsActive, false);
    assert.equal(sidePanelState.toolsActive, true);
    assert.equal(sidePanelState.hasHealthView, false);
    assert.equal(sidePanelState.hasCurrentTabTools, 3);
    assert.deepEqual(sidePanelState.firstTools, ['url', 'json', 'codec']);
    assert.deepEqual(page.errors, []);
    page.close();
    page = null;

    page = await openExtensionPage(port, `${extensionBase}/tools.html?tool=json`);
    await page.waitFor('document.querySelector("#toolInput")');
    assert.deepEqual(
      await page.evaluate(`Array.from(document.querySelectorAll('#toolsList .tool-icon-svg')).map(svg => svg.dataset.toolIcon)`),
      ['json-tree', 'qr-grid', 'time-ruler', 'url-search', 'codec-arrows', 'id-key', 'fingerprint-hash', 'cookie-kv', 'session-export']
    );

    await setStorage(page, {
      'toolState:url': {
        input: 'https://old.example/',
        output: 'STALE OUTPUT',
        status: 'Old status',
        error: false,
        action: 'parse',
      },
    });
    const freshUrl = 'https://fresh.example/path?a=1';
    await page.navigate(`${extensionBase}/tools.html?tool=url&input=${encodeURIComponent(freshUrl)}&source=${encodeURIComponent(freshUrl)}`);
    await page.waitFor('document.querySelector("#toolInput")?.value === "https://fresh.example/path?a=1"');
    const overrideState = await page.evaluate(`({
      input: document.querySelector('#toolInput').value,
      output: document.querySelector('#toolOutput').value,
      status: document.querySelector('#toolStatus').textContent.trim(),
      previewText: document.querySelector('#toolPreview').textContent.trim()
    })`);
    assert.equal(overrideState.input, freshUrl);
    assert.equal(overrideState.output, '');
    assert.notEqual(overrideState.status, 'Old status');
    assert.equal(overrideState.previewText.includes('STALE OUTPUT'), false);

    const sourceUrl = 'https://source.example/current?from=button';
    await removeStorage(page, ['toolState:url']);
    await page.navigate(`${extensionBase}/tools.html?tool=url&source=${encodeURIComponent(sourceUrl)}`);
    await page.evaluate(`document.querySelector('#useCurrentUrlBtn').click()`);
    await page.waitFor(`document.querySelector('#toolInput')?.value === ${JSON.stringify(sourceUrl)}`);
    assert.equal(await page.evaluate(`document.querySelector('#toolInput').value`), sourceUrl);

    await removeStorage(page, ['toolState:url']);
    await page.navigate(`${extensionBase}/tools.html?tool=url`);
    await page.evaluate(`document.querySelector('#useCurrentUrlBtn').click()`);
    await sleep(350);
    assert.equal(await page.evaluate(`document.querySelector('#toolInput').value`), '');

    await page.navigate(`${extensionBase}/tools.html?tool=timestamp`);
    await page.evaluate(`document.querySelector('#toolInput').value = ''; document.querySelector('[data-tool-action="convert"]').click()`);
    await page.waitFor('document.querySelector("#toolStatus")?.classList.contains("error")');
    assert.equal(await page.evaluate(`document.querySelector('#toolOutput').value`), '');

    await page.navigate(`${extensionBase}/tools.html?tool=hash`);
    await page.evaluate(`document.querySelector('#toolInput').value = 'abc'; document.querySelector('[data-tool-action="sha256"]').click()`);
    await page.waitFor('document.querySelector("#toolOutput")?.value.includes("ba7816bf")');
    const outputLayout = await page.evaluate(`(() => {
      const panel = document.querySelector('.output-panel').getBoundingClientRect();
      const output = document.querySelector('#toolOutput').getBoundingClientRect();
      return {
        textMode: document.querySelector('.output-panel').classList.contains('text-mode'),
        panelHeight: panel.height,
        outputHeight: output.height
      };
    })()`);
    assert.equal(outputLayout.textMode, true);
    assert.ok(outputLayout.outputHeight > outputLayout.panelHeight * 0.45, `Output height too small: ${JSON.stringify(outputLayout)}`);

    await page.navigate(`${extensionBase}/tools.html?tool=qr`);
    await page.evaluate(`document.querySelector('#toolInput').value = 'https://example.com'; document.querySelector('[data-tool-action="generate"]').click()`);
    await page.waitFor('document.querySelector(".qr-frame svg") && document.querySelector("#toolOutput").value.startsWith("<svg")');

    assert.deepEqual(page.errors, []);
    console.log('Chrome tools regression passed.');
  } finally {
    if (page) page.close();
    await stopChrome(chrome);
    await rm(profile, { recursive: true, force: true });
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});

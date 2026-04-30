#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const tabs = require(resolve(root, 'extension/services/tabs-service.js'));
const storage = require(resolve(root, 'extension/services/storage-service.js'));
const search = require(resolve(root, 'extension/services/search-service.js'));
const metrics = require(resolve(root, 'extension/services/metrics-service.js'));
const html = require(resolve(root, 'extension/services/html-service.js'));
const tools = require(resolve(root, 'extension/services/tools-service.js'));

function makeFakeStorage(seed = {}) {
  const store = { ...seed };
  return {
    store,
    async get(keys) {
      if (keys == null) return { ...store };
      if (typeof keys === 'string') return { [keys]: store[keys] };
      if (Array.isArray(keys)) {
        return Object.fromEntries(keys.map(key => [key, store[key]]));
      }
      return Object.fromEntries(Object.keys(keys).map(key => [key, store[key] ?? keys[key]]));
    },
    async set(values) {
      Object.assign(store, values);
    },
    async getBytesInUse() {
      return JSON.stringify(store).length;
    },
  };
}

async function testTabsService() {
  assert.equal(tabs.isRealTab({ url: 'https://example.com', pinned: false }, 'ext'), true);
  assert.equal(tabs.isRealTab({ url: 'chrome://extensions', pinned: false }, 'ext'), false);
  assert.equal(tabs.isRealTab({ url: 'https://example.com', pinned: true }, 'ext'), false);

  const ids = tabs.exactUnpinnedIdsForUrls([
    { id: 1, url: 'https://a.test', pinned: false },
    { id: 2, url: 'https://a.test', pinned: true },
    { id: 3, url: 'https://b.test', pinned: false },
  ], ['https://a.test']);
  assert.deepEqual(ids, [1]);

  const removed = [];
  global.chrome = {
    runtime: { id: 'ext' },
    tabs: {
      async query() {
        return [
          { id: 1, url: 'https://a.test', active: false, pinned: false },
          { id: 2, url: 'https://a.test', active: true, pinned: false },
          { id: 3, url: 'https://a.test', active: false, pinned: true },
        ];
      },
      async remove(idsToRemove) {
        removed.push(...idsToRemove);
      },
    },
  };

  await tabs.closeDuplicateTabs(['https://a.test'], true);
  assert.deepEqual(removed, [1]);

  removed.length = 0;
  global.chrome = {
    runtime: { id: 'ext' },
    tabs: {
      async query() {
        return [
          { id: 1, url: 'https://a.test', active: true, pinned: true },
          { id: 2, url: 'https://a.test', active: false, pinned: false },
          { id: 3, url: 'https://a.test', active: false, pinned: false },
        ];
      },
      async remove(idsToRemove) {
        removed.push(...idsToRemove);
      },
    },
  };

  await tabs.closeDuplicateTabs(['https://a.test'], true);
  assert.deepEqual(removed, [3]);

  assert.deepEqual(tabs.normalizeSessionRestoreTabs({
    tabs: [
      { url: 'https://w1-0.test', windowId: 1, index: 0 },
      { url: 'https://w1-1.test', windowId: 1, index: 1 },
      { url: 'https://w2-0.test', windowId: 2, index: 0 },
      { url: 'https://w2-1.test', windowId: 2, index: 1 },
    ],
  }).map(tab => tab.url), [
    'https://w1-0.test',
    'https://w1-1.test',
    'https://w2-0.test',
    'https://w2-1.test',
  ]);

  const createdWindows = [];
  const groupedTabSets = [];
  const updatedGroups = [];
  global.chrome = {
    runtime: { id: 'ext' },
    windows: {
      async create(options) {
        createdWindows.push(options);
        return {
          id: 7,
          tabs: options.url.map((url, index) => ({ id: index + 10, url, index })),
        };
      },
    },
    tabs: {
      async query() {
        return [
          { id: 10, url: 'https://docs.test/a', index: 0 },
          { id: 11, url: 'https://docs.test/b', index: 1 },
        ];
      },
      async group(options) {
        groupedTabSets.push(options.tabIds);
        return 21;
      },
    },
    tabGroups: {
      async update(groupId, update) {
        updatedGroups.push({ groupId, update });
      },
    },
  };

  const restored = await tabs.restoreSavedSession({
    group: 'Research',
    groupColor: 'blue',
    tabs: [
      { url: 'https://docs.test/a', title: 'A', index: 0, groupTitle: 'Research', groupColor: 'blue' },
      { url: 'https://docs.test/b', title: 'B', index: 1, groupTitle: 'Research', groupColor: 'blue' },
    ],
  });
  assert.deepEqual(createdWindows[0].url, ['https://docs.test/a', 'https://docs.test/b']);
  assert.deepEqual(groupedTabSets, [[10, 11]]);
  assert.deepEqual(updatedGroups, [{ groupId: 21, update: { title: 'Research', color: 'blue' } }]);
  assert.deepEqual(restored.groupIds, [21]);

  const createdTabs = [];
  const groupedCurrentWindowTabSets = [];
  global.chrome = {
    runtime: { id: 'ext' },
    windows: {
      async update() {},
    },
    tabs: {
      async query() {
        return [{ id: 5, url: 'chrome-extension://ext/index.html', active: true, index: 2 }];
      },
      async create(options) {
        const tab = { id: 30 + createdTabs.length, url: options.url, index: options.index };
        createdTabs.push(options);
        return tab;
      },
      async group(options) {
        groupedCurrentWindowTabSets.push(options.tabIds);
        return 31;
      },
    },
    tabGroups: {
      async update() {},
    },
  };

  await tabs.restoreSavedSession({
    group: 'Build',
    tabs: [
      { url: 'https://repo.test/issues', groupTitle: 'Build' },
      { url: 'https://repo.test/pulls', groupTitle: 'Build' },
    ],
  }, { windowId: 9, focused: false });
  assert.deepEqual(createdTabs.map(tab => ({ windowId: tab.windowId, active: tab.active, index: tab.index })), [
    { windowId: 9, active: false, index: 3 },
    { windowId: 9, active: false, index: 4 },
  ]);
  assert.deepEqual(groupedCurrentWindowTabSets, [[30, 31]]);
}

async function testStorageService() {
  const fakeStorage = makeFakeStorage({
    deferred: [
      { url: 'https://a.test', title: 'A' },
      { title: 'Missing URL' },
    ],
    viewMode: 'bad',
    privacySettings: { clock: false, mottoText: 'Focus' },
    savedSessions: [
      {
        id: 'session-1',
        name: 'MV3 research',
        group: 'Extensions',
        groupColor: 'cyan',
        tabs: [
          {
            title: 'Side Panel',
            url: 'https://developer.chrome.com/docs/extensions',
            windowId: 1,
            index: 3,
            groupTitle: 'Extensions',
            groupColor: 'cyan',
          },
        ],
      },
    ],
  });

  global.chrome = { storage: { local: fakeStorage } };
  const migration = await storage.migrateStorage();
  assert.equal(migration.changed, true);
  assert.equal(fakeStorage.store.storageSchemaVersion, storage.CURRENT_SCHEMA_VERSION);
  assert.equal(fakeStorage.store.deferred.length, 1);
  assert.equal(fakeStorage.store.savedSessions.length, 1);
  assert.equal(fakeStorage.store.viewMode, 'group');
  assert.deepEqual(fakeStorage.store.privacySettings, {
    clock: false,
    date: true,
    motto: true,
    mottoText: 'Focus',
    externalFavicons: true,
  });

  await storage.addDeferredTab({ url: 'https://b.test', title: 'B' });
  const saved = await storage.getSavedTabs();
  assert.equal(saved.active.length, 2);
  await storage.updateDeferredTab(saved.active[0].id, { completed: true, completedAt: '2026-04-30T00:00:00.000Z' });
  const afterUpdate = await storage.getSavedTabs();
  assert.equal(afterUpdate.archived.length, 1);
  assert.equal(await storage.clearArchivedDeferredTabs(), 1);
  const afterArchiveClear = await storage.getSavedTabs();
  assert.equal(afterArchiveClear.archived.length, 0);
  assert.equal(afterArchiveClear.active.length, 1);
  const storedSession = (await storage.getSavedSessions())[0];
  assert.equal(storedSession.name, 'MV3 research');
  assert.equal(storedSession.groupColor, 'cyan');
  assert.equal(storedSession.tabs[0].groupColor, 'cyan');
  assert.equal(storedSession.tabs[0].index, 3);
  await storage.addSavedSession({ name: 'Focus set', urls: ['https://focus.test'] });
  assert.equal((await storage.getSavedSessions())[0].name, 'Focus set');
  assert.equal(await storage.removeSavedSession('session-1'), true);
  assert.equal((await storage.getSavedSessions()).some(session => session.id === 'session-1'), false);
  const stats = await storage.recordActivity({ type: 'closed', count: 3, domain: 'example.com' });
  assert.equal(stats.closedTotal, 3);
  assert.equal(stats.domains['example.com'], 3);

  const futureStorage = makeFakeStorage({ storageSchemaVersion: storage.CURRENT_SCHEMA_VERSION + 1 });
  global.chrome = { storage: { local: futureStorage } };
  const futureMigration = await storage.migrateStorage();
  assert.equal(futureMigration.forwardVersion, true);
  assert.equal(futureStorage.store.storageSchemaVersion, storage.CURRENT_SCHEMA_VERSION + 1);
}

function testSearchService() {
  const index = search.buildSearchIndex({
    tabs: [
      { id: 1, title: 'GitHub Pull Request', url: 'https://github.com/org/repo/pull/1', groupId: 10 },
      { id: 2, title: 'Docs', url: 'https://developer.mozilla.org/en-US/docs', groupId: -1 },
    ],
    tabGroups: [{ id: 10, title: 'Work' }],
    savedTabs: [{ id: 's1', title: 'Read later', url: 'https://example.com/article' }],
    savedSessions: [{
      id: 'session-1',
      name: 'Chrome MV3 references',
      tabs: [
        { title: 'Side Panel', url: 'https://developer.chrome.com/docs/extensions/reference/api/sidePanel', groupTitle: 'Extensions' },
      ],
    }],
  });

  assert.equal(search.searchIndex(index, 'gthb')[0].title, 'GitHub Pull Request');
  assert.equal(search.searchIndex(index, 'domain:github work').length, 1);
  assert.equal(search.searchIndex(index, 'saved:true').some(record => record.title === 'Read later'), true);
  assert.equal(search.searchIndex(index, 'url:mozilla')[0].title, 'Docs');
  assert.equal(search.searchIndex(index, 'saved:true group:extensions')[0].type, 'session');
  assert.equal(search.searchIndex(index, 'domain:chrome sidepanel')[0].type, 'session');
  assert.deepEqual(search.getHighlightSegments('GitHub Pull Request', 'git pull').filter(s => s.match).map(s => s.text), ['Git', 'Pull']);
}

function testMetricsService() {
  const health = metrics.calculateTabHealth([
    { url: 'https://a.test', groupId: -1 },
    { url: 'https://a.test', groupId: -1 },
    { url: 'https://b.test', groupId: 2 },
  ]);
  assert.equal(health.duplicateExtras, 1);
  assert.equal(health.tabCount, 3);
  assert.equal(health.score < 100, true);
  const summary = metrics.summarizeActivity({
    weekly: { '2026-W18': { closed: 4, saved: 2, duplicateClosed: 1, sessionsSaved: 1 } },
    domains: { 'b.test': 1, 'a.test': 3 },
  });
  assert.equal(summary.closedThisWeek, 4);
  assert.equal(summary.topDomains[0].domain, 'a.test');
  assert.deepEqual(metrics.evaluateAchievements({ closedTotal: 10, sessionsSavedTotal: 1 }, { score: 95, tabCount: 4 }), ['closed-10', 'session-saver', 'calm-deck']);
}

function testHtmlService() {
  assert.equal(
    html.escapeHtml('<img src=x onerror="alert(1)">'),
    '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;'
  );
}

async function testToolsService() {
  assert.equal(tools.searchTools('json', { lang: 'en' })[0].id, 'json');
  assert.equal(tools.searchTools('二维码', { lang: 'zh' })[0].id, 'qr');
  const jsonTool = tools.getTool('json', { lang: 'en' });
  assert.equal(jsonTool.icon, 'json-tree');
  assert.equal(jsonTool.categoryLabel, 'Format');
  assert.equal(jsonTool.examples.length > 0, true);
  assert.deepEqual(
    tools.getTools({ lang: 'en' }).map(tool => tool.icon),
    ['json-tree', 'qr-grid', 'time-ruler', 'url-search', 'codec-arrows', 'id-key', 'fingerprint-hash', 'cookie-kv', 'session-export']
  );
  assert.equal(tools.getToolIconSvg('qr-grid').includes('data-tool-icon="qr-grid"'), true);
  assert.equal(tools.getToolIconSvg('missing').includes('data-tool-icon="tool-default"'), true);

  const formatted = await tools.runTool('json', '{"b":2,"a":1}', { action: 'format' });
  assert.equal(formatted.ok, true);
  assert.equal(formatted.output.includes('\n  "b": 2'), true);
  assert.equal(formatted.visual.type, 'json-tree');
  assert.equal(formatted.visual.tree.type, 'object');
  const minified = await tools.runTool('json', '{ "a": 1 }', { action: 'minify' });
  assert.equal(minified.output, '{"a":1}');
  const invalidJson = await tools.runTool('json', '{bad', { action: 'validate' });
  assert.equal(invalidJson.ok, false);
  assert.equal(typeof invalidJson.diagnostics.message, 'string');

  const parsedUrl = await tools.runTool('url', 'https://example.com/path?a=1&a=2&b=x#top', { action: 'parse' });
  const urlPayload = JSON.parse(parsedUrl.output);
  assert.deepEqual(urlPayload.params.a, ['1', '2']);
  assert.equal(parsedUrl.visual.type, 'url');
  assert.equal(parsedUrl.visual.params.length, 3);
  assert.equal((await tools.runTool('url', 'a b', { action: 'encode' })).output, 'a%20b');
  assert.equal((await tools.runTool('url', 'a%20b', { action: 'decode' })).output, 'a b');

  const b64 = await tools.runTool('codec', '你好', { action: 'base64-encode' });
  assert.equal((await tools.runTool('codec', b64.output, { action: 'base64-decode' })).output, '你好');
  assert.equal((await tools.runTool('codec', '<a&b>', { action: 'html-encode' })).output, '&lt;a&amp;b&gt;');
  assert.equal((await tools.runTool('codec', '\\u4f60\\u597d', { action: 'unicode-decode' })).output, '你好');

  const ts = await tools.runTool('timestamp', '0', { action: 'convert' });
  assert.equal(JSON.parse(ts.output).iso, '1970-01-01T00:00:00.000Z');
  assert.equal(ts.visual.type, 'timestamp');
  assert.equal((await tools.runTool('timestamp', '', { action: 'convert' })).ok, false);
  const ft = await tools.runTool('timestamp', '116444736000000000', { action: 'filetime' });
  assert.equal(JSON.parse(ft.output).unixMilliseconds, 0);
  const weekStart = await tools.runTool('timestamp', '', { action: 'week-start' });
  assert.equal(weekStart.ok, true);

  const cookie = await tools.runTool('cookie', 'a=1; token=hello%20world', { action: 'json' });
  assert.deepEqual(JSON.parse(cookie.output), { a: '1', token: 'hello world' });
  assert.equal(cookie.visual.rows.length, 2);

  const qr = await tools.runTool('qr', 'https://example.com', { action: 'generate' });
  assert.equal(qr.ok, true);
  assert.equal(qr.meta.mime, 'image/svg+xml');
  assert.equal(qr.visual.type, 'qr');
  assert.equal(qr.output.startsWith('<svg'), true);
  assert.equal(qr.output.includes('viewBox="0 0'), true);

  assert.equal(await tools.md5('abc'), '900150983cd24fb0d6963f7d28e17f72');
  assert.equal((await tools.runTool('hash', 'abc', { action: 'sha1' })).output, 'a9993e364706816aba3e25717850c26c9cd0d89d');
  assert.equal((await tools.runTool('hash', 'abc', { action: 'sha256' })).output, 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');

  const tabsForExport = [
    { title: 'A [doc]', url: 'https://a.test', windowId: 1, index: 1, groupTitle: 'Work' },
    { title: 'B', url: 'https://b.test', windowId: 1, index: 0 },
  ];
  assert.equal(tools.formatSessionExport(tabsForExport, 'urls'), 'https://b.test\nhttps://a.test');
  assert.equal(tools.formatSessionExport(tabsForExport, 'markdown').includes('[A \\[doc\\]](https://a.test)'), true);
  assert.equal(JSON.parse(tools.formatSessionExport(tabsForExport, 'json')).tabs.length, 2);

  const fakeStorage = makeFakeStorage();
  global.chrome = { storage: { local: fakeStorage } };
  assert.deepEqual(await tools.setFavorite('json', true), ['json']);
  assert.deepEqual(await tools.setFavorite('url', true), ['json', 'url']);
  assert.deepEqual(await tools.setFavoritesOrder(['url', 'json', 'missing', 'url']), ['url', 'json']);
  assert.deepEqual(await tools.getFavorites(), ['url', 'json']);
  assert.deepEqual((await tools.getToolOrder()).slice(0, 3), ['url', 'json', 'qr']);
  assert.deepEqual((await tools.setToolOrder(['hash', 'qr', 'missing', 'hash'])).slice(0, 4), ['hash', 'qr', 'json', 'timestamp']);
  assert.deepEqual((await tools.getToolOrder()).slice(0, 4), ['hash', 'qr', 'json', 'timestamp']);
  await tools.recordRecent('hash');
  await tools.recordRecent('json');
  assert.deepEqual((await tools.getRecent()).map(item => item.id), ['json', 'hash']);
  await tools.setToolState('json', { input: '{"a":1}', output: 'ok' });
  assert.equal((await tools.getToolState('json')).output, 'ok');
}

await testTabsService();
await testStorageService();
testSearchService();
testMetricsService();
testHtmlService();
await testToolsService();

console.log('Unit tests passed.');

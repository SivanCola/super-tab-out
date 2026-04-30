/**
 * background.js — Service Worker
 *
 * Keeps the badge fresh and owns browser-level entry points:
 * toolbar action, manifest commands, omnibox, and light session actions.
 */

importScripts(
  'services/html-service.js',
  'services/storage-service.js',
  'services/tabs-service.js',
  'services/search-service.js',
  'services/tools-service.js'
);

const INTERNAL_URL_PREFIXES = ['chrome://', 'chrome-extension://', 'about:', 'edge://', 'brave://'];

function isRealWebTab(tab) {
  if (!tab || tab.pinned) return false;
  const url = tab.url || '';
  return !INTERNAL_URL_PREFIXES.some(prefix => url.startsWith(prefix));
}

async function updateBadge() {
  try {
    const tabs = await chrome.tabs.query({});
    const count = tabs.filter(isRealWebTab).length;

    await chrome.action.setBadgeText({ text: count > 0 ? String(count) : '' });
    if (count === 0) return;

    const color = count <= 10 ? '#3d7a4a' : count <= 20 ? '#b8892e' : '#b35a5a';
    await chrome.action.setBadgeBackgroundColor({ color });
  } catch {
    chrome.action.setBadgeText({ text: '' });
  }
}

async function openSidePanel(tab) {
  try {
    await chrome.sidePanel.setOptions({ path: 'sidepanel.html', enabled: true });
    const windowId = tab?.windowId || (await chrome.windows.getCurrent()).id;
    await chrome.sidePanel.open({ windowId });
  } catch {
    const url = chrome.runtime.getURL('sidepanel.html');
    await chrome.tabs.create({ url });
  }
}

async function configureActionClickBehavior() {
  try {
    await chrome.sidePanel?.setPanelBehavior?.({ openPanelOnActionClick: false });
  } catch {}
}

async function openToolsPage() {
  await chrome.tabs.create({ url: chrome.runtime.getURL('tools.html?tool=url') });
}

async function saveCurrentSession(scope = 'all') {
  const tabs = await chrome.tabs.query(scope === 'currentWindow' ? { currentWindow: true } : {});
  const realTabs = tabs.filter(isRealWebTab).sort((a, b) => {
    if (a.windowId !== b.windowId) return a.windowId - b.windowId;
    return a.index - b.index;
  });

  const groupIds = Array.from(new Set(realTabs.map(tab => tab.groupId).filter(id => id >= 0)));
  const groupInfo = new Map();
  for (const groupId of groupIds) {
    try {
      const group = await chrome.tabGroups.get(groupId);
      groupInfo.set(groupId, group);
    } catch {}
  }

  const session = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: `Session ${new Date().toLocaleString()}`,
    savedAt: new Date().toISOString(),
    tabs: realTabs.map(tab => {
      const group = groupInfo.get(tab.groupId);
      return {
        url: tab.url,
        title: tab.title || tab.url,
        pinned: tab.pinned === true,
        windowId: tab.windowId,
        index: tab.index,
        groupTitle: group?.title || '',
        groupColor: group?.color || '',
      };
    }),
    urls: realTabs.map(tab => tab.url),
  };

  await self.SuperTabOutStorage.addSavedSession(session);
  await self.SuperTabOutStorage.recordActivity({ type: 'sessionSaved', count: 1 });
  return session;
}

async function broadcastToExtensionPages(message) {
  const tabs = await chrome.tabs.query({ url: chrome.runtime.getURL('*') });
  for (const tab of tabs) {
    if (!tab.id) continue;
    try { await chrome.tabs.sendMessage(tab.id, message); } catch {}
  }
}

async function buildOmniboxSuggestions(query) {
  const toolQuery = query.replace(/^tool\s+/i, '').trim();
  const toolSuggestions = self.SuperTabOutTools.searchTools(toolQuery || query, { lang: 'en' })
    .slice(0, 3)
    .map(tool => ({
      content: `tool:${tool.id}`,
      description: `TOOL ${escapeOmnibox(tool.title)} <dim>${escapeOmnibox(tool.description)}</dim>`,
    }));

  const tabs = (await self.SuperTabOutTabs.fetchOpenTabs()).filter(tab => self.SuperTabOutTabs.isRealTab(tab, chrome.runtime.id));
  const groups = await self.SuperTabOutTabs.fetchTabGroups();
  const saved = await self.SuperTabOutStorage.getSavedTabs();
  const sessions = await self.SuperTabOutStorage.getSavedSessions();
  const index = self.SuperTabOutSearch.buildSearchIndex({
    tabs,
    tabGroups: groups,
    savedTabs: [...saved.active, ...saved.archived],
    savedSessions: sessions,
  });
  const searchSuggestions = self.SuperTabOutSearch.searchIndex(index, query)
    .slice(0, 5)
    .map(record => ({
      content: record.type === 'tab' ? `tab:${record.url}` : record.type === 'saved' ? `url:${record.url}` : `session:${record.source.id}`,
      description: `${record.type.toUpperCase()} ${escapeOmnibox(record.title)} <dim>${escapeOmnibox(record.domain || record.url || '')}</dim>`,
    }));
  return [...toolSuggestions, ...searchSuggestions].slice(0, 6);
}

function escapeOmnibox(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

async function handleOmniboxSelection(text) {
  if (text.startsWith('tool:')) {
    await chrome.tabs.create({ url: chrome.runtime.getURL(`tools.html?tool=${encodeURIComponent(text.slice(5))}`) });
    return;
  }
  if (/^tool\s+/i.test(text)) {
    const query = text.replace(/^tool\s+/i, '').trim();
    const tool = self.SuperTabOutTools.searchTools(query, { lang: 'en' })[0];
    await chrome.tabs.create({ url: chrome.runtime.getURL(`tools.html${tool ? `?tool=${encodeURIComponent(tool.id)}` : ''}`) });
    return;
  }
  if (text === 'sidepanel' || text === 'panel') {
    await openSidePanel();
    return;
  }
  if (text === 'dedupe' || text === 'clean') {
    const tabs = (await self.SuperTabOutTabs.fetchOpenTabs()).filter(tab => self.SuperTabOutTabs.isRealTab(tab, chrome.runtime.id));
    const counts = new Map();
    for (const tab of tabs) counts.set(tab.url, (counts.get(tab.url) || 0) + 1);
    const urls = Array.from(counts.entries()).filter(([, count]) => count > 1).map(([url]) => url);
    const closed = await self.SuperTabOutTabs.closeDuplicateTabs(urls, true);
    await self.SuperTabOutStorage.recordActivity({ type: 'duplicateClosed', count: closed.length || urls.length });
    await updateBadge();
    return;
  }
  if (text === 'privacy') {
    await broadcastToExtensionPages({ type: 'toggle-privacy-mode' });
    return;
  }
  if (text === 'save' || text === 'save-session') {
    await saveCurrentSession();
    return;
  }
  if (text.startsWith('tab:')) {
    await self.SuperTabOutTabs.focusTab(text.slice(4));
    return;
  }
  if (text.startsWith('url:')) {
    await chrome.tabs.create({ url: text.slice(4) });
    return;
  }
  if (text.startsWith('session:')) {
    const id = text.slice(8);
    const sessions = await self.SuperTabOutStorage.getSavedSessions();
    const session = sessions.find(item => item.id === id);
    if (session) await self.SuperTabOutTabs.restoreSavedSession(session, { focused: true });
    return;
  }

  const suggestions = await buildOmniboxSuggestions(text);
  if (suggestions[0]) {
    await handleOmniboxSelection(suggestions[0].content);
  } else {
    await openSidePanel();
  }
}

chrome.runtime.onInstalled.addListener(() => {
  updateBadge();
  configureActionClickBehavior();
  chrome.omnibox.setDefaultSuggestion({
    description: 'Search Super Tab Out tabs, saved items, and sessions. Try "panel" or "save".',
  });
});

chrome.runtime.onStartup.addListener(() => {
  updateBadge();
  configureActionClickBehavior();
});
chrome.action.onClicked.addListener(openToolsPage);
chrome.tabs.onCreated.addListener(updateBadge);
chrome.tabs.onRemoved.addListener(updateBadge);
chrome.tabs.onUpdated.addListener(updateBadge);

chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'open-side-panel') {
    await openSidePanel();
  } else if (command === 'save-current-session') {
    await saveCurrentSession();
  } else if (command === 'toggle-privacy-mode') {
    await broadcastToExtensionPages({ type: 'toggle-privacy-mode' });
  }
});

chrome.omnibox.onInputChanged.addListener(async (text, suggest) => {
  try {
    const suggestions = await buildOmniboxSuggestions(text);
    suggest([
      { content: 'sidepanel', description: 'Open <match>Super Tab Out</match> side panel' },
      { content: 'save-session', description: 'Save current browsing session' },
      { content: 'dedupe', description: 'Clean duplicate open tabs' },
      { content: 'privacy', description: 'Toggle privacy mode on Super Tab Out pages' },
      { content: 'tool:json', description: 'Open <match>JSON</match> local tool' },
      ...suggestions,
    ]);
  } catch {
    suggest([{ content: 'sidepanel', description: 'Open Super Tab Out side panel' }]);
  }
});

chrome.omnibox.onInputEntered.addListener((text) => {
  handleOmniboxSelection(text);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    if (message?.type === 'open-side-panel') {
      await openSidePanel(sender.tab);
      sendResponse({ ok: true });
    } else if (message?.type === 'save-current-session') {
      const session = await saveCurrentSession(message.scope || 'all');
      sendResponse({ ok: true, session });
    } else if (message?.type === 'restore-saved-session') {
      const sessions = await self.SuperTabOutStorage.getSavedSessions();
      const session = sessions.find(item => item.id === message.id);
      const restored = session ? await self.SuperTabOutTabs.restoreSavedSession(session, { focused: true }) : null;
      sendResponse({ ok: !!restored, restored });
    } else {
      sendResponse({ ok: false });
    }
  })();
  return true;
});

configureActionClickBehavior();
updateBadge();

/* Super Tab Out tabs service.
   Isolates chrome.tabs/chrome.windows/tabGroups calls and pure tab rules. */
(function (global) {
  'use strict';

  const BROWSER_NEWTAB_URLS = [
    'chrome://newtab/',
    'edge://newtab/',
    'brave://newtab/',
    'about:newtab',
  ];

  const CHROME_GROUP_COLORS = new Set([
    'grey',
    'blue',
    'red',
    'yellow',
    'green',
    'pink',
    'purple',
    'cyan',
    'orange',
  ]);

  function getChromeApi() {
    return global.chrome || null;
  }

  function extensionNewTabUrl(extensionId) {
    return extensionId ? `chrome-extension://${extensionId}/index.html` : '';
  }

  function isBrowserNewTabUrl(url) {
    return BROWSER_NEWTAB_URLS.includes(url || '');
  }

  function isExtensionPageUrl(url, extensionId) {
    if (!url || !extensionId) return false;
    return url.startsWith(`chrome-extension://${extensionId}/`);
  }

  function isInternalUrl(url, extensionId) {
    if (!url) return true;
    return (
      url.startsWith('chrome://') ||
      url.startsWith('chrome-extension://') ||
      url.startsWith('about:') ||
      url.startsWith('edge://') ||
      url.startsWith('brave://') ||
      isExtensionPageUrl(url, extensionId)
    );
  }

  function isRealTab(tab, extensionId) {
    return !!tab && tab.pinned !== true && !isInternalUrl(tab.url || '', extensionId);
  }

  function normalizeTab(tab, extensionId) {
    const url = tab.url || '';
    const newtabUrl = extensionNewTabUrl(extensionId);
    return {
      id: tab.id,
      url,
      title: tab.title,
      windowId: tab.windowId,
      active: tab.active,
      pinned: tab.pinned,
      groupId: typeof tab.groupId === 'number' ? tab.groupId : -1,
      index: tab.index,
      isTabOut: url === newtabUrl || isBrowserNewTabUrl(url),
    };
  }

  async function fetchOpenTabs() {
    const chromeApi = getChromeApi();
    if (!chromeApi?.tabs) return [];
    const extensionId = chromeApi.runtime?.id || '';
    const tabs = await chromeApi.tabs.query({});
    return tabs.map(tab => normalizeTab(tab, extensionId));
  }

  async function fetchTabGroups() {
    const chromeApi = getChromeApi();
    if (!chromeApi?.tabGroups) return [];
    try {
      return await chromeApi.tabGroups.query({});
    } catch {
      return [];
    }
  }

  function exactUnpinnedIdsForUrls(tabs, urls) {
    const urlSet = new Set(urls || []);
    return (tabs || [])
      .filter(tab => !tab.pinned && urlSet.has(tab.url))
      .map(tab => tab.id);
  }

  async function closeTabsByUrls(urls) {
    const chromeApi = getChromeApi();
    if (!chromeApi?.tabs || !urls || urls.length === 0) return [];
    const tabs = await chromeApi.tabs.query({});
    const toClose = exactUnpinnedIdsForUrls(tabs, urls);
    if (toClose.length > 0) await chromeApi.tabs.remove(toClose);
    return toClose;
  }

  async function closeTabsByIds(ids) {
    const chromeApi = getChromeApi();
    if (!chromeApi?.tabs || !ids || ids.length === 0) return [];
    const idSet = new Set(ids);
    const tabs = await chromeApi.tabs.query({});
    const toClose = tabs
      .filter(tab => idSet.has(tab.id) && !tab.pinned)
      .map(tab => tab.id);
    if (toClose.length > 0) await chromeApi.tabs.remove(toClose);
    return toClose;
  }

  async function focusTab(url) {
    const chromeApi = getChromeApi();
    if (!chromeApi?.tabs || !chromeApi?.windows || !url) return null;
    const allTabs = await chromeApi.tabs.query({});
    const currentWindow = await chromeApi.windows.getCurrent();

    let matches = allTabs.filter(tab => tab.url === url);
    if (matches.length === 0) {
      try {
        const targetHost = new URL(url).hostname;
        matches = allTabs.filter(tab => {
          try { return new URL(tab.url).hostname === targetHost; }
          catch { return false; }
        });
      } catch {}
    }

    if (matches.length === 0) return null;

    const match = matches.find(tab => tab.windowId !== currentWindow.id) || matches[0];
    await chromeApi.tabs.update(match.id, { active: true });
    await chromeApi.windows.update(match.windowId, { focused: true });
    return match;
  }

  async function closeDuplicateTabs(urls, keepOne = true) {
    const chromeApi = getChromeApi();
    if (!chromeApi?.tabs) return [];
    const allTabs = await chromeApi.tabs.query({});
    const toClose = [];

    for (const url of urls || []) {
      const matching = allTabs.filter(tab => tab.url === url && !tab.pinned);
      if (keepOne) {
        const keep = matching.find(tab => tab.active) || matching[0];
        for (const tab of matching) {
          if (keep && tab.id !== keep.id) toClose.push(tab.id);
        }
      } else {
        for (const tab of matching) {
          toClose.push(tab.id);
        }
      }
    }

    if (toClose.length > 0) await chromeApi.tabs.remove(toClose);
    return toClose;
  }

  async function closeTabOutDupes() {
    const chromeApi = getChromeApi();
    if (!chromeApi?.tabs || !chromeApi?.windows) return [];
    const extensionId = chromeApi.runtime?.id || '';
    const newtabUrl = extensionNewTabUrl(extensionId);
    const allTabs = await chromeApi.tabs.query({});
    const currentWindow = await chromeApi.windows.getCurrent();
    const tabOutTabs = allTabs.filter(tab =>
      tab.url === newtabUrl || isBrowserNewTabUrl(tab.url)
    );

    if (tabOutTabs.length <= 1) return [];

    const keep =
      tabOutTabs.find(tab => tab.active && tab.windowId === currentWindow.id) ||
      tabOutTabs.find(tab => tab.active) ||
      tabOutTabs[0];
    const toClose = tabOutTabs.filter(tab => tab.id !== keep.id).map(tab => tab.id);
    if (toClose.length > 0) await chromeApi.tabs.remove(toClose);
    return toClose;
  }

  async function groupTabs(tabIds, options = {}) {
    const chromeApi = getChromeApi();
    if (!chromeApi?.tabs || !chromeApi?.tabGroups || !tabIds?.length) return null;
    const groupId = await chromeApi.tabs.group({ tabIds });
    await chromeApi.tabGroups.update(groupId, {
      ...(options.title ? { title: options.title } : {}),
      ...(options.color ? { color: options.color } : {}),
      ...(typeof options.collapsed === 'boolean' ? { collapsed: options.collapsed } : {}),
    });
    return groupId;
  }

  async function updateGroup(groupId, options = {}) {
    const chromeApi = getChromeApi();
    if (!chromeApi?.tabGroups || !Number.isFinite(groupId)) return null;
    return await chromeApi.tabGroups.update(groupId, options);
  }

  async function ungroupTabs(tabIds) {
    const chromeApi = getChromeApi();
    if (!chromeApi?.tabs || !tabIds?.length) return;
    await chromeApi.tabs.ungroup(tabIds);
  }

  async function getRecentlyClosed(maxResults = 10) {
    const chromeApi = getChromeApi();
    if (!chromeApi?.sessions) return [];
    return await chromeApi.sessions.getRecentlyClosed({ maxResults });
  }

  async function restoreSession(sessionId) {
    const chromeApi = getChromeApi();
    if (!chromeApi?.sessions) return null;
    return await chromeApi.sessions.restore(sessionId);
  }

  function normalizeSessionRestoreTabs(session) {
    const sourceTabs = Array.isArray(session?.tabs) && session.tabs.length > 0
      ? session.tabs
      : (Array.isArray(session?.urls) ? session.urls.map(url => ({ url })) : []);

    return sourceTabs
      .filter(tab => tab && typeof tab.url === 'string' && tab.url.length > 0)
      .filter(tab => !isInternalUrl(tab.url, getChromeApi()?.runtime?.id || ''))
      .map((tab, index) => ({
        url: tab.url,
        title: typeof tab.title === 'string' ? tab.title : tab.url,
        windowId: Number.isFinite(Number(tab.windowId)) ? Number(tab.windowId) : 0,
        index: Number.isFinite(Number(tab.index)) ? Number(tab.index) : index,
        groupTitle: typeof tab.groupTitle === 'string' ? tab.groupTitle : '',
        groupColor: typeof tab.groupColor === 'string' ? tab.groupColor : '',
      }))
      .sort((a, b) => a.windowId === b.windowId ? a.index - b.index : a.windowId - b.windowId);
  }

  async function restoreSavedSession(session, options = {}) {
    const chromeApi = getChromeApi();
    if (!chromeApi?.windows || !chromeApi?.tabs) return null;

    const sessionTabs = normalizeSessionRestoreTabs(session);
    const urls = sessionTabs.map(tab => tab.url);
    if (urls.length === 0) return null;

    let restoredWindow = null;
    let restoredTabs = [];
    const targetWindowId = Number(options.windowId);

    if (Number.isFinite(targetWindowId)) {
      const existingTabs = await chromeApi.tabs.query({ windowId: targetWindowId });
      const activeTab = existingTabs.find(tab => tab.active) || existingTabs[existingTabs.length - 1];
      let insertIndex = Number.isFinite(Number(activeTab?.index)) ? Number(activeTab.index) + 1 : existingTabs.length;
      for (const url of urls) {
        const created = await chromeApi.tabs.create({
          url,
          windowId: targetWindowId,
          active: options.active === true,
          index: insertIndex,
        });
        restoredTabs.push(created);
        insertIndex += 1;
      }
      restoredWindow = { id: targetWindowId, tabs: restoredTabs };
      if (options.focused === true) await chromeApi.windows.update(targetWindowId, { focused: true });
    } else {
      restoredWindow = await chromeApi.windows.create({
        url: urls,
        focused: options.focused !== false,
      });

      restoredTabs = Array.isArray(restoredWindow?.tabs) ? restoredWindow.tabs : [];
      if (restoredWindow?.id != null && restoredTabs.length < urls.length) {
        restoredTabs = await chromeApi.tabs.query({ windowId: restoredWindow.id });
      }
    }

    restoredTabs = restoredTabs
      .filter(tab => tab?.id != null)
      .sort((a, b) => (a.index || 0) - (b.index || 0));

    const fallbackTitle = typeof session?.group === 'string' ? session.group : '';
    const fallbackColor = typeof session?.groupColor === 'string' ? session.groupColor : '';
    const groups = new Map();

    sessionTabs.forEach((sourceTab, index) => {
      const restoredTab = restoredTabs[index];
      if (!restoredTab?.id) return;
      const title = sourceTab.groupTitle || fallbackTitle;
      const color = sourceTab.groupColor || fallbackColor;
      if (!title && !color) return;
      const key = `${title}\n${color}`;
      if (!groups.has(key)) groups.set(key, { title, color, tabIds: [] });
      groups.get(key).tabIds.push(restoredTab.id);
    });

    const groupIds = [];
    if (chromeApi.tabGroups) {
      for (const group of groups.values()) {
        if (group.tabIds.length === 0) continue;
        const groupId = await chromeApi.tabs.group({ tabIds: group.tabIds });
        const update = {};
        if (group.title) update.title = group.title;
        if (CHROME_GROUP_COLORS.has(group.color)) update.color = group.color;
        if (Object.keys(update).length > 0) await chromeApi.tabGroups.update(groupId, update);
        groupIds.push(groupId);
      }
    }

    return {
      windowId: restoredWindow?.id,
      tabIds: restoredTabs.map(tab => tab.id).filter(Boolean),
      groupIds,
    };
  }

  const api = {
    BROWSER_NEWTAB_URLS,
    extensionNewTabUrl,
    isBrowserNewTabUrl,
    isExtensionPageUrl,
    isInternalUrl,
    isRealTab,
    normalizeTab,
    fetchOpenTabs,
    fetchTabGroups,
    exactUnpinnedIdsForUrls,
    closeTabsByUrls,
    closeTabsByIds,
    focusTab,
    closeDuplicateTabs,
    closeTabOutDupes,
    groupTabs,
    updateGroup,
    ungroupTabs,
    getRecentlyClosed,
    restoreSession,
    normalizeSessionRestoreTabs,
    restoreSavedSession,
  };

  global.SuperTabOutTabs = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);

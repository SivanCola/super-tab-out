/* ================================================================
   Super Tab Out — Dashboard App (Pure Extension Edition)
   Based on Tab Out by Zara Zhang (MIT) — https://github.com/zarazhangrui/tab-out

   This file is the brain of the dashboard. Now that the dashboard
   IS the extension page (not inside an iframe), it can call
   chrome.tabs and chrome.storage directly — no postMessage bridge needed.

   What this file does:
   1. Reads open browser tabs directly via chrome.tabs.query()
   2. Groups tabs by domain with a landing pages category
   3. Renders domain cards, banners, and stats
   4. Handles all user actions (close tabs, save for later, focus tab)
   5. Stores "Saved for Later" tabs in chrome.storage.local (no server)
   ================================================================ */

'use strict';


/* ----------------------------------------------------------------
   CHROME TABS — Direct API Access

   Since this page IS the extension's new tab page, it has full
   access to chrome.tabs and chrome.storage. No middleman needed.
   ---------------------------------------------------------------- */

// All open tabs — populated by fetchOpenTabs()
let openTabs = [];

// Chrome Tab Groups metadata — populated by fetchTabGroups(). Only used
// when the user is in 'group' view mode; safe to leave empty otherwise.
let tabGroupsList = [];

// Browser-builtin new-tab URLs across Chromium variants (Chrome, Edge,
// Brave). The extension page URL itself is also treated as Tab Out.
const BROWSER_NEWTAB_URLS = [
  'chrome://newtab/',
  'edge://newtab/',
  'brave://newtab/',
  'about:newtab',
];

/**
 * fetchOpenTabs()
 *
 * Reads all currently open browser tabs directly from Chrome.
 * Sets the extensionId flag so we can identify Tab Out's own pages.
 */
async function fetchOpenTabs() {
  try {
    const extensionId = chrome.runtime.id;
    // The new URL for this page is now index.html (not newtab.html)
    const newtabUrl = `chrome-extension://${extensionId}/index.html`;

    const tabs = await chrome.tabs.query({});
    openTabs = tabs.map(t => ({
      id:       t.id,
      url:      t.url,
      title:    t.title,
      windowId: t.windowId,
      active:   t.active,
      pinned:   t.pinned,
      // groupId: -1 = ungrouped, otherwise the Chrome tab-group id.
      // index is Chrome's visual ordering — we use it to sort group cards.
      groupId:  typeof t.groupId === 'number' ? t.groupId : -1,
      index:    t.index,
      // Flag Tab Out's own pages so we can detect duplicate new tabs
      isTabOut: t.url === newtabUrl || BROWSER_NEWTAB_URLS.includes(t.url),
    }));
  } catch {
    // chrome.tabs API unavailable (shouldn't happen in an extension page)
    openTabs = [];
  }
}

/**
 * closeTabsByUrls(urls)
 *
 * Closes open tabs that exactly match one of the given URLs.
 *
 * Previously this matched by hostname, which would also close tabs the
 * user never saw — e.g. closing a domain card would take down the
 * corresponding homepage tab that had been split into the Homepages
 * group. Exact-URL matching keeps the action scoped to what the card
 * actually shows and still closes every duplicate tab for each URL.
 */
async function closeTabsByUrls(urls) {
  if (!urls || urls.length === 0) return;
  const urlSet = new Set(urls);
  const allTabs = await chrome.tabs.query({});
  const toClose = allTabs
    .filter(t => !t.pinned && urlSet.has(t.url))
    .map(t => t.id);
  if (toClose.length > 0) await chrome.tabs.remove(toClose);
  await fetchOpenTabs();
}

/**
 * focusTab(url)
 *
 * Switches Chrome to the tab with the given URL (exact match first,
 * then hostname fallback). Also brings the window to the front.
 */
async function focusTab(url) {
  if (!url) return;
  const allTabs = await chrome.tabs.query({});
  const currentWindow = await chrome.windows.getCurrent();

  // Try exact URL match first
  let matches = allTabs.filter(t => t.url === url);

  // Fall back to hostname match
  if (matches.length === 0) {
    try {
      const targetHost = new URL(url).hostname;
      matches = allTabs.filter(t => {
        try { return new URL(t.url).hostname === targetHost; }
        catch { return false; }
      });
    } catch {}
  }

  if (matches.length === 0) return;

  // Prefer a match in a different window so it actually switches windows
  const match = matches.find(t => t.windowId !== currentWindow.id) || matches[0];
  await chrome.tabs.update(match.id, { active: true });
  await chrome.windows.update(match.windowId, { focused: true });
}

/**
 * closeDuplicateTabs(urls, keepOne)
 *
 * Closes duplicate tabs for the given list of URLs.
 * keepOne=true → keep one copy of each, close the rest.
 * keepOne=false → close all copies.
 */
async function closeDuplicateTabs(urls, keepOne = true) {
  const allTabs = await chrome.tabs.query({});
  const toClose = [];

  for (const url of urls) {
    const matching = allTabs.filter(t => t.url === url);
    if (keepOne) {
      const keep = matching.find(t => t.active) || matching[0];
      for (const tab of matching) {
        if (tab.id !== keep.id && !tab.pinned) toClose.push(tab.id);
      }
    } else {
      for (const tab of matching) {
        if (!tab.pinned) toClose.push(tab.id);
      }
    }
  }

  if (toClose.length > 0) await chrome.tabs.remove(toClose);
  await fetchOpenTabs();
}

/**
 * closeTabOutDupes()
 *
 * Closes all duplicate Tab Out new-tab pages except the current one.
 */
async function closeTabOutDupes() {
  const extensionId = chrome.runtime.id;
  const newtabUrl = `chrome-extension://${extensionId}/index.html`;

  const allTabs = await chrome.tabs.query({});
  const currentWindow = await chrome.windows.getCurrent();
  const tabOutTabs = allTabs.filter(t =>
    t.url === newtabUrl || BROWSER_NEWTAB_URLS.includes(t.url)
  );

  if (tabOutTabs.length <= 1) return;

  // Keep the active Tab Out tab in the CURRENT window — that's the one the
  // user is looking at right now. Falls back to any active one, then the first.
  const keep =
    tabOutTabs.find(t => t.active && t.windowId === currentWindow.id) ||
    tabOutTabs.find(t => t.active) ||
    tabOutTabs[0];
  const toClose = tabOutTabs.filter(t => t.id !== keep.id).map(t => t.id);
  if (toClose.length > 0) await chrome.tabs.remove(toClose);
  await fetchOpenTabs();
}


/* ----------------------------------------------------------------
   CHROME TAB GROUPS + VIEW MODE

   View mode decides whether tabs are shown grouped by domain (original)
   or by Chrome tab group (Chrome's own colored group labels). Preference
   persists in chrome.storage.local under 'viewMode'. When no Chrome
   groups exist we fall back to domain view and hide the toggle pill.
   ---------------------------------------------------------------- */

async function fetchTabGroups() {
  try {
    tabGroupsList = await chrome.tabGroups.query({});
  } catch {
    // tabGroups permission missing or API unavailable — ignore.
    tabGroupsList = [];
  }
}

async function loadViewMode() {
  try {
    const { viewMode } = await chrome.storage.local.get('viewMode');
    return viewMode === 'domain' ? 'domain' : 'group';
  } catch { return 'group'; }
}

async function saveViewMode(mode) {
  try { await chrome.storage.local.set({ viewMode: mode }); } catch {}
}

// Close tabs by numeric ids. Used for "Close all tabs in this group".
// Pinned tabs are still protected (consistent with #7 behavior).
async function closeTabsByIds(ids) {
  if (!ids || ids.length === 0) return;
  const idSet = new Set(ids);
  const allTabs = await chrome.tabs.query({});
  const toClose = allTabs
    .filter(t => idSet.has(t.id) && !t.pinned)
    .map(t => t.id);
  if (toClose.length > 0) await chrome.tabs.remove(toClose);
  await fetchOpenTabs();
}


/* ----------------------------------------------------------------
   THEME SWITCHER

   Theme palettes the user can pick from. The active theme is written to localStorage and
   re-applied on load by theme-init.js before the body paints, so the
   page doesn't flash the default palette. This function only has to
   sync the DOM state and the pressed-button indicator.
   ---------------------------------------------------------------- */
const THEMES = ['warm', 'midnight', 'arctic', 'forest', 'graphite', 'coast', 'plum', 'matcha', 'ember', 'lavender'];
const THEME_STORAGE_KEY = 'tab-out-theme';
const THEME_LABEL_KEYS = {
  warm: 'themeWarm',
  midnight: 'themeMidnight',
  arctic: 'themeArctic',
  forest: 'themeForest',
  graphite: 'themeGraphite',
  coast: 'themeCoast',
  plum: 'themePlum',
  matcha: 'themeMatcha',
  ember: 'themeEmber',
  lavender: 'themeLavender',
};

function getActiveTheme() {
  const t = document.documentElement.dataset.theme;
  return THEMES.includes(t) ? t : 'warm';
}

function applyTheme(name, { save = false } = {}) {
  if (!THEMES.includes(name)) return;
  document.documentElement.dataset.theme = name;
  if (save) {
    try { localStorage.setItem(THEME_STORAGE_KEY, name); } catch {}
  }
  syncThemeControls();
}

function syncThemeControls() {
  const active = getActiveTheme();
  const label = tr(THEME_LABEL_KEYS[active] || 'themeWarm');

  document.querySelectorAll('.theme-option[data-theme-name]').forEach(btn => {
    const selected = btn.dataset.themeName === active;
    btn.setAttribute('aria-pressed', selected ? 'true' : 'false');
    btn.classList.toggle('active', selected);
    const text = btn.querySelector('.theme-option-label');
    const key = THEME_LABEL_KEYS[btn.dataset.themeName];
    if (text && key) text.textContent = tr(key);
    if (key) btn.setAttribute('title', tr(key));
  });

  const activeLabel = document.getElementById('activeThemeLabel');
  if (activeLabel) activeLabel.textContent = label;

  const activeSwatch = document.getElementById('activeThemeSwatch');
  if (activeSwatch) {
    activeSwatch.className = `theme-swatch theme-swatch-active theme-swatch-${active}`;
  }

  const currentBtn = document.getElementById('themeCurrentBtn');
  if (currentBtn) currentBtn.setAttribute('title', tr('themeCurrentTitle', { theme: label }));
}

function setThemeMenuOpen(open) {
  const picker = document.getElementById('themePicker');
  const button = document.getElementById('themeCurrentBtn');
  if (!picker || !button) return;
  picker.classList.toggle('theme-menu-open', open);
  button.setAttribute('aria-expanded', open ? 'true' : 'false');
}

function toggleThemeMenu() {
  const picker = document.getElementById('themePicker');
  setThemeMenuOpen(!picker?.classList.contains('theme-menu-open'));
}

function initThemeSwitcher() {
  applyTheme(getActiveTheme(), { save: false });
}


/* ----------------------------------------------------------------
   LANGUAGE SWITCHER + UI COPY

   Only fixed UI labels are translated. Tab titles, URLs, Chrome group
   names, and user-entered privacy text stay exactly as the user created
   them.
   ---------------------------------------------------------------- */
const LANGUAGES = ['en', 'zh'];
const LANGUAGE_STORAGE_KEY = 'tab-out-language';

const UI_COPY = {
  en: {
    documentTitle: 'Super Tab Out',
    languageLabel: 'Language',
    privacyToggleTitle: 'Toggle privacy mode (Esc)',
    themeLabel: 'Theme',
    themeWarm: 'Warm paper',
    themeMidnight: 'Midnight',
    themeArctic: 'Arctic frost',
    themeForest: 'Forest canopy',
    themeGraphite: 'Graphite gold',
    themeCoast: 'Coast coral',
    themePlum: 'Plum studio',
    themeMatcha: 'Matcha desk',
    themeEmber: 'Ember slate',
    themeLavender: 'Lavender mint',
    themeCurrentTitle: ({ theme }) => `Theme: ${theme}`,
    privacySearchPlaceholder: 'Search Google',
    privacyHint: 'Press <kbd>Esc</kbd> to show your tabs',
    privacySettingsTitle: 'Customize privacy screen',
    customize: 'Customize',
    clock: 'Clock',
    date: 'Date',
    customText: 'Custom text',
    mottoPlaceholder: 'Type your text here...',
    searchBox: 'Search box',
    closeExtras: 'Close extras',
    search: 'Search',
    savedForLater: 'Saved for later',
    deferredEmpty: 'Nothing saved. Living in the moment.',
    archive: 'Archive',
    archiveSearchPlaceholder: 'Search archived tabs...',
    openTabsStat: 'Open tabs',
    creditBy: 'by SivanZeroX',
    creditAttribution: 'Derived from <a href="https://github.com/zarazhangrui/tab-out" target="_top">Tab Out</a> by <a href="https://x.com/zarazhangrui" target="_top">Zara Zhang</a> under MIT.',
    greetingMorning: 'Good morning',
    greetingAfternoon: 'Good afternoon',
    greetingEvening: 'Good evening',
    openTabsTitle: 'Open tabs',
    homepages: 'Homepages',
    tabsLabel: 'tabs',
    viewGroups: 'Groups',
    viewDomains: 'Domains',
    viewModeLabel: 'View mode',
    notGrouped: 'Not grouped',
    unnamedGroup: '(unnamed)',
    saveForLater: 'Save for later',
    closeThisTab: 'Close this tab',
    dismiss: 'Dismiss',
    ungroup: 'Ungroup',
    noResults: 'No results',
    inboxZeroTitle: 'Inbox zero, but for tabs.',
    inboxZeroSubtitle: "You're free.",
    justNow: 'just now',
    yesterday: 'yesterday',
    tabOutDupeBanner: ({ count }) => `You have <strong id="tabOutDupeCount">${count}</strong> Super Tab Out tabs open. Keep just this one?`,
    tabsOpen: ({ count }) => `${count} tab${count !== 1 ? 's' : ''} open`,
    duplicates: ({ count }) => `${count} duplicate${count !== 1 ? 's' : ''}`,
    more: ({ count }) => `+${count} more`,
    closeAllTabs: ({ count }) => `Close all ${count} tab${count !== 1 ? 's' : ''}`,
    closeDuplicates: ({ count }) => `Close ${count} duplicate${count !== 1 ? 's' : ''}`,
    domainCount: ({ count }) => `${count} domain${count !== 1 ? 's' : ''}`,
    groupCount: ({ count }) => `${count} group${count !== 1 ? 's' : ''}`,
    ungroupedCount: ({ count }) => `${count} ungrouped`,
    itemCount: ({ count }) => `${count} item${count !== 1 ? 's' : ''}`,
    minAgo: ({ count }) => `${count} min ago`,
    hrAgo: ({ count }) => `${count} hr${count !== 1 ? 's' : ''} ago`,
    daysAgo: ({ count }) => `${count} days ago`,
    toastClosedExtraTabOut: 'Closed extra Super Tab Out tabs',
    toastTabClosed: 'Tab closed',
    toastSaveFailed: 'Failed to save tab',
    toastSavedForLater: 'Saved for later',
    toastClosedFromGroup: ({ count, label }) => `Closed ${count} tab${count !== 1 ? 's' : ''} from ${label}`,
    toastClosedDuplicates: 'Closed duplicates, kept one copy each',
    toastClosedChromeGroup: ({ count }) => `Closed ${count} tab${count !== 1 ? 's' : ''} from group`,
    toastUngrouped: ({ count }) => `Ungrouped ${count} tab${count !== 1 ? 's' : ''}`,
    toastAllTabsClosed: 'All tabs closed. Fresh start.',
  },
  zh: {
    documentTitle: 'Super Tab Out',
    languageLabel: '语言',
    privacyToggleTitle: '切换隐私模式（Esc）',
    themeLabel: '主题',
    themeWarm: '暖纸',
    themeMidnight: '午夜',
    themeArctic: '极地',
    themeForest: '森林',
    themeGraphite: '石墨金',
    themeCoast: '海岸珊瑚',
    themePlum: '李子工作室',
    themeMatcha: '抹茶书桌',
    themeEmber: '余烬石板',
    themeLavender: '薰衣草薄荷',
    themeCurrentTitle: ({ theme }) => `主题：${theme}`,
    privacySearchPlaceholder: '搜索 Google',
    privacyHint: '按 <kbd>Esc</kbd> 显示标签页',
    privacySettingsTitle: '自定义隐私屏幕',
    customize: '自定义',
    clock: '时钟',
    date: '日期',
    customText: '自定义文字',
    mottoPlaceholder: '输入你的文字...',
    searchBox: '搜索框',
    closeExtras: '关闭多余项',
    search: '搜索',
    savedForLater: '稍后再看',
    deferredEmpty: '没有保存内容。活在当下。',
    archive: '归档',
    archiveSearchPlaceholder: '搜索已归档标签...',
    openTabsStat: '打开的标签页',
    creditBy: '作者 SivanZeroX',
    creditAttribution: '基于 <a href="https://github.com/zarazhangrui/tab-out" target="_top">Tab Out</a>（<a href="https://x.com/zarazhangrui" target="_top">Zara Zhang</a>）二次开发，遵循 MIT 许可。',
    greetingMorning: '早上好',
    greetingAfternoon: '下午好',
    greetingEvening: '晚上好',
    openTabsTitle: '打开的标签页',
    homepages: '首页',
    tabsLabel: '标签页',
    viewGroups: '分组',
    viewDomains: '域名',
    viewModeLabel: '视图模式',
    notGrouped: '未分组',
    unnamedGroup: '（未命名）',
    saveForLater: '稍后再看',
    closeThisTab: '关闭这个标签页',
    dismiss: '移除',
    ungroup: '取消分组',
    noResults: '没有结果',
    inboxZeroTitle: '标签页清空了。',
    inboxZeroSubtitle: '现在很清爽。',
    justNow: '刚刚',
    yesterday: '昨天',
    tabOutDupeBanner: ({ count }) => `你打开了 <strong id="tabOutDupeCount">${count}</strong> 个 Super Tab Out 标签页。只保留当前这个吗？`,
    tabsOpen: ({ count }) => `已打开 ${count} 个标签页`,
    duplicates: ({ count }) => `重复 ${count} 个`,
    more: ({ count }) => `还有 ${count} 个`,
    closeAllTabs: ({ count }) => `关闭 ${count} 个标签页`,
    closeDuplicates: ({ count }) => `关闭 ${count} 个重复项`,
    domainCount: ({ count }) => `${count} 个域名`,
    groupCount: ({ count }) => `${count} 个分组`,
    ungroupedCount: ({ count }) => `${count} 个未分组`,
    itemCount: ({ count }) => `${count} 项`,
    minAgo: ({ count }) => `${count} 分钟前`,
    hrAgo: ({ count }) => `${count} 小时前`,
    daysAgo: ({ count }) => `${count} 天前`,
    toastClosedExtraTabOut: '已关闭多余的 Super Tab Out 标签页',
    toastTabClosed: '标签页已关闭',
    toastSaveFailed: '保存失败',
    toastSavedForLater: '已加入稍后再看',
    toastClosedFromGroup: ({ count, label }) => `已从 ${label} 关闭 ${count} 个标签页`,
    toastClosedDuplicates: '已关闭重复项，并保留一份',
    toastClosedChromeGroup: ({ count }) => `已从分组关闭 ${count} 个标签页`,
    toastUngrouped: ({ count }) => `已取消 ${count} 个标签页的分组`,
    toastAllTabsClosed: '所有标签页已关闭。重新开始。',
  },
};

let activeLanguage = getStoredLanguage();

function getStoredLanguage() {
  try {
    const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (LANGUAGES.includes(stored)) return stored;
  } catch {}
  const preset = document.documentElement.dataset.lang;
  return LANGUAGES.includes(preset) ? preset : 'en';
}

function tr(key, params = {}) {
  const value = (UI_COPY[activeLanguage] && UI_COPY[activeLanguage][key]) || UI_COPY.en[key] || key;
  return typeof value === 'function' ? value(params) : value;
}

function applyStaticTranslations() {
  document.documentElement.lang = activeLanguage === 'zh' ? 'zh-CN' : 'en';
  document.documentElement.dataset.lang = activeLanguage;
  document.title = tr('documentTitle');

  document.querySelectorAll('[data-i18n]').forEach(el => {
    el.textContent = tr(el.dataset.i18n);
  });
  document.querySelectorAll('[data-i18n-html]').forEach(el => {
    el.innerHTML = tr(el.dataset.i18nHtml);
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    el.setAttribute('placeholder', tr(el.dataset.i18nPlaceholder));
  });
  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    el.setAttribute('title', tr(el.dataset.i18nTitle));
  });

  const languageSwitcher = document.getElementById('languageSwitcher');
  if (languageSwitcher) languageSwitcher.setAttribute('aria-label', tr('languageLabel'));
  const themeMenu = document.getElementById('themeMenu');
  if (themeMenu) themeMenu.setAttribute('aria-label', tr('themeLabel'));

  const privacyToggle = document.getElementById('privacyToggle');
  if (privacyToggle) privacyToggle.setAttribute('title', tr('privacyToggleTitle'));

  syncThemeControls();

  document.querySelectorAll('.language-btn[data-language]').forEach(btn => {
    const selected = btn.dataset.language === activeLanguage;
    btn.setAttribute('aria-pressed', selected ? 'true' : 'false');
    btn.classList.toggle('active', selected);
  });

  checkTabOutDupes();
}

function setLanguage(lang, { save = false, rerender = false } = {}) {
  if (!LANGUAGES.includes(lang)) return;
  activeLanguage = lang;
  if (save) {
    try { localStorage.setItem(LANGUAGE_STORAGE_KEY, lang); } catch {}
  }
  applyStaticTranslations();
  updatePrivacyClock();
  if (rerender) renderDashboard();
}

function initLanguageSwitcher() {
  setLanguage(activeLanguage, { save: false, rerender: false });
}


/* ----------------------------------------------------------------
   SAVED FOR LATER — chrome.storage.local

   Replaces the old server-side SQLite + REST API with Chrome's
   built-in key-value storage. Data persists across browser sessions
   and doesn't require a running server.

   Data shape stored under the "deferred" key:
   [
     {
       id: "1712345678901",          // timestamp-based unique ID
       url: "https://example.com",
       title: "Example Page",
       savedAt: "2026-04-04T10:00:00.000Z",  // ISO date string
       completed: false,             // true = checked off (archived)
       dismissed: false              // true = dismissed without reading
     },
     ...
   ]
   ---------------------------------------------------------------- */

/**
 * saveTabForLater(tab)
 *
 * Saves a single tab to the "Saved for Later" list in chrome.storage.local.
 * @param {{ url: string, title: string }} tab
 */
async function saveTabForLater(tab) {
  const { deferred = [] } = await chrome.storage.local.get('deferred');
  deferred.push({
    id:        Date.now().toString(),
    url:       tab.url,
    title:     tab.title,
    savedAt:   new Date().toISOString(),
    completed: false,
    dismissed: false,
  });
  await chrome.storage.local.set({ deferred });
}

/**
 * getSavedTabs()
 *
 * Returns all saved tabs from chrome.storage.local.
 * Filters out dismissed items (those are gone for good).
 * Splits into active (not completed) and archived (completed).
 */
async function getSavedTabs() {
  const { deferred = [] } = await chrome.storage.local.get('deferred');
  const visible = deferred.filter(t => !t.dismissed);
  return {
    active:   visible.filter(t => !t.completed),
    archived: visible.filter(t => t.completed),
  };
}

/**
 * checkOffSavedTab(id)
 *
 * Marks a saved tab as completed (checked off). It moves to the archive.
 */
async function checkOffSavedTab(id) {
  const { deferred = [] } = await chrome.storage.local.get('deferred');
  const tab = deferred.find(t => t.id === id);
  if (tab) {
    tab.completed = true;
    tab.completedAt = new Date().toISOString();
    await chrome.storage.local.set({ deferred });
  }
}

/**
 * dismissSavedTab(id)
 *
 * Marks a saved tab as dismissed (removed from all lists).
 */
async function dismissSavedTab(id) {
  const { deferred = [] } = await chrome.storage.local.get('deferred');
  const tab = deferred.find(t => t.id === id);
  if (tab) {
    tab.dismissed = true;
    await chrome.storage.local.set({ deferred });
  }
}


/* ----------------------------------------------------------------
   UI HELPERS
   ---------------------------------------------------------------- */

/**
 * playCloseSound()
 *
 * Plays a clean "swoosh" sound when tabs are closed.
 * Built entirely with the Web Audio API — no sound files needed.
 * A filtered noise sweep that descends in pitch, like air moving.
 */
function playCloseSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const t = ctx.currentTime;

    // Swoosh: shaped white noise through a sweeping bandpass filter
    const duration = 0.25;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * duration, ctx.sampleRate);
    const data = buffer.getChannelData(0);

    // Generate noise with a natural envelope (quick attack, smooth decay)
    for (let i = 0; i < data.length; i++) {
      const pos = i / data.length;
      // Envelope: ramps up fast in first 10%, then fades out smoothly
      const env = pos < 0.1 ? pos / 0.1 : Math.pow(1 - (pos - 0.1) / 0.9, 1.5);
      data[i] = (Math.random() * 2 - 1) * env;
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;

    // Bandpass filter sweeps from high to low — creates the "swoosh" character
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 2.0;
    filter.frequency.setValueAtTime(4000, t);
    filter.frequency.exponentialRampToValueAtTime(400, t + duration);

    // Volume
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.15, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);

    source.connect(filter).connect(gain).connect(ctx.destination);
    source.start(t);

    setTimeout(() => ctx.close(), 500);
  } catch {
    // Audio not supported — fail silently
  }
}

/**
 * shootConfetti(x, y)
 *
 * Shoots a burst of colorful confetti particles from the given screen
 * coordinates (typically the center of a card being closed).
 * Pure CSS + JS, no libraries.
 */
function shootConfetti(x, y) {
  const colors = [
    '#c8713a', // amber
    '#e8a070', // amber light
    '#5a7a62', // sage
    '#8aaa92', // sage light
    '#5a6b7a', // slate
    '#8a9baa', // slate light
    '#d4b896', // warm paper
    '#b35a5a', // rose
  ];

  const particleCount = 17;

  for (let i = 0; i < particleCount; i++) {
    const el = document.createElement('div');

    const isCircle = Math.random() > 0.5;
    const size = 5 + Math.random() * 6; // 5–11px
    const color = colors[Math.floor(Math.random() * colors.length)];

    el.style.cssText = `
      position: fixed;
      left: ${x}px;
      top: ${y}px;
      width: ${size}px;
      height: ${size}px;
      background: ${color};
      border-radius: ${isCircle ? '50%' : '2px'};
      pointer-events: none;
      z-index: 9999;
      transform: translate(-50%, -50%);
      opacity: 1;
    `;
    document.body.appendChild(el);

    // Physics: random angle and speed for the outward burst
    const angle   = Math.random() * Math.PI * 2;
    const speed   = 60 + Math.random() * 120;
    const vx      = Math.cos(angle) * speed;
    const vy      = Math.sin(angle) * speed - 80; // bias upward
    const gravity = 200;

    const startTime = performance.now();
    const duration  = 700 + Math.random() * 200; // 700–900ms

    function frame(now) {
      const elapsed  = (now - startTime) / 1000;
      const progress = elapsed / (duration / 1000);

      if (progress >= 1) { el.remove(); return; }

      const px = vx * elapsed;
      const py = vy * elapsed + 0.5 * gravity * elapsed * elapsed;
      const opacity = progress < 0.5 ? 1 : 1 - (progress - 0.5) * 2;
      const rotate  = elapsed * 200 * (isCircle ? 0 : 1);

      el.style.transform = `translate(calc(-50% + ${px}px), calc(-50% + ${py}px)) rotate(${rotate}deg)`;
      el.style.opacity = opacity;

      requestAnimationFrame(frame);
    }

    requestAnimationFrame(frame);
  }
}

/**
 * animateCardOut(card)
 *
 * Smoothly removes a mission card: fade + scale down, then confetti.
 * After the animation, checks if the grid is now empty.
 */
function animateCardOut(card) {
  if (!card) return;

  const rect = card.getBoundingClientRect();
  shootConfetti(rect.left + rect.width / 2, rect.top + rect.height / 2);

  card.classList.add('closing');
  setTimeout(() => {
    card.remove();
    checkAndShowEmptyState();
  }, 300);
}

/**
 * showToast(message)
 *
 * Brief pop-up notification at the bottom of the screen.
 */
function showToast(message) {
  const toast = document.getElementById('toast');
  document.getElementById('toastText').textContent = message;
  toast.classList.add('visible');
  setTimeout(() => toast.classList.remove('visible'), 2500);
}

/**
 * checkAndShowEmptyState()
 *
 * Shows a cheerful "Inbox zero" message when all domain cards are gone.
 */
function checkAndShowEmptyState() {
  const missionsEl = document.getElementById('openTabsMissions');
  if (!missionsEl) return;

  const remaining = missionsEl.querySelectorAll('.mission-card:not(.closing)').length;
  if (remaining > 0) return;

  missionsEl.innerHTML = `
    <div class="missions-empty-state">
      <div class="empty-checkmark">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5" />
        </svg>
      </div>
      <div class="empty-title">${escapeHtml(tr('inboxZeroTitle'))}</div>
      <div class="empty-subtitle">${escapeHtml(tr('inboxZeroSubtitle'))}</div>
    </div>
  `;

  const countEl = document.getElementById('openTabsSectionCount');
  if (countEl) countEl.textContent = tr('domainCount', { count: 0 });
}

/**
 * timeAgo(dateStr)
 *
 * Converts an ISO date string into a human-friendly relative time.
 * "2026-04-04T10:00:00Z" → "2 hrs ago" or "yesterday"
 */
function timeAgo(dateStr) {
  if (!dateStr) return '';
  const then = new Date(dateStr);
  const now  = new Date();
  const diffMins  = Math.floor((now - then) / 60000);
  const diffHours = Math.floor((now - then) / 3600000);
  const diffDays  = Math.floor((now - then) / 86400000);

  if (diffMins < 1)   return tr('justNow');
  if (diffMins < 60)  return tr('minAgo', { count: diffMins });
  if (diffHours < 24) return tr('hrAgo', { count: diffHours });
  if (diffDays === 1) return tr('yesterday');
  return tr('daysAgo', { count: diffDays });
}

/**
 * getGreeting() — "Good morning / afternoon / evening"
 */
function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return tr('greetingMorning');
  if (hour < 17) return tr('greetingAfternoon');
  return tr('greetingEvening');
}

/**
 * getDateDisplay() — "Friday, April 4, 2026"
 */
function getDateDisplay() {
  return new Date().toLocaleDateString(activeLanguage === 'zh' ? 'zh-CN' : 'en-US', {
    weekday: 'long',
    year:    'numeric',
    month:   'long',
    day:     'numeric',
  });
}


/* ----------------------------------------------------------------
   HTML ESCAPE — prevents XSS when tab titles/URLs are injected into
   innerHTML. Tab titles come from arbitrary web pages, so they must
   be treated as untrusted input.
   ---------------------------------------------------------------- */
function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Only allow http/https/file as href targets, so a saved tab with a
// javascript: URL can't execute script when clicked.
function isSafeNavUrl(url) {
  if (!url) return false;
  try {
    const scheme = new URL(url).protocol;
    return scheme === 'http:' || scheme === 'https:' || scheme === 'file:';
  } catch {
    return false;
  }
}


/* ----------------------------------------------------------------
   FAVICON URL + LOCAL CACHE

   We ask DuckDuckGo for favicons (no ad-targeting identity surface,
   unlike Google's s2/favicons endpoint). To avoid hitting DDG on every
   new-tab open for the same hosts, successful loads are snapshotted to
   localStorage as 16×16 PNG data URLs and reused for 7 days.

   localStorage fits the shape: synchronous read from <head>/render time,
   ~1–2 KB per entry, ~5 MB quota = thousands of domains easily. chrome.
   storage.local is async and would reintroduce render jank here.

   The snapshot happens in a delegated `load` listener (capture phase, in
   app.js's INIT block), not an inline `onload=` — MV3's default CSP
   forbids inline event handlers.
   ---------------------------------------------------------------- */
const FAVICON_CACHE_PREFIX = 'favicon:';
const FAVICON_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function readCachedFavicon(domain) {
  if (!domain) return null;
  try {
    const raw = localStorage.getItem(FAVICON_CACHE_PREFIX + domain);
    if (!raw) return null;
    const entry = JSON.parse(raw);
    if (!entry || !entry.data || !entry.ts) return null;
    if (Date.now() - entry.ts > FAVICON_CACHE_TTL_MS) {
      localStorage.removeItem(FAVICON_CACHE_PREFIX + domain);
      return null;
    }
    return entry.data;
  } catch {
    return null;
  }
}

function faviconUrlFor(domain) {
  if (!domain) return '';
  const cached = readCachedFavicon(domain);
  if (cached) return cached;
  return `https://icons.duckduckgo.com/ip3/${encodeURIComponent(domain)}.ico`;
}

// Snapshot a freshly-loaded favicon <img> into localStorage. Needs the
// image to be CORS-clean (data URL or anonymous cross-origin), which is
// why the rendered <img> tag carries crossorigin="anonymous". If the
// canvas gets tainted we silently give up — next render just refetches.
function cacheFaviconFromImg(domain, img) {
  if (!domain || !img || !img.naturalWidth) return;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 16;
    canvas.height = 16;
    canvas.getContext('2d').drawImage(img, 0, 0, 16, 16);
    const dataUrl = canvas.toDataURL('image/png');
    localStorage.setItem(
      FAVICON_CACHE_PREFIX + domain,
      JSON.stringify({ data: dataUrl, ts: Date.now() })
    );
  } catch { /* tainted canvas or quota — ignore */ }
}

function cleanExpiredFavicons() {
  try {
    const now = Date.now();
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(FAVICON_CACHE_PREFIX)) continue;
      try {
        const entry = JSON.parse(localStorage.getItem(key) || 'null');
        if (!entry || !entry.ts || now - entry.ts > FAVICON_CACHE_TTL_MS) {
          localStorage.removeItem(key);
        }
      } catch { localStorage.removeItem(key); }
    }
  } catch {}
}


/* ----------------------------------------------------------------
   DOMAIN & TITLE CLEANUP HELPERS
   ---------------------------------------------------------------- */

// Map of known hostnames → friendly display names.
const FRIENDLY_DOMAINS = {
  'github.com':           'GitHub',
  'www.github.com':       'GitHub',
  'gist.github.com':      'GitHub Gist',
  'youtube.com':          'YouTube',
  'www.youtube.com':      'YouTube',
  'music.youtube.com':    'YouTube Music',
  'x.com':                'X',
  'www.x.com':            'X',
  'twitter.com':          'X',
  'www.twitter.com':      'X',
  'reddit.com':           'Reddit',
  'www.reddit.com':       'Reddit',
  'old.reddit.com':       'Reddit',
  'substack.com':         'Substack',
  'www.substack.com':     'Substack',
  'medium.com':           'Medium',
  'www.medium.com':       'Medium',
  'linkedin.com':         'LinkedIn',
  'www.linkedin.com':     'LinkedIn',
  'stackoverflow.com':    'Stack Overflow',
  'www.stackoverflow.com':'Stack Overflow',
  'news.ycombinator.com': 'Hacker News',
  'google.com':           'Google',
  'www.google.com':       'Google',
  'mail.google.com':      'Gmail',
  'docs.google.com':      'Google Docs',
  'drive.google.com':     'Google Drive',
  'calendar.google.com':  'Google Calendar',
  'meet.google.com':      'Google Meet',
  'gemini.google.com':    'Gemini',
  'chatgpt.com':          'ChatGPT',
  'www.chatgpt.com':      'ChatGPT',
  'chat.openai.com':      'ChatGPT',
  'claude.ai':            'Claude',
  'www.claude.ai':        'Claude',
  'code.claude.com':      'Claude Code',
  'notion.so':            'Notion',
  'www.notion.so':        'Notion',
  'figma.com':            'Figma',
  'www.figma.com':        'Figma',
  'slack.com':            'Slack',
  'app.slack.com':        'Slack',
  'discord.com':          'Discord',
  'www.discord.com':      'Discord',
  'wikipedia.org':        'Wikipedia',
  'en.wikipedia.org':     'Wikipedia',
  'amazon.com':           'Amazon',
  'www.amazon.com':       'Amazon',
  'netflix.com':          'Netflix',
  'www.netflix.com':      'Netflix',
  'spotify.com':          'Spotify',
  'open.spotify.com':     'Spotify',
  'vercel.com':           'Vercel',
  'www.vercel.com':       'Vercel',
  'npmjs.com':            'npm',
  'www.npmjs.com':        'npm',
  'developer.mozilla.org':'MDN',
  'arxiv.org':            'arXiv',
  'www.arxiv.org':        'arXiv',
  'huggingface.co':       'Hugging Face',
  'www.huggingface.co':   'Hugging Face',
  'producthunt.com':      'Product Hunt',
  'www.producthunt.com':  'Product Hunt',
  'xiaohongshu.com':      'RedNote',
  'www.xiaohongshu.com':  'RedNote',
  'local-files':          'Local Files',
};

function friendlyDomain(hostname) {
  if (!hostname) return '';
  if (FRIENDLY_DOMAINS[hostname]) return FRIENDLY_DOMAINS[hostname];

  if (hostname.endsWith('.substack.com') && hostname !== 'substack.com') {
    return capitalize(hostname.replace('.substack.com', '')) + "'s Substack";
  }
  if (hostname.endsWith('.github.io')) {
    return capitalize(hostname.replace('.github.io', '')) + ' (GitHub Pages)';
  }

  let clean = hostname
    .replace(/^www\./, '')
    .replace(/\.(com|org|net|io|co|ai|dev|app|so|me|xyz|info|us|uk|co\.uk|co\.jp)$/, '');

  return clean.split('.').map(part => capitalize(part)).join(' ');
}

function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function stripTitleNoise(title) {
  if (!title) return '';
  // Strip leading notification count: "(2) Title"
  title = title.replace(/^\(\d+\+?\)\s*/, '');
  // Strip inline counts like "Inbox (16,359)"
  title = title.replace(/\s*\([\d,]+\+?\)\s*/g, ' ');
  // Strip email addresses (privacy + cleaner display)
  title = title.replace(/\s*[\-\u2010-\u2015]\s*[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g, '');
  title = title.replace(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g, '');
  // Clean X/Twitter format
  title = title.replace(/\s+on X:\s*/, ': ');
  title = title.replace(/\s*\/\s*X\s*$/, '');
  return title.trim();
}

function cleanTitle(title, hostname) {
  if (!title || !hostname) return title || '';

  const friendly = friendlyDomain(hostname);
  const domain   = hostname.replace(/^www\./, '');
  const seps     = [' - ', ' | ', ' — ', ' · ', ' – '];

  for (const sep of seps) {
    const idx = title.lastIndexOf(sep);
    if (idx === -1) continue;
    const suffix     = title.slice(idx + sep.length).trim();
    const suffixLow  = suffix.toLowerCase();
    if (
      suffixLow === domain.toLowerCase() ||
      suffixLow === friendly.toLowerCase() ||
      suffixLow === domain.replace(/\.\w+$/, '').toLowerCase() ||
      domain.toLowerCase().includes(suffixLow) ||
      friendly.toLowerCase().includes(suffixLow)
    ) {
      const cleaned = title.slice(0, idx).trim();
      if (cleaned.length >= 5) return cleaned;
    }
  }
  return title;
}

function smartTitle(title, url) {
  if (!url) return title || '';
  let pathname = '', hostname = '';
  try { const u = new URL(url); pathname = u.pathname; hostname = u.hostname; }
  catch { return title || ''; }

  const titleIsUrl = !title || title === url || title.startsWith(hostname) || title.startsWith('http');

  if ((hostname === 'x.com' || hostname === 'twitter.com' || hostname === 'www.x.com') && pathname.includes('/status/')) {
    const username = pathname.split('/')[1];
    if (username) return titleIsUrl ? `Post by @${username}` : title;
  }

  if (hostname === 'github.com' || hostname === 'www.github.com') {
    const parts = pathname.split('/').filter(Boolean);
    if (parts.length >= 2) {
      const [owner, repo, ...rest] = parts;
      if (rest[0] === 'issues' && rest[1]) return `${owner}/${repo} Issue #${rest[1]}`;
      if (rest[0] === 'pull'   && rest[1]) return `${owner}/${repo} PR #${rest[1]}`;
      if (rest[0] === 'blob' || rest[0] === 'tree') return `${owner}/${repo} — ${rest.slice(2).join('/')}`;
      if (titleIsUrl) return `${owner}/${repo}`;
    }
  }

  if ((hostname === 'www.youtube.com' || hostname === 'youtube.com') && pathname === '/watch') {
    if (titleIsUrl) return 'YouTube Video';
  }

  if ((hostname === 'www.reddit.com' || hostname === 'reddit.com' || hostname === 'old.reddit.com') && pathname.includes('/comments/')) {
    const parts  = pathname.split('/').filter(Boolean);
    const subIdx = parts.indexOf('r');
    if (subIdx !== -1 && parts[subIdx + 1]) {
      if (titleIsUrl) return `r/${parts[subIdx + 1]} post`;
    }
  }

  return title || url;
}


/* ----------------------------------------------------------------
   SVG ICON STRINGS
   ---------------------------------------------------------------- */
const ICONS = {
  tabs:    `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M3 8.25V18a2.25 2.25 0 0 0 2.25 2.25h13.5A2.25 2.25 0 0 0 21 18V8.25m-18 0V6a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 6v2.25m-18 0h18" /></svg>`,
  close:   `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>`,
  archive: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 0 1-2.247 2.118H6.622a2.25 2.25 0 0 1-2.247-2.118L3.75 7.5m6 4.125l2.25 2.25m0 0l2.25 2.25M12 13.875l2.25-2.25M12 13.875l-2.25 2.25M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z" /></svg>`,
  focus:   `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="m4.5 19.5 15-15m0 0H8.25m11.25 0v11.25" /></svg>`,
};


/* ----------------------------------------------------------------
   IN-MEMORY STORE FOR OPEN-TAB GROUPS
   ---------------------------------------------------------------- */
let domainGroups = [];


/* ----------------------------------------------------------------
   HELPER: filter out browser-internal pages
   ---------------------------------------------------------------- */

/**
 * getRealTabs()
 *
 * Returns tabs that are real web pages — no chrome://, extension
 * pages, about:blank, etc.
 */
function getRealTabs() {
  return openTabs.filter(t => {
    if (t.pinned) return false; // pinned tabs are sacred — keep them out of groups/stats
    const url = t.url || '';
    return (
      !url.startsWith('chrome://') &&
      !url.startsWith('chrome-extension://') &&
      !url.startsWith('about:') &&
      !url.startsWith('edge://') &&
      !url.startsWith('brave://')
    );
  });
}

/**
 * checkTabOutDupes()
 *
 * Counts how many Tab Out pages are open. If more than 1,
 * shows a banner offering to close the extras.
 */
function checkTabOutDupes() {
  const tabOutTabs = openTabs.filter(t => t.isTabOut);
  const banner  = document.getElementById('tabOutDupeBanner');
  const textEl  = document.getElementById('tabOutDupeText');
  const countEl = document.getElementById('tabOutDupeCount');
  if (!banner) return;

  if (tabOutTabs.length > 1) {
    if (textEl) {
      textEl.innerHTML = tr('tabOutDupeBanner', { count: tabOutTabs.length });
    } else if (countEl) {
      countEl.textContent = tabOutTabs.length;
    }
    banner.style.display = 'flex';
  } else {
    banner.style.display = 'none';
  }
}


/* ----------------------------------------------------------------
   OVERFLOW CHIPS ("+N more" expand button in domain cards)
   ---------------------------------------------------------------- */

function buildOverflowChips(hiddenTabs, urlCounts = {}) {
  const hiddenChips = hiddenTabs.map(tab => {
    const label    = cleanTitle(smartTitle(stripTitleNoise(tab.title || ''), tab.url), '');
    const count    = urlCounts[tab.url] || 1;
    const dupeTag  = count > 1 ? ` <span class="chip-dupe-badge">(${count}x)</span>` : '';
    const chipClass = count > 1 ? ' chip-has-dupes' : '';
    const safeUrl   = escapeHtml(tab.url || '');
    const safeTitle = escapeHtml(label);
    let domain = '';
    try { domain = new URL(tab.url).hostname; } catch {}
    const faviconUrl = faviconUrlFor(domain);
    return `<div class="page-chip clickable${chipClass}" data-action="focus-tab" data-tab-url="${safeUrl}" title="${safeTitle}">
      ${faviconUrl ? `<img class="chip-favicon" src="${escapeHtml(faviconUrl)}" alt="" crossorigin="anonymous" data-favicon-domain="${escapeHtml(domain)}">` : ''}
      <span class="chip-text">${escapeHtml(label)}</span>${dupeTag}
      <div class="chip-actions">
        <button class="chip-action chip-save" data-action="defer-single-tab" data-tab-url="${safeUrl}" data-tab-title="${safeTitle}" title="${escapeHtml(tr('saveForLater'))}">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0 1 11.186 0Z" /></svg>
        </button>
        <button class="chip-action chip-close" data-action="close-single-tab" data-tab-url="${safeUrl}" title="${escapeHtml(tr('closeThisTab'))}">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
        </button>
      </div>
    </div>`;
  }).join('');

  return `
    <div class="page-chips-overflow" style="display:none">${hiddenChips}</div>
    <div class="page-chip page-chip-overflow clickable" data-action="expand-chips">
      <span class="chip-text">${escapeHtml(tr('more', { count: hiddenTabs.length }))}</span>
    </div>`;
}


/* ----------------------------------------------------------------
   DOMAIN CARD RENDERER
   ---------------------------------------------------------------- */

/**
 * renderDomainCard(group, groupIndex)
 *
 * Builds the HTML for one domain group card.
 * group = { domain: string, tabs: [{ url, title, id, windowId, active }] }
 */
function renderDomainCard(group) {
  const tabs      = group.tabs || [];
  const tabCount  = tabs.length;
  const isLanding = group.domain === '__landing-pages__';
  const stableId  = 'domain-' + group.domain.replace(/[^a-z0-9]/g, '-');
  const safeDomainKey = escapeHtml(group.domain);
  const displayName = isLanding ? tr('homepages') : (group.label || friendlyDomain(group.domain));

  // Count duplicates (exact URL match)
  const urlCounts = {};
  for (const tab of tabs) urlCounts[tab.url] = (urlCounts[tab.url] || 0) + 1;
  const dupeUrls   = Object.entries(urlCounts).filter(([, c]) => c > 1);
  const hasDupes   = dupeUrls.length > 0;
  const totalExtras = dupeUrls.reduce((s, [, c]) => s + c - 1, 0);

  const tabBadge = `<span class="open-tabs-badge">
    ${ICONS.tabs}
    ${escapeHtml(tr('tabsOpen', { count: tabCount }))}
  </span>`;

  const dupeBadge = hasDupes
    ? `<span class="open-tabs-badge dupe-count-badge" style="color:var(--accent-amber);background:rgba(200,113,58,0.08);">
        ${escapeHtml(tr('duplicates', { count: totalExtras }))}
      </span>`
    : '';

  // Deduplicate for display: show each URL once, with (Nx) badge if duped
  const seen = new Set();
  const uniqueTabs = [];
  for (const tab of tabs) {
    if (!seen.has(tab.url)) { seen.add(tab.url); uniqueTabs.push(tab); }
  }

  const visibleTabs = uniqueTabs.slice(0, 8);
  const extraCount  = uniqueTabs.length - visibleTabs.length;

  const pageChips = visibleTabs.map(tab => {
    let label = cleanTitle(smartTitle(stripTitleNoise(tab.title || ''), tab.url), group.domain);
    // For localhost tabs, prepend port number so you can tell projects apart
    try {
      const parsed = new URL(tab.url);
      if (parsed.hostname === 'localhost' && parsed.port) label = `${parsed.port} ${label}`;
    } catch {}
    const count    = urlCounts[tab.url];
    const dupeTag  = count > 1 ? ` <span class="chip-dupe-badge">(${count}x)</span>` : '';
    const chipClass = count > 1 ? ' chip-has-dupes' : '';
    const safeUrl   = escapeHtml(tab.url || '');
    const safeTitle = escapeHtml(label);
    let domain = '';
    try { domain = new URL(tab.url).hostname; } catch {}
    const faviconUrl = faviconUrlFor(domain);
    return `<div class="page-chip clickable${chipClass}" data-action="focus-tab" data-tab-url="${safeUrl}" title="${safeTitle}">
      ${faviconUrl ? `<img class="chip-favicon" src="${escapeHtml(faviconUrl)}" alt="" crossorigin="anonymous" data-favicon-domain="${escapeHtml(domain)}">` : ''}
      <span class="chip-text">${escapeHtml(label)}</span>${dupeTag}
      <div class="chip-actions">
        <button class="chip-action chip-save" data-action="defer-single-tab" data-tab-url="${safeUrl}" data-tab-title="${safeTitle}" title="${escapeHtml(tr('saveForLater'))}">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0 1 11.186 0Z" /></svg>
        </button>
        <button class="chip-action chip-close" data-action="close-single-tab" data-tab-url="${safeUrl}" title="${escapeHtml(tr('closeThisTab'))}">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
        </button>
      </div>
    </div>`;
  }).join('') + (extraCount > 0 ? buildOverflowChips(uniqueTabs.slice(8), urlCounts) : '');

  let actionsHtml = `
    <button class="action-btn close-tabs" data-action="close-domain-tabs" data-domain-key="${safeDomainKey}">
      ${ICONS.close}
      ${escapeHtml(tr('closeAllTabs', { count: tabCount }))}
    </button>`;

  if (hasDupes) {
    const dupeUrlsEncoded = dupeUrls.map(([url]) => encodeURIComponent(url)).join(',');
    actionsHtml += `
      <button class="action-btn" data-action="dedup-keep-one" data-dupe-urls="${dupeUrlsEncoded}">
        ${escapeHtml(tr('closeDuplicates', { count: totalExtras }))}
      </button>`;
  }

  return `
    <div class="mission-card domain-card ${hasDupes ? 'has-amber-bar' : 'has-neutral-bar'}" data-domain-id="${stableId}">
      <div class="status-bar"></div>
      <div class="mission-content">
        <div class="mission-top">
          <span class="mission-name">${escapeHtml(displayName)}</span>
          ${tabBadge}
          ${dupeBadge}
        </div>
        <div class="mission-pages">${pageChips}</div>
        <div class="actions">${actionsHtml}</div>
      </div>
      <div class="mission-meta">
        <div class="mission-page-count">${tabCount}</div>
        <div class="mission-page-label">${escapeHtml(tr('tabsLabel'))}</div>
      </div>
    </div>`;
}


/* ----------------------------------------------------------------
   SAVED FOR LATER — Render Checklist Column
   ---------------------------------------------------------------- */

/**
 * renderDeferredColumn()
 *
 * Reads saved tabs from chrome.storage.local and renders the right-side
 * "Saved for Later" checklist column. Shows active items as a checklist
 * and completed items in a collapsible archive.
 */
async function renderDeferredColumn() {
  const column         = document.getElementById('deferredColumn');
  const list           = document.getElementById('deferredList');
  const empty          = document.getElementById('deferredEmpty');
  const countEl        = document.getElementById('deferredCount');
  const archiveEl      = document.getElementById('deferredArchive');
  const archiveCountEl = document.getElementById('archiveCount');
  const archiveList    = document.getElementById('archiveList');

  if (!column) return;

  try {
    const { active, archived } = await getSavedTabs();

    // Hide the entire column if there's nothing to show
    if (active.length === 0 && archived.length === 0) {
      column.style.display = 'none';
      return;
    }

    column.style.display = 'block';

    // Render active checklist items
    if (active.length > 0) {
      countEl.textContent = tr('itemCount', { count: active.length });
      list.innerHTML = active.map(item => renderDeferredItem(item)).join('');
      list.style.display = 'block';
      empty.style.display = 'none';
    } else {
      list.style.display = 'none';
      countEl.textContent = '';
      empty.style.display = 'block';
    }

    // Render archive section
    if (archived.length > 0) {
      archiveCountEl.textContent = `(${archived.length})`;
      archiveList.innerHTML = archived.map(item => renderArchiveItem(item)).join('');
      archiveEl.style.display = 'block';
    } else {
      archiveEl.style.display = 'none';
    }

  } catch (err) {
    console.warn('[tab-out] Could not load saved tabs:', err);
    column.style.display = 'none';
  }
}

/**
 * renderDeferredItem(item)
 *
 * Builds HTML for one active checklist item: checkbox, title link,
 * domain, time ago, dismiss button.
 */
function renderDeferredItem(item) {
  let domain = '';
  try { domain = new URL(item.url).hostname.replace(/^www\./, ''); } catch {}
  const faviconUrl = faviconUrlFor(domain);
  const ago = timeAgo(item.savedAt);
  const safeId    = escapeHtml(item.id);
  const safeUrl   = escapeHtml(isSafeNavUrl(item.url) ? item.url : '#');
  const safeTitle = escapeHtml(item.title || item.url || '');

  return `
    <div class="deferred-item" data-deferred-id="${safeId}">
      <input type="checkbox" class="deferred-checkbox" data-action="check-deferred" data-deferred-id="${safeId}">
      <div class="deferred-info">
        <a href="${safeUrl}" target="_blank" rel="noopener noreferrer" class="deferred-title" title="${safeTitle}">
          ${faviconUrl ? `<img src="${escapeHtml(faviconUrl)}" alt="" style="width:14px;height:14px;vertical-align:-2px;margin-right:4px" crossorigin="anonymous" data-favicon-domain="${escapeHtml(domain)}">` : ''}${safeTitle}
        </a>
        <div class="deferred-meta">
          <span>${escapeHtml(domain)}</span>
          <span>${escapeHtml(ago)}</span>
        </div>
      </div>
      <button class="deferred-dismiss" data-action="dismiss-deferred" data-deferred-id="${safeId}" title="${escapeHtml(tr('dismiss'))}">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
      </button>
    </div>`;
}

/**
 * renderArchiveItem(item)
 *
 * Builds HTML for one completed/archived item (simpler: just title + date).
 */
function renderArchiveItem(item) {
  const ago = item.completedAt ? timeAgo(item.completedAt) : timeAgo(item.savedAt);
  const safeUrl   = escapeHtml(isSafeNavUrl(item.url) ? item.url : '#');
  const safeTitle = escapeHtml(item.title || item.url || '');
  return `
    <div class="archive-item">
      <a href="${safeUrl}" target="_blank" rel="noopener noreferrer" class="archive-item-title" title="${safeTitle}">
        ${safeTitle}
      </a>
      <span class="archive-item-date">${escapeHtml(ago)}</span>
    </div>`;
}


/* ----------------------------------------------------------------
   CHROME TAB GROUP VIEW — renders grouped tabs as cards with Chrome's
   color accent bar. A separate "Not grouped" cluster hosts the rest.
   ---------------------------------------------------------------- */

// Chrome's tab group color names → approximate hex. Chrome only exposes
// the color name via the API, so we pick visual equivalents here.
const CHROME_GROUP_COLORS = {
  grey:   '#5f6368',
  blue:   '#1a73e8',
  red:    '#d93025',
  yellow: '#f9ab00',
  green:  '#1e8e3e',
  pink:   '#e91e63',
  purple: '#9c27b0',
  cyan:   '#00bcd4',
  orange: '#e8710a',
};

function buildViewToggle(activeView) {
  if (tabGroupsList.length === 0) return '';
  return `<span class="view-toggle" role="tablist" aria-label="${escapeHtml(tr('viewModeLabel'))}">` +
    `<button class="toggle-pill${activeView === 'group'  ? ' active' : ''}" data-action="switch-view" data-view="group">${escapeHtml(tr('viewGroups'))}</button>` +
    `<button class="toggle-pill${activeView === 'domain' ? ' active' : ''}" data-action="switch-view" data-view="domain">${escapeHtml(tr('viewDomains'))}</button>` +
    `</span>&nbsp;&nbsp;`;
}

function renderTabGroupCard(groupInfo, tabs) {
  const color    = CHROME_GROUP_COLORS[groupInfo.color] || '#5f6368';
  const name     = groupInfo.title || tr('unnamedGroup');
  const tabCount = tabs.length;

  const urlCounts = {};
  for (const tab of tabs) urlCounts[tab.url] = (urlCounts[tab.url] || 0) + 1;
  const dupeUrls    = Object.entries(urlCounts).filter(([, c]) => c > 1);
  const hasDupes    = dupeUrls.length > 0;
  const totalExtras = dupeUrls.reduce((s, [, c]) => s + c - 1, 0);

  const seen = new Set();
  const uniqueTabs = [];
  for (const tab of tabs) {
    if (!seen.has(tab.url)) { seen.add(tab.url); uniqueTabs.push(tab); }
  }

  const visibleTabs = uniqueTabs.slice(0, 8);
  const extraCount  = uniqueTabs.length - visibleTabs.length;

  const pageChips = visibleTabs.map(tab => {
    let label = cleanTitle(smartTitle(stripTitleNoise(tab.title || ''), tab.url), '');
    try {
      const parsed = new URL(tab.url);
      if (parsed.hostname === 'localhost' && parsed.port) label = `${parsed.port} ${label}`;
    } catch {}
    const count     = urlCounts[tab.url];
    const dupeTag   = count > 1 ? ` <span class="chip-dupe-badge">(${count}x)</span>` : '';
    const chipClass = count > 1 ? ' chip-has-dupes' : '';
    const safeUrl   = escapeHtml(tab.url || '');
    const safeTitle = escapeHtml(label);
    let domain = '';
    try { domain = new URL(tab.url).hostname; } catch {}
    const faviconUrl = faviconUrlFor(domain);
    return `<div class="page-chip clickable${chipClass}" data-action="focus-tab" data-tab-url="${safeUrl}" title="${safeTitle}">
      ${faviconUrl ? `<img class="chip-favicon" src="${escapeHtml(faviconUrl)}" alt="" crossorigin="anonymous" data-favicon-domain="${escapeHtml(domain)}">` : ''}
      <span class="chip-text">${escapeHtml(label)}</span>${dupeTag}
      <div class="chip-actions">
        <button class="chip-action chip-save" data-action="defer-single-tab" data-tab-url="${safeUrl}" data-tab-title="${safeTitle}" title="${escapeHtml(tr('saveForLater'))}">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0 1 11.186 0Z" /></svg>
        </button>
        <button class="chip-action chip-close" data-action="close-single-tab" data-tab-url="${safeUrl}" title="${escapeHtml(tr('closeThisTab'))}">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
        </button>
      </div>
    </div>`;
  }).join('') + (extraCount > 0 ? buildOverflowChips(uniqueTabs.slice(8), urlCounts) : '');

  const tabBadge = `<span class="open-tabs-badge">${ICONS.tabs} ${escapeHtml(tr('tabsOpen', { count: tabCount }))}</span>`;
  const dupeBadge = hasDupes
    ? `<span class="open-tabs-badge dupe-count-badge" style="color:var(--accent-amber);background:rgba(200,113,58,0.08);">${escapeHtml(tr('duplicates', { count: totalExtras }))}</span>`
    : '';

  let actionsHtml = `
    <button class="action-btn close-tabs" data-action="close-group-tabs" data-group-id="${groupInfo.id}">
      ${ICONS.close}
      ${escapeHtml(tr('closeAllTabs', { count: tabCount }))}
    </button>
    <button class="action-btn" data-action="ungroup-tabs" data-group-id="${groupInfo.id}">${escapeHtml(tr('ungroup'))}</button>`;

  if (hasDupes) {
    const dupeUrlsEncoded = dupeUrls.map(([url]) => encodeURIComponent(url)).join(',');
    actionsHtml += `
      <button class="action-btn" data-action="dedup-keep-one" data-dupe-urls="${dupeUrlsEncoded}">
        ${escapeHtml(tr('closeDuplicates', { count: totalExtras }))}
      </button>`;
  }

  return `
    <div class="mission-card group-card" data-group-id="group-${groupInfo.id}">
      <div class="status-bar" style="background:${color}"></div>
      <div class="mission-content">
        <div class="mission-top">
          <span class="mission-name">${escapeHtml(name)}</span>
          ${tabBadge}
          ${dupeBadge}
        </div>
        <div class="mission-pages">${pageChips}</div>
        <div class="actions">${actionsHtml}</div>
      </div>
      <div class="mission-meta">
        <div class="mission-page-count">${tabCount}</div>
        <div class="mission-page-label">${escapeHtml(tr('tabsLabel'))}</div>
      </div>
    </div>`;
}

function renderUngroupedSection(ungroupedTabs) {
  const urlCounts = {};
  for (const tab of ungroupedTabs) urlCounts[tab.url] = (urlCounts[tab.url] || 0) + 1;

  const seen = new Set();
  const uniqueTabs = [];
  for (const tab of ungroupedTabs) {
    if (!seen.has(tab.url)) { seen.add(tab.url); uniqueTabs.push(tab); }
  }

  const chips = uniqueTabs.map(tab => {
    const label     = cleanTitle(smartTitle(stripTitleNoise(tab.title || ''), tab.url), '');
    const count     = urlCounts[tab.url];
    const dupeTag   = count > 1 ? ` <span class="chip-dupe-badge">(${count}x)</span>` : '';
    const chipClass = count > 1 ? ' chip-has-dupes' : '';
    const safeUrl   = escapeHtml(tab.url || '');
    const safeTitle = escapeHtml(label);
    let domain = '';
    try { domain = new URL(tab.url).hostname; } catch {}
    const faviconUrl = faviconUrlFor(domain);
    return `<div class="page-chip clickable${chipClass}" data-action="focus-tab" data-tab-url="${safeUrl}" title="${safeTitle}">
      ${faviconUrl ? `<img class="chip-favicon" src="${escapeHtml(faviconUrl)}" alt="" crossorigin="anonymous" data-favicon-domain="${escapeHtml(domain)}">` : ''}
      <span class="chip-text">${escapeHtml(label)}</span>${dupeTag}
      <div class="chip-actions">
        <button class="chip-action chip-save" data-action="defer-single-tab" data-tab-url="${safeUrl}" data-tab-title="${safeTitle}" title="${escapeHtml(tr('saveForLater'))}">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0 1 11.186 0Z" /></svg>
        </button>
        <button class="chip-action chip-close" data-action="close-single-tab" data-tab-url="${safeUrl}" title="${escapeHtml(tr('closeThisTab'))}">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
        </button>
      </div>
    </div>`;
  }).join('');

  return `
    <div class="ungrouped-section">
      <div class="ungrouped-label">${escapeHtml(tr('notGrouped'))}</div>
      <div class="ungrouped-chips">${chips}</div>
    </div>`;
}

async function renderGroupView() {
  const openTabsSection      = document.getElementById('openTabsSection');
  const openTabsMissionsEl   = document.getElementById('openTabsMissions');
  const openTabsSectionCount = document.getElementById('openTabsSectionCount');
  const openTabsSectionTitle = document.getElementById('openTabsSectionTitle');
  if (!openTabsSection) return;

  const realTabs      = getRealTabs();
  const groupedTabs   = realTabs.filter(t => t.groupId >= 0);
  const ungroupedTabs = realTabs.filter(t => t.groupId === -1);

  const groupData = new Map();
  for (const g of tabGroupsList) groupData.set(g.id, { groupInfo: g, tabs: [] });
  for (const tab of groupedTabs) {
    if (groupData.has(tab.groupId)) groupData.get(tab.groupId).tabs.push(tab);
  }

  // Sort groups by the minimum tab.index within each group (Chrome's own visual order).
  const sortedGroups = Array.from(groupData.values())
    .filter(g => g.tabs.length > 0)
    .sort((a, b) => Math.min(...a.tabs.map(t => t.index)) - Math.min(...b.tabs.map(t => t.index)));

  const groupCount = sortedGroups.length;

  if (openTabsSectionTitle) openTabsSectionTitle.textContent = tr('openTabsTitle');
  const summary = tr('groupCount', { count: groupCount }) +
                  (ungroupedTabs.length > 0 ? ` · ${tr('ungroupedCount', { count: ungroupedTabs.length })}` : '');
  openTabsSectionCount.innerHTML = `${buildViewToggle('group')}${summary} &nbsp;&middot;&nbsp; ` +
    `<button class="action-btn close-tabs" data-action="close-all-open-tabs" style="font-size:11px;padding:3px 10px;">` +
    `${ICONS.close} ${escapeHtml(tr('closeAllTabs', { count: realTabs.length }))}</button>`;

  const html = sortedGroups.map(({ groupInfo, tabs }) => renderTabGroupCard(groupInfo, tabs)).join('') +
               (ungroupedTabs.length > 0 ? renderUngroupedSection(ungroupedTabs) : '');

  if (sortedGroups.length > 0 || ungroupedTabs.length > 0) {
    openTabsMissionsEl.innerHTML = html;
    openTabsSection.style.display = 'block';
  } else {
    openTabsSection.style.display = 'none';
  }
}


/* ----------------------------------------------------------------
   MAIN DASHBOARD RENDERER
   ---------------------------------------------------------------- */

/**
 * renderStaticDashboard()
 *
 * The main render function:
 * 1. Paints greeting + date
 * 2. Fetches open tabs via chrome.tabs.query()
 * 3. Branches to group or domain view based on viewMode
 * 4. Updates footer stats
 * 5. Renders the "Saved for Later" checklist
 */
async function renderDomainView(realTabs) {
  // Landing pages (Gmail inbox, Twitter home, etc.) get their own special group
  // so they can be closed together without affecting content tabs on the same domain.
  const LANDING_PAGE_PATTERNS = [
    { hostname: 'mail.google.com', test: (p, h) =>
        !h.includes('#inbox/') && !h.includes('#sent/') && !h.includes('#search/') },
    { hostname: 'x.com',               pathExact: ['/home'] },
    { hostname: 'www.linkedin.com',    pathExact: ['/'] },
    { hostname: 'github.com',          pathExact: ['/'] },
    { hostname: 'www.youtube.com',     pathExact: ['/'] },
    // Merge personal patterns from config.local.js (if it exists)
    ...(typeof LOCAL_LANDING_PAGE_PATTERNS !== 'undefined' ? LOCAL_LANDING_PAGE_PATTERNS : []),
  ];

  function isLandingPage(url) {
    try {
      const parsed = new URL(url);
      return LANDING_PAGE_PATTERNS.some(p => {
        // Support both exact hostname and suffix matching (for wildcard subdomains)
        const hostnameMatch = p.hostname
          ? parsed.hostname === p.hostname
          : p.hostnameEndsWith
            ? parsed.hostname.endsWith(p.hostnameEndsWith)
            : false;
        if (!hostnameMatch) return false;
        if (p.test)       return p.test(parsed.pathname, url);
        if (p.pathPrefix) return parsed.pathname.startsWith(p.pathPrefix);
        if (p.pathExact)  return p.pathExact.includes(parsed.pathname);
        return parsed.pathname === '/';
      });
    } catch { return false; }
  }

  domainGroups = [];
  const groupMap    = {};
  const landingTabs = [];

  // Custom group rules from config.local.js (if any)
  const customGroups = typeof LOCAL_CUSTOM_GROUPS !== 'undefined' ? LOCAL_CUSTOM_GROUPS : [];

  // Check if a URL matches a custom group rule; returns the rule or null
  function matchCustomGroup(url) {
    try {
      const parsed = new URL(url);
      return customGroups.find(r => {
        const hostMatch = r.hostname
          ? parsed.hostname === r.hostname
          : r.hostnameEndsWith
            ? parsed.hostname.endsWith(r.hostnameEndsWith)
            : false;
        if (!hostMatch) return false;
        if (r.pathPrefix) return parsed.pathname.startsWith(r.pathPrefix);
        return true; // hostname matched, no path filter
      }) || null;
    } catch { return null; }
  }

  for (const tab of realTabs) {
    try {
      if (isLandingPage(tab.url)) {
        landingTabs.push(tab);
        continue;
      }

      // Check custom group rules first (e.g. merge subdomains, split by path)
      const customRule = matchCustomGroup(tab.url);
      if (customRule) {
        const key = customRule.groupKey;
        if (!groupMap[key]) groupMap[key] = { domain: key, label: customRule.groupLabel, tabs: [] };
        groupMap[key].tabs.push(tab);
        continue;
      }

      let hostname;
      if (tab.url && tab.url.startsWith('file://')) {
        hostname = 'local-files';
      } else {
        hostname = new URL(tab.url).hostname;
      }
      if (!hostname) continue;

      if (!groupMap[hostname]) groupMap[hostname] = { domain: hostname, tabs: [] };
      groupMap[hostname].tabs.push(tab);
    } catch {
      // Skip malformed URLs
    }
  }

  if (landingTabs.length > 0) {
    groupMap['__landing-pages__'] = { domain: '__landing-pages__', tabs: landingTabs };
  }

  // Sort: landing pages first, then domains from landing page sites, then by tab count
  const landingHostnames = new Set(LANDING_PAGE_PATTERNS.map(p => p.hostname).filter(Boolean));
  const landingSuffixes = LANDING_PAGE_PATTERNS.map(p => p.hostnameEndsWith).filter(Boolean);
  function isLandingDomain(domain) {
    if (landingHostnames.has(domain)) return true;
    return landingSuffixes.some(s => domain.endsWith(s));
  }
  domainGroups = Object.values(groupMap).sort((a, b) => {
    const aIsLanding = a.domain === '__landing-pages__';
    const bIsLanding = b.domain === '__landing-pages__';
    if (aIsLanding !== bIsLanding) return aIsLanding ? -1 : 1;

    const aIsPriority = isLandingDomain(a.domain);
    const bIsPriority = isLandingDomain(b.domain);
    if (aIsPriority !== bIsPriority) return aIsPriority ? -1 : 1;

    return b.tabs.length - a.tabs.length;
  });

  // --- Render domain cards ---
  const openTabsSection      = document.getElementById('openTabsSection');
  const openTabsMissionsEl   = document.getElementById('openTabsMissions');
  const openTabsSectionCount = document.getElementById('openTabsSectionCount');
  const openTabsSectionTitle = document.getElementById('openTabsSectionTitle');

  if (domainGroups.length > 0 && openTabsSection) {
    if (openTabsSectionTitle) openTabsSectionTitle.textContent = tr('openTabsTitle');
    openTabsSectionCount.innerHTML = `${buildViewToggle('domain')}${tr('domainCount', { count: domainGroups.length })} &nbsp;&middot;&nbsp; <button class="action-btn close-tabs" data-action="close-all-open-tabs" style="font-size:11px;padding:3px 10px;">${ICONS.close} ${escapeHtml(tr('closeAllTabs', { count: realTabs.length }))}</button>`;
    openTabsMissionsEl.innerHTML = domainGroups.map(g => renderDomainCard(g)).join('');
    openTabsSection.style.display = 'block';
  } else if (openTabsSection) {
    openTabsSection.style.display = 'none';
  }
}

async function renderStaticDashboard() {
  // --- Header ---
  const greetingEl = document.getElementById('greeting');
  const dateEl     = document.getElementById('dateDisplay');
  if (greetingEl) greetingEl.textContent = getGreeting();
  if (dateEl)     dateEl.textContent     = getDateDisplay();

  // --- Fetch tabs + Chrome tab groups in parallel ---
  await Promise.all([fetchOpenTabs(), fetchTabGroups()]);
  const realTabs = getRealTabs();

  // --- Pick view mode. When no Chrome groups exist, force domain view
  //     (the toggle pill is hidden in that case via buildViewToggle). ---
  const stored  = await loadViewMode();
  const view    = (tabGroupsList.length === 0) ? 'domain' : stored;

  if (view === 'group') {
    await renderGroupView();
  } else {
    await renderDomainView(realTabs);
  }

  // --- Footer stats (exclude pinned + browser-internal pages for consistency
  //     with what the dashboard actually shows) ---
  const statTabs = document.getElementById('statTabs');
  if (statTabs) statTabs.textContent = getRealTabs().length;

  // --- Check for duplicate Tab Out tabs ---
  checkTabOutDupes();

  // --- Render "Saved for Later" column ---
  await renderDeferredColumn();
}

async function renderDashboard() {
  await renderStaticDashboard();
}


/* ----------------------------------------------------------------
   EVENT HANDLERS — using event delegation

   One listener on document handles ALL button clicks.
   Think of it as one security guard watching the whole building
   instead of one per door.
   ---------------------------------------------------------------- */

document.addEventListener('click', async (e) => {
  // Walk up the DOM to find the nearest element with data-action
  const actionEl = e.target.closest('[data-action]');
  if (!actionEl) return;

  const action = actionEl.dataset.action;

  // ---- Switch color theme ----
  if (action === 'set-theme') {
    const name = actionEl.dataset.themeName;
    if (name) applyTheme(name, { save: true });
    setThemeMenuOpen(false);
    return;
  }

  // ---- Open/close theme palette ----
  if (action === 'toggle-theme-menu') {
    toggleThemeMenu();
    return;
  }

  // ---- Switch interface language ----
  if (action === 'set-language') {
    const lang = actionEl.dataset.language;
    if (lang) setLanguage(lang, { save: true, rerender: true });
    return;
  }

  // ---- Close duplicate Tab Out tabs ----
  if (action === 'close-tabout-dupes') {
    await closeTabOutDupes();
    playCloseSound();
    const banner = document.getElementById('tabOutDupeBanner');
    if (banner) {
      banner.style.transition = 'opacity 0.4s';
      banner.style.opacity = '0';
      setTimeout(() => { banner.style.display = 'none'; banner.style.opacity = '1'; }, 400);
    }
    showToast(tr('toastClosedExtraTabOut'));
    return;
  }

  const card = actionEl.closest('.mission-card');

  // ---- Expand overflow chips ("+N more") ----
  if (action === 'expand-chips') {
    const overflowContainer = actionEl.parentElement.querySelector('.page-chips-overflow');
    if (overflowContainer) {
      overflowContainer.style.display = 'contents';
      actionEl.remove();
    }
    return;
  }

  // ---- Focus a specific tab ----
  if (action === 'focus-tab') {
    const tabUrl = actionEl.dataset.tabUrl;
    if (tabUrl) await focusTab(tabUrl);
    return;
  }

  // ---- Close a single tab ----
  if (action === 'close-single-tab') {
    e.stopPropagation(); // don't trigger parent chip's focus-tab
    const tabUrl = actionEl.dataset.tabUrl;
    if (!tabUrl) return;

    // The chip represents a URL (possibly with an "(Nx)" duplicate badge),
    // so close every tab with that exact URL, not just the first one found.
    // Pinned tabs are skipped — the user asked Chrome to keep those around.
    const allTabs = await chrome.tabs.query({});
    const ids     = allTabs.filter(t => !t.pinned && t.url === tabUrl).map(t => t.id);
    if (ids.length > 0) await chrome.tabs.remove(ids);
    await fetchOpenTabs();

    playCloseSound();

    // Animate the chip row out
    const chip = actionEl.closest('.page-chip');
    if (chip) {
      const rect = chip.getBoundingClientRect();
      shootConfetti(rect.left + rect.width / 2, rect.top + rect.height / 2);
      chip.style.transition = 'opacity 0.2s, transform 0.2s';
      chip.style.opacity    = '0';
      chip.style.transform  = 'scale(0.8)';
      setTimeout(() => {
        chip.remove();
        // If the card now has no tabs, remove it too
        const parentCard = document.querySelector('.mission-card:has(.mission-pages:empty)');
        if (parentCard) animateCardOut(parentCard);
        document.querySelectorAll('.mission-card').forEach(c => {
          if (c.querySelectorAll('.page-chip[data-action="focus-tab"]').length === 0) {
            animateCardOut(c);
          }
        });
      }, 200);
    }

    // Update footer
    const statTabs = document.getElementById('statTabs');
    if (statTabs) statTabs.textContent = getRealTabs().length;

    showToast(tr('toastTabClosed'));
    return;
  }

  // ---- Save a single tab for later (then close it) ----
  if (action === 'defer-single-tab') {
    e.stopPropagation();
    const tabUrl   = actionEl.dataset.tabUrl;
    const tabTitle = actionEl.dataset.tabTitle || tabUrl;
    if (!tabUrl) return;

    // Save to chrome.storage.local
    try {
      await saveTabForLater({ url: tabUrl, title: tabTitle });
    } catch (err) {
      console.error('[tab-out] Failed to save tab:', err);
      showToast(tr('toastSaveFailed'));
      return;
    }

    // Close every tab with that exact URL so duplicates also go away.
    // Never close a pinned tab — even when saving it for later.
    const allTabs = await chrome.tabs.query({});
    const ids     = allTabs.filter(t => !t.pinned && t.url === tabUrl).map(t => t.id);
    if (ids.length > 0) await chrome.tabs.remove(ids);
    await fetchOpenTabs();

    // Animate chip out
    const chip = actionEl.closest('.page-chip');
    if (chip) {
      chip.style.transition = 'opacity 0.2s, transform 0.2s';
      chip.style.opacity    = '0';
      chip.style.transform  = 'scale(0.8)';
      setTimeout(() => chip.remove(), 200);
    }

    showToast(tr('toastSavedForLater'));
    await renderDeferredColumn();
    return;
  }

  // ---- Check off a saved tab (moves it to archive) ----
  if (action === 'check-deferred') {
    const id = actionEl.dataset.deferredId;
    if (!id) return;

    await checkOffSavedTab(id);

    // Animate: strikethrough first, then slide out
    const item = actionEl.closest('.deferred-item');
    if (item) {
      item.classList.add('checked');
      setTimeout(() => {
        item.classList.add('removing');
        setTimeout(() => {
          item.remove();
          renderDeferredColumn(); // refresh counts and archive
        }, 300);
      }, 800);
    }
    return;
  }

  // ---- Dismiss a saved tab (removes it entirely) ----
  if (action === 'dismiss-deferred') {
    const id = actionEl.dataset.deferredId;
    if (!id) return;

    await dismissSavedTab(id);

    const item = actionEl.closest('.deferred-item');
    if (item) {
      item.classList.add('removing');
      setTimeout(() => {
        item.remove();
        renderDeferredColumn();
      }, 300);
    }
    return;
  }

  // ---- Close all tabs in a domain group ----
  if (action === 'close-domain-tabs') {
    const domainKey = actionEl.dataset.domainKey;
    const group    = domainGroups.find(g => g.domain === domainKey);
    if (!group) return;

    const urls = group.tabs.map(t => t.url);
    await closeTabsByUrls(urls);

    if (card) {
      playCloseSound();
      animateCardOut(card);
    }

    // Remove from in-memory groups
    const idx = domainGroups.indexOf(group);
    if (idx !== -1) domainGroups.splice(idx, 1);

    const groupLabel = group.domain === '__landing-pages__' ? tr('homepages') : (group.label || friendlyDomain(group.domain));
    showToast(tr('toastClosedFromGroup', { count: urls.length, label: groupLabel }));

    const statTabs = document.getElementById('statTabs');
    if (statTabs) statTabs.textContent = getRealTabs().length;
    return;
  }

  // ---- Close duplicates, keep one copy ----
  if (action === 'dedup-keep-one') {
    const urlsEncoded = actionEl.dataset.dupeUrls || '';
    const urls = urlsEncoded.split(',').map(u => decodeURIComponent(u)).filter(Boolean);
    if (urls.length === 0) return;

    await closeDuplicateTabs(urls, true);
    playCloseSound();

    // Hide the dedup button
    actionEl.style.transition = 'opacity 0.2s';
    actionEl.style.opacity    = '0';
    setTimeout(() => actionEl.remove(), 200);

    // Remove dupe badges from the card
    if (card) {
      card.querySelectorAll('.chip-dupe-badge').forEach(b => {
        b.style.transition = 'opacity 0.2s';
        b.style.opacity    = '0';
        setTimeout(() => b.remove(), 200);
      });
      card.querySelectorAll('.dupe-count-badge').forEach(badge => {
        badge.style.transition = 'opacity 0.2s';
        badge.style.opacity    = '0';
        setTimeout(() => badge.remove(), 200);
      });
      card.classList.remove('has-amber-bar');
      card.classList.add('has-neutral-bar');
    }

    showToast(tr('toastClosedDuplicates'));
    return;
  }

  // ---- Switch between Groups view and Domains view ----
  if (action === 'switch-view') {
    const newView = actionEl.dataset.view === 'group' ? 'group' : 'domain';
    await saveViewMode(newView);
    await renderDashboard();
    return;
  }

  // ---- Close all tabs in a Chrome tab group ----
  if (action === 'close-group-tabs') {
    const groupId   = Number(actionEl.dataset.groupId);
    if (!Number.isFinite(groupId)) return;
    const groupTabs = openTabs.filter(t => t.groupId === groupId);
    const tabIds    = groupTabs.map(t => t.id);
    await closeTabsByIds(tabIds);
    playCloseSound();

    const cardEl = document.querySelector(`[data-group-id="group-${groupId}"]`);
    if (cardEl) {
      const rect = cardEl.getBoundingClientRect();
      shootConfetti(rect.left + rect.width / 2, rect.top + rect.height / 2);
      animateCardOut(cardEl);
    }

    const statTabs = document.getElementById('statTabs');
    if (statTabs) statTabs.textContent = getRealTabs().length;
    showToast(tr('toastClosedChromeGroup', { count: tabIds.length }));
    return;
  }

  // ---- Ungroup a Chrome tab group (move tabs out, keep them open) ----
  if (action === 'ungroup-tabs') {
    const groupId = Number(actionEl.dataset.groupId);
    if (!Number.isFinite(groupId)) return;
    const groupTabs = openTabs.filter(t => t.groupId === groupId);
    for (const tab of groupTabs) {
      try { await chrome.tabs.ungroup(tab.id); } catch { /* tab vanished — ignore */ }
    }
    await renderDashboard();
    showToast(tr('toastUngrouped', { count: groupTabs.length }));
    return;
  }

  // ---- Close ALL open tabs ----
  if (action === 'close-all-open-tabs') {
    // Exclude Tab Out's own new-tab pages (across Chrome/Edge/Brave) and
    // other internal schemes so we don't close the page the user is on.
    const allUrls = openTabs
      .filter(t =>
        t.url &&
        !t.isTabOut &&
        !t.url.startsWith('chrome') &&
        !t.url.startsWith('edge:') &&
        !t.url.startsWith('brave:') &&
        !t.url.startsWith('about:')
      )
      .map(t => t.url);
    await closeTabsByUrls(allUrls);
    playCloseSound();

    document.querySelectorAll('#openTabsMissions .mission-card').forEach(c => {
      shootConfetti(
        c.getBoundingClientRect().left + c.offsetWidth / 2,
        c.getBoundingClientRect().top  + c.offsetHeight / 2
      );
      animateCardOut(c);
    });

    showToast(tr('toastAllTabsClosed'));
    return;
  }
});

// ---- Archive toggle — expand/collapse the archive section ----
document.addEventListener('click', (e) => {
  const toggle = e.target.closest('#archiveToggle');
  if (!toggle) return;

  toggle.classList.toggle('open');
  const body = document.getElementById('archiveBody');
  if (body) {
    body.style.display = body.style.display === 'none' ? 'block' : 'none';
  }
});

// ---- Open-tabs search — filter domain cards and chips as user types ----
document.addEventListener('input', (e) => {
  if (e.target.id !== 'openTabsSearch') return;

  const q = e.target.value.trim().toLowerCase();
  const missionsEl = document.getElementById('openTabsMissions');
  if (!missionsEl) return;

  const cards = missionsEl.querySelectorAll('.mission-card');

  if (q.length === 0) {
    missionsEl.classList.remove('is-searching');
    cards.forEach(card => {
      card.classList.remove('search-hidden');
      card.querySelectorAll('.page-chip').forEach(chip => chip.classList.remove('search-hidden'));
      card.querySelectorAll('.page-chips-overflow').forEach(overflow => {
        if (overflow.parentElement?.querySelector('.page-chip-overflow')) {
          overflow.style.display = 'none';
        }
      });
    });
    missionsEl.querySelectorAll('.ungrouped-section').forEach(section => {
      section.classList.remove('search-hidden');
      section.querySelectorAll('.page-chip').forEach(chip => chip.classList.remove('search-hidden'));
    });
    return;
  }

  missionsEl.classList.add('is-searching');

  cards.forEach(card => {
    card.querySelectorAll('.page-chips-overflow').forEach(overflow => {
      overflow.style.display = 'contents';
    });

    const domainLabel = (card.querySelector('.mission-name')?.textContent || '').toLowerCase();
    // Group name itself matches → show every chip in this card.
    if (domainLabel.includes(q)) {
      card.classList.remove('search-hidden');
      card.querySelectorAll('.page-chip:not(.page-chip-overflow)').forEach(chip => chip.classList.remove('search-hidden'));
      return;
    }

    let anyVisible = false;
    card.querySelectorAll('.page-chip:not(.page-chip-overflow)').forEach(chip => {
      const title = (chip.title || chip.querySelector('.chip-text')?.textContent || '').toLowerCase();
      const url   = (chip.dataset.tabUrl || '').toLowerCase();
      if (title.includes(q) || url.includes(q)) {
        chip.classList.remove('search-hidden');
        anyVisible = true;
      } else {
        chip.classList.add('search-hidden');
      }
    });

    card.classList.toggle('search-hidden', !anyVisible);
  });

  missionsEl.querySelectorAll('.ungrouped-section').forEach(section => {
    const sectionLabel = (section.querySelector('.ungrouped-label')?.textContent || '').toLowerCase();
    if (sectionLabel.includes(q)) {
      section.classList.remove('search-hidden');
      section.querySelectorAll('.page-chip').forEach(chip => chip.classList.remove('search-hidden'));
      return;
    }

    let anyVisible = false;
    section.querySelectorAll('.page-chip').forEach(chip => {
      const title = (chip.title || chip.querySelector('.chip-text')?.textContent || '').toLowerCase();
      const url   = (chip.dataset.tabUrl || '').toLowerCase();
      if (title.includes(q) || url.includes(q)) {
        chip.classList.remove('search-hidden');
        anyVisible = true;
      } else {
        chip.classList.add('search-hidden');
      }
    });

    section.classList.toggle('search-hidden', !anyVisible);
  });
});

// ---- Keyboard shortcuts for the search pill ----
document.addEventListener('keydown', (e) => {
  const search = document.getElementById('openTabsSearch');
  if (!search) return;

  // "/" focuses the search (unless the user is already typing somewhere
  // else, or the privacy screen is covering the dashboard).
  if (e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey) {
    if (document.body.classList.contains('privacy-mode')) return;
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    e.preventDefault();
    search.focus();
    search.select();
    return;
  }

  // Escape clears and blurs when the search input is focused. We stop
  // propagation so the privacy-mode Esc handler below doesn't ALSO fire
  // and flip privacy on top of the search clear.
  if (e.key === 'Escape' && document.activeElement === search) {
    search.value = '';
    search.dispatchEvent(new Event('input'));
    search.blur();
    e.stopImmediatePropagation();
  }
});

// ---- Archive search — filter archived items as user types ----
document.addEventListener('input', async (e) => {
  if (e.target.id !== 'archiveSearch') return;

  const q = e.target.value.trim().toLowerCase();
  const archiveList = document.getElementById('archiveList');
  if (!archiveList) return;

  try {
    const { archived } = await getSavedTabs();

    if (q.length < 2) {
      // Show all archived items
      archiveList.innerHTML = archived.map(item => renderArchiveItem(item)).join('');
      return;
    }

    // Filter by title or URL containing the query string
    const results = archived.filter(item =>
      (item.title || '').toLowerCase().includes(q) ||
      (item.url  || '').toLowerCase().includes(q)
    );

    archiveList.innerHTML = results.map(item => renderArchiveItem(item)).join('')
      || `<div style="font-size:12px;color:var(--muted);padding:8px 0">${escapeHtml(tr('noResults'))}</div>`;
  } catch (err) {
    console.warn('[tab-out] Archive search failed:', err);
  }
});


/* ----------------------------------------------------------------
   FAVICON FALLBACK — hide broken favicon images.
   Inline onerror attributes are blocked by the MV3 default CSP, so we
   use a single delegated listener in the capture phase (the 'error'
   event doesn't bubble).
   ---------------------------------------------------------------- */
document.addEventListener('error', (e) => {
  const el = e.target;
  if (el && el.tagName === 'IMG') el.style.display = 'none';
}, true);

// Same pattern for `load` — any successfully-loaded favicon with a
// data-favicon-domain attribute gets snapshotted into localStorage so
// the next new-tab open skips the network request.
document.addEventListener('load', (e) => {
  const el = e.target;
  if (!el || el.tagName !== 'IMG') return;
  const domain = el.dataset.faviconDomain;
  if (!domain) return;
  // Skip if the src is already a data: URL (came from cache).
  if ((el.currentSrc || el.src || '').startsWith('data:')) return;
  cacheFaviconFromImg(domain, el);
}, true);


/* ----------------------------------------------------------------
   PRIVACY MODE — hide dashboard content during screen sharing

   Toggled by the lock icon in the header or by Esc. State is stored in
   chrome.storage.local so it survives new tabs. initPrivacyMode() runs
   before the first render so the dashboard never flashes into view when
   a locked session is reopened.
   ---------------------------------------------------------------- */

const PRIVACY_DEFAULTS = { clock: true, date: true, motto: true, search: true, mottoText: '' };

async function getPrivacyMode() {
  try {
    const { privacyMode } = await chrome.storage.local.get('privacyMode');
    return privacyMode === true;
  } catch { return false; }
}

async function getPrivacySettings() {
  try {
    const { privacySettings } = await chrome.storage.local.get('privacySettings');
    return { ...PRIVACY_DEFAULTS, ...privacySettings };
  } catch { return { ...PRIVACY_DEFAULTS }; }
}

async function savePrivacySettings(settings) {
  try { await chrome.storage.local.set({ privacySettings: settings }); } catch {}
}

async function setPrivacyMode(enabled) {
  try { await chrome.storage.local.set({ privacyMode: enabled }); } catch {}
  document.body.classList.toggle('privacy-mode', enabled);
  if (enabled) {
    await applyPrivacyWidgets();
    startPrivacyClock();
  } else {
    stopPrivacyClock();
    // Refresh is suppressed while locked (see scheduleRefresh); catch up now.
    renderDashboard();
  }
}

async function applyPrivacyWidgets() {
  const s = await getPrivacySettings();
  const timeEl   = document.getElementById('privacyTime');
  const dateEl   = document.getElementById('privacyDate');
  const mottoEl  = document.getElementById('privacyMotto');
  const searchEl = document.getElementById('privacySearch');

  if (timeEl)   timeEl.style.display   = s.clock  ? '' : 'none';
  if (dateEl)   dateEl.style.display   = s.date   ? '' : 'none';
  if (searchEl) searchEl.style.display = s.search ? '' : 'none';
  if (mottoEl) {
    mottoEl.style.display = s.motto && s.mottoText ? '' : 'none';
    mottoEl.textContent   = s.mottoText || '';
  }

  // Sync checkboxes in the settings panel with persisted state.
  const ids = { psClock: 'clock', psDate: 'date', psMotto: 'motto', psSearch: 'search' };
  for (const [elId, key] of Object.entries(ids)) {
    const cb = document.getElementById(elId);
    if (cb) cb.checked = s[key];
  }
  const mottoInput = document.getElementById('psMottoInput');
  if (mottoInput) mottoInput.value = s.mottoText || '';
  const mottoEdit = document.getElementById('psMottoEdit');
  if (mottoEdit) mottoEdit.style.display = s.motto ? '' : 'none';
}

let privacyClockInterval = null;

function updatePrivacyClock() {
  const now = new Date();
  const timeEl = document.getElementById('privacyTime');
  const dateEl = document.getElementById('privacyDate');
  if (timeEl) {
    timeEl.textContent = now.toLocaleTimeString('en-US', {
      hour: '2-digit', minute: '2-digit', hour12: false,
    });
  }
  if (dateEl) {
    dateEl.textContent = now.toLocaleDateString(activeLanguage === 'zh' ? 'zh-CN' : 'en-US', {
      weekday: 'long', month: 'long', day: 'numeric',
    });
  }
}

function startPrivacyClock() {
  updatePrivacyClock();
  if (!privacyClockInterval) privacyClockInterval = setInterval(updatePrivacyClock, 1000);
}

function stopPrivacyClock() {
  if (privacyClockInterval) {
    clearInterval(privacyClockInterval);
    privacyClockInterval = null;
  }
}

async function togglePrivacyMode() {
  const current = document.body.classList.contains('privacy-mode');
  await setPrivacyMode(!current);
}

document.getElementById('privacyToggle')?.addEventListener('click', togglePrivacyMode);

// Esc toggles privacy. Typing in any text input first defuses Esc to just
// blur the field — including the open-tabs search handled above.
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  const themePicker = document.getElementById('themePicker');
  if (themePicker?.classList.contains('theme-menu-open')) {
    e.preventDefault();
    setThemeMenuOpen(false);
    return;
  }
  const active = document.activeElement;
  const GUARDED_IDS = ['privacySearchInput', 'psMottoInput', 'openTabsSearch', 'archiveSearch'];
  if (active && GUARDED_IDS.includes(active.id)) {
    active.blur();
    return;
  }
  e.preventDefault();
  togglePrivacyMode();
});

// Privacy settings panel: gear toggles it, clicks outside close it.
document.getElementById('privacySettingsBtn')?.addEventListener('click', () => {
  const panel = document.getElementById('privacySettings');
  if (panel) panel.style.display = panel.style.display === 'none' ? '' : 'none';
});

document.addEventListener('click', (e) => {
  const themePicker = document.getElementById('themePicker');
  if (themePicker && !themePicker.contains(e.target)) setThemeMenuOpen(false);

  const panel = document.getElementById('privacySettings');
  const btn   = document.getElementById('privacySettingsBtn');
  if (!panel || panel.style.display === 'none') return;
  if (panel.contains(e.target) || (btn && btn.contains(e.target))) return;
  panel.style.display = 'none';
});

for (const id of ['psClock', 'psDate', 'psMotto', 'psSearch']) {
  document.getElementById(id)?.addEventListener('change', async () => {
    const s = await getPrivacySettings();
    s.clock  = document.getElementById('psClock')?.checked ?? true;
    s.date   = document.getElementById('psDate')?.checked ?? true;
    s.motto  = document.getElementById('psMotto')?.checked ?? true;
    s.search = document.getElementById('psSearch')?.checked ?? true;
    await savePrivacySettings(s);
    applyPrivacyWidgets();
  });
}

const _privacyMottoInput = document.getElementById('psMottoInput');
if (_privacyMottoInput) {
  const saveMotto = async () => {
    const s = await getPrivacySettings();
    s.mottoText = _privacyMottoInput.value.trim();
    await savePrivacySettings(s);
    applyPrivacyWidgets();
  };
  _privacyMottoInput.addEventListener('blur', saveMotto);
  _privacyMottoInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); _privacyMottoInput.blur(); }
  });
}

async function initPrivacyMode() {
  const enabled = await getPrivacyMode();
  if (enabled) {
    document.body.classList.add('privacy-mode');
    await applyPrivacyWidgets();
    startPrivacyClock();
  }
}


/* ----------------------------------------------------------------
   LIVE TAB LISTENERS — re-render when tabs change
   Debounced so rapid tab changes don't cause excessive re-renders.
   ---------------------------------------------------------------- */
let _tabRefreshTimer = null;
let _initialRenderDone = false;

function scheduleRefresh() {
  if (_tabRefreshTimer) clearTimeout(_tabRefreshTimer);
  _tabRefreshTimer = setTimeout(() => {
    // While privacy mode covers the dashboard, skip the re-render — the
    // user can't see it, and we'd be thrashing the DOM behind the lock.
    if (document.body.classList.contains('privacy-mode')) return;
    // Entrance animations are a one-shot greeting; don't replay them on
    // every tab event or the dashboard flickers as tabs come and go.
    if (_initialRenderDone) document.body.classList.add('no-entrance-anim');
    renderDashboard();
  }, 300);
}

if (typeof chrome !== 'undefined' && chrome.tabs) {
  chrome.tabs.onCreated.addListener(scheduleRefresh);
  chrome.tabs.onRemoved.addListener(scheduleRefresh);
  chrome.tabs.onUpdated.addListener((_tabId, changeInfo) => {
    // Only refresh on meaningful changes; ignore intermediate loading noise.
    if (changeInfo.status === 'complete' || changeInfo.url) scheduleRefresh();
  });
  // Only refresh when the user switches BACK to a Super Tab Out tab —
  // not on every tab switch across the browser.
  chrome.tabs.onActivated.addListener(async (activeInfo) => {
    try {
      const tab = await chrome.tabs.get(activeInfo.tabId);
      if (tab.url && tab.url.startsWith(`chrome-extension://${chrome.runtime.id}/`)) {
        scheduleRefresh();
      }
    } catch { /* tab may have closed before the query resolved */ }
  });
}


// Ctrl/Cmd + Shift + G — quickly toggle between Groups and Domains view.
// No-op when no Chrome tab groups exist.
document.addEventListener('keydown', async (e) => {
  if (e.key === 'Escape') setThemeMenuOpen(false);
  if (!(e.ctrlKey || e.metaKey) || !e.shiftKey) return;
  if (e.key !== 'G' && e.key !== 'g') return;
  if (tabGroupsList.length === 0) return;
  e.preventDefault();
  const stored = await loadViewMode();
  await saveViewMode(stored === 'group' ? 'domain' : 'group');
  await renderDashboard();
});


/* ----------------------------------------------------------------
   INITIALIZE
   ---------------------------------------------------------------- */
initThemeSwitcher();
initLanguageSwitcher();
cleanExpiredFavicons();
// initPrivacyMode runs first so a locked session never flashes the
// dashboard into view before the body.privacy-mode class lands.
initPrivacyMode().then(() => {
  renderDashboard().then(() => { _initialRenderDone = true; });
});

/* ================================================================
   Super Tab Out — Dashboard App (Pure Extension Edition)
   Super Tab Out is Apache-2.0.
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

const StorageService = window.SuperTabOutStorage;
const TabsService = window.SuperTabOutTabs;
const SearchService = window.SuperTabOutSearch;
const MetricsService = window.SuperTabOutMetrics;

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
  ...(TabsService?.BROWSER_NEWTAB_URLS || [
    'chrome://newtab/',
    'edge://newtab/',
    'brave://newtab/',
    'about:newtab',
  ]),
];

/**
 * fetchOpenTabs()
 *
 * Reads all currently open browser tabs directly from Chrome.
 * Sets the extensionId flag so we can identify Tab Out's own pages.
 */
async function fetchOpenTabs() {
  try {
    if (TabsService?.fetchOpenTabs) {
      openTabs = await TabsService.fetchOpenTabs();
      return;
    }

    const extensionId = chrome.runtime.id;
    const newtabUrl = `chrome-extension://${extensionId}/index.html`;
    const tabs = await chrome.tabs.query({});
    openTabs = tabs.map(t => ({
      id: t.id,
      url: t.url,
      title: t.title,
      windowId: t.windowId,
      active: t.active,
      pinned: t.pinned,
      groupId: typeof t.groupId === 'number' ? t.groupId : -1,
      index: t.index,
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
  if (TabsService?.closeTabsByUrls) {
    await TabsService.closeTabsByUrls(urls);
  } else {
    const urlSet = new Set(urls);
    const allTabs = await chrome.tabs.query({});
    const toClose = allTabs
      .filter(t => !t.pinned && urlSet.has(t.url))
      .map(t => t.id);
    if (toClose.length > 0) await chrome.tabs.remove(toClose);
  }
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
  if (TabsService?.focusTab) {
    await TabsService.focusTab(url);
    return;
  }
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
  if (TabsService?.closeDuplicateTabs) {
    await TabsService.closeDuplicateTabs(urls, keepOne);
  } else {
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
  }
  await fetchOpenTabs();
}

/**
 * closeTabOutDupes()
 *
 * Closes all duplicate Tab Out new-tab pages except the current one.
 */
async function closeTabOutDupes() {
  if (TabsService?.closeTabOutDupes) {
    await TabsService.closeTabOutDupes();
  } else {
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
  }
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
    tabGroupsList = TabsService?.fetchTabGroups
      ? await TabsService.fetchTabGroups()
      : await chrome.tabGroups.query({});
  } catch {
    // tabGroups permission missing or API unavailable — ignore.
    tabGroupsList = [];
  }
}

async function loadViewMode() {
  try {
    if (StorageService?.getViewMode) return await StorageService.getViewMode();
    const { viewMode } = await chrome.storage.local.get('viewMode');
    return viewMode === 'domain' ? 'domain' : 'group';
  } catch { return 'group'; }
}

async function saveViewMode(mode) {
  try {
    if (StorageService?.setViewMode) await StorageService.setViewMode(mode);
    else await chrome.storage.local.set({ viewMode: mode });
  } catch {}
}

// Close tabs by numeric ids. Used for "Close all tabs in this group".
// Pinned tabs are still protected (consistent with #7 behavior).
async function closeTabsByIds(ids) {
  if (!ids || ids.length === 0) return;
  if (TabsService?.closeTabsByIds) {
    await TabsService.closeTabsByIds(ids);
  } else {
    const idSet = new Set(ids);
    const allTabs = await chrome.tabs.query({});
    const toClose = allTabs
      .filter(t => idSet.has(t.id) && !t.pinned)
      .map(t => t.id);
    if (toClose.length > 0) await chrome.tabs.remove(toClose);
  }
  await fetchOpenTabs();
}


/* ----------------------------------------------------------------
   THEME SWITCHER

   Theme palettes the user can pick from. The active theme is written to localStorage and
   re-applied on load by theme-init.js before the body paints, so the
   page doesn't flash the default palette. This function only has to
   sync the DOM state and the pressed-button indicator.
   ---------------------------------------------------------------- */
const THEMES = ['system', 'white', 'material', 'cupertino', 'warm', 'midnight', 'arctic', 'forest', 'graphite', 'coast', 'plum', 'matcha', 'ember', 'lavender'];
const THEME_STORAGE_KEY = 'tab-out-theme';
const THEME_LABEL_KEYS = {
  system: 'themeSystem',
  white: 'themeWhite',
  material: 'themeMaterial',
  cupertino: 'themeCupertino',
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
  return THEMES.includes(t) ? t : 'system';
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
  if (currentBtn) {
    const title = tr('themeCurrentTitle', { theme: label });
    currentBtn.setAttribute('title', title);
    currentBtn.setAttribute('aria-label', title);
  }
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
   FONT + DENSITY SWITCHER

   Presets use system CSS generic families only. We do not bundle,
   download, or @font-face any font files; the controls adjust local
   font-family tokens plus readable/compact density variables in CSS.
   ---------------------------------------------------------------- */
const FONT_PRESETS = ['system', 'readable', 'compact', 'editorial'];
const FONT_STORAGE_KEY = 'tab-out-font-preset';
const FONT_LABEL_KEYS = {
  system: 'fontSystem',
  readable: 'fontReadable',
  compact: 'fontCompact',
  editorial: 'fontEditorial',
};
const FONT_DESC_KEYS = {
  system: 'fontSystemDesc',
  readable: 'fontReadableDesc',
  compact: 'fontCompactDesc',
  editorial: 'fontEditorialDesc',
};
const FONT_SIZE_AREAS = ['header', 'cards', 'tabs'];
const FONT_SIZE_VALUES = ['small', 'default', 'large'];
const FONT_SIZE_STORAGE_KEY = 'tab-out-font-size-overrides';
const FONT_SIZE_AREA_KEYS = {
  header: 'fontSizeHeader',
  cards: 'fontSizeCards',
  tabs: 'fontSizeTabs',
};
const FONT_SIZE_VALUE_KEYS = {
  small: 'fontSizeSmall',
  default: 'fontSizeDefault',
  large: 'fontSizeLarge',
};
const FONT_SIZE_SHORT_KEYS = {
  small: 'fontSizeSmallShort',
  default: 'fontSizeDefaultShort',
  large: 'fontSizeLargeShort',
};

function fontSizeDataKey(area) {
  return `size${area.charAt(0).toUpperCase()}${area.slice(1)}`;
}

function normalizeFontSizeSettings(settings = {}) {
  return FONT_SIZE_AREAS.reduce((next, area) => {
    const value = settings && FONT_SIZE_VALUES.includes(settings[area])
      ? settings[area]
      : 'default';
    next[area] = value;
    return next;
  }, {});
}

function getActiveFontPreset() {
  const preset = document.documentElement.dataset.fontPreset;
  return FONT_PRESETS.includes(preset) ? preset : 'system';
}

function applyFontPreset(preset, { save = false } = {}) {
  if (!FONT_PRESETS.includes(preset)) return;
  document.documentElement.dataset.fontPreset = preset;
  if (save) {
    try { localStorage.setItem(FONT_STORAGE_KEY, preset); } catch {}
  }
  syncFontControls();
}

function getActiveFontSizeSettings() {
  const fromDataset = FONT_SIZE_AREAS.reduce((settings, area) => {
    const value = document.documentElement.dataset[fontSizeDataKey(area)];
    settings[area] = FONT_SIZE_VALUES.includes(value) ? value : 'default';
    return settings;
  }, {});
  return normalizeFontSizeSettings(fromDataset);
}

function applyFontSizeSettings(settings, { save = false } = {}) {
  const normalized = normalizeFontSizeSettings(settings);
  FONT_SIZE_AREAS.forEach(area => {
    document.documentElement.dataset[fontSizeDataKey(area)] = normalized[area];
  });
  if (save) {
    try { localStorage.setItem(FONT_SIZE_STORAGE_KEY, JSON.stringify(normalized)); } catch {}
  }
  syncFontControls();
}

function syncFontControls() {
  const active = getActiveFontPreset();
  const label = tr(FONT_LABEL_KEYS[active] || 'fontSystem');
  const sizeSettings = getActiveFontSizeSettings();

  document.querySelectorAll('.font-option[data-font-preset]').forEach(btn => {
    const selected = btn.dataset.fontPreset === active;
    btn.setAttribute('aria-pressed', selected ? 'true' : 'false');
    btn.setAttribute('aria-checked', selected ? 'true' : 'false');
    btn.classList.toggle('active', selected);

    const preset = btn.dataset.fontPreset;
    const labelEl = btn.querySelector('.font-option-label');
    const descEl = btn.querySelector('.font-option-desc');
    const labelKey = FONT_LABEL_KEYS[preset];
    const descKey = FONT_DESC_KEYS[preset];
    if (labelEl && labelKey) labelEl.textContent = tr(labelKey);
    if (descEl && descKey) descEl.textContent = tr(descKey);
    if (labelKey) btn.setAttribute('title', tr(labelKey));
  });

  document.querySelectorAll('[data-font-copy]').forEach(el => {
    el.textContent = tr(el.dataset.fontCopy);
  });

  const sizeControls = document.querySelector('.font-size-controls');
  if (sizeControls) sizeControls.setAttribute('aria-label', tr('fontSizeByArea'));

  document.querySelectorAll('.font-size-segment').forEach(segment => {
    const area = segment.querySelector('.font-size-option[data-font-size-area]')?.dataset.fontSizeArea;
    const key = FONT_SIZE_AREA_KEYS[area];
    if (key) segment.setAttribute('aria-label', tr(key));
  });

  document.querySelectorAll('.font-size-option[data-font-size-area][data-font-size-value]').forEach(btn => {
    const area = btn.dataset.fontSizeArea;
    const value = btn.dataset.fontSizeValue;
    const selected = sizeSettings[area] === value;
    btn.setAttribute('aria-pressed', selected ? 'true' : 'false');
    const areaLabel = tr(FONT_SIZE_AREA_KEYS[area] || 'fontSizeByArea');
    const valueLabel = tr(FONT_SIZE_VALUE_KEYS[value] || 'fontSizeDefault');
    btn.textContent = tr(FONT_SIZE_SHORT_KEYS[value] || 'fontSizeDefaultShort');
    btn.setAttribute('title', `${areaLabel}: ${valueLabel}`);
    btn.setAttribute('aria-label', `${areaLabel}: ${valueLabel}`);
  });

  const activeLabel = document.getElementById('activeFontLabel');
  if (activeLabel) activeLabel.textContent = tr('fontEntryLabel');

  const currentBtn = document.getElementById('fontCurrentBtn');
  if (currentBtn) {
    const title = tr('fontCurrentTitle', { font: label });
    currentBtn.setAttribute('title', title);
    currentBtn.setAttribute('aria-label', title);
  }
}

function setFontMenuOpen(open) {
  const picker = document.getElementById('fontPicker');
  const button = document.getElementById('fontCurrentBtn');
  if (!picker || !button) return;
  picker.classList.toggle('font-menu-open', open);
  button.setAttribute('aria-expanded', open ? 'true' : 'false');
}

function toggleFontMenu() {
  const picker = document.getElementById('fontPicker');
  setFontMenuOpen(!picker?.classList.contains('font-menu-open'));
}

function initFontSwitcher() {
  applyFontPreset(getActiveFontPreset(), { save: false });
  applyFontSizeSettings(getActiveFontSizeSettings(), { save: false });
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
    dockToolsTitle: 'Open tools dock',
    privacyToggleTitle: 'Toggle privacy mode (Esc)',
    themeLabel: 'Theme',
    themeWarm: 'Warm Parchment',
    themeWhite: 'Ivory Page',
    themeSystem: 'Adaptive Glow',
    themeMaterial: 'Material Orbit',
    themeCupertino: 'Cupertino Mist',
    themeMidnight: 'Midnight Voyage',
    themeArctic: 'Frost Field',
    themeForest: 'Forest Isle',
    themeGraphite: 'Graphite Gold',
    themeCoast: 'Coral Tide',
    themePlum: 'Plum Shade',
    themeMatcha: 'Matcha Haze',
    themeEmber: 'Ember Slate',
    themeLavender: 'Lavender Breeze',
    themeCurrentTitle: ({ theme }) => `Theme: ${theme}`,
    fontLabel: 'Typography',
    fontEntryLabel: 'Text',
    fontSystem: 'System',
    fontReadable: 'Readable',
    fontCompact: 'Compact',
    fontEditorial: 'Editorial',
    fontSystemDesc: 'Native UI font',
    fontReadableDesc: 'Larger, looser rows',
    fontCompactDesc: 'More tabs per screen',
    fontEditorialDesc: 'Serif-led headings',
    fontCurrentTitle: ({ font }) => `Typography: ${font}`,
    fontSizeByArea: 'Size by area',
    fontSizeHeader: 'Header',
    fontSizeCards: 'Cards',
    fontSizeTabs: 'Tab rows',
    fontSizeSmall: 'Small',
    fontSizeDefault: 'Default',
    fontSizeLarge: 'Large',
    fontSizeSmallShort: 'S',
    fontSizeDefaultShort: 'M',
    fontSizeLargeShort: 'L',
    privacyHint: 'Press <kbd>Esc</kbd> to show your tabs',
    privacySettingsTitle: 'Customize privacy screen',
    customize: 'Customize',
    clock: 'Clock',
    date: 'Date',
    customText: 'Custom text',
    externalFavicons: 'Load site icons',
    mottoPlaceholder: 'Type your text here...',
    closeExtras: 'Close extras',
    search: 'Filter tabs',
    savedForLater: 'Saved for later',
    savedSessionsTitle: 'Saved sessions',
    savedSessionsEmpty: 'No saved sessions yet.',
    deferredEmpty: 'Nothing saved. Living in the moment.',
    archive: 'Archive',
    clearArchive: 'Clear',
    archiveSearchPlaceholder: 'Filter archived tabs...',
    openTabsStat: 'Open tabs',
    tabHealthStat: 'Tab health',
    closedWeekStat: 'Closed this week',
    savedWeekStat: 'Saved this week',
    creditAttribution: 'Apache-2.0 &middot; Based on <a href="https://github.com/zarazhangrui/tab-out" target="_top">Tab Out</a> (MIT)',
    greetingMorning: 'Good morning',
    greetingAfternoon: 'Good afternoon',
    greetingEvening: 'Good evening',
    openTabsTitle: 'Open tabs',
    homepages: 'Homepages',
    localFiles: 'Local files',
    tabsLabel: 'tabs',
    viewGroups: 'Groups',
    viewDomains: 'Domains',
    viewModeLabel: 'View mode',
    notGrouped: 'To sort',
    ungroupedInboxHint: 'Ungrouped tabs',
    smartGroup: 'Smart group',
    smartGroupHint: 'Group ungrouped tabs by domain when 2 or more tabs match.',
    saveAll: 'Save all',
    createGroupFromDomain: 'Create group',
    unnamedGroup: '(unnamed)',
    saveForLater: 'Save for later',
    closeThisTab: 'Close this tab',
    focusThisTab: 'Jump to this tab',
    expandHiddenTabs: 'Show hidden tabs',
    dismiss: 'Dismiss',
    ungroup: 'Ungroup',
    createGroup: 'Create group',
    renameGroup: 'Rename',
    recolorGroup: 'Change color',
    groupActions: 'Group actions',
    moreActions: 'More actions',
    groupColorPickerLabel: 'Group color',
    groupColorCurrent: 'Current',
    groupColorGrey: 'Grey',
    groupColorBlue: 'Blue',
    groupColorRed: 'Red',
    groupColorYellow: 'Yellow',
    groupColorGreen: 'Green',
    groupColorPink: 'Pink',
    groupColorPurple: 'Purple',
    groupColorCyan: 'Cyan',
    groupColorOrange: 'Orange',
    collapseGroup: 'Collapse',
    expandGroup: 'Expand',
    saveGroup: 'Save session',
    restoreSession: 'Restore',
    deleteSession: 'Delete',
    undo: 'Undo',
    savedSessionTabs: ({ count }) => `${count} tab${count !== 1 ? 's' : ''}`,
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
    toastClosedUngrouped: ({ count }) => `Closed ${count} ungrouped tab${count !== 1 ? 's' : ''}`,
    toastClosedDuplicates: 'Closed duplicates, kept one copy each',
    toastClosedChromeGroup: ({ count }) => `Closed ${count} tab${count !== 1 ? 's' : ''} from group`,
    toastUngrouped: ({ count }) => `Ungrouped ${count} tab${count !== 1 ? 's' : ''}`,
    toastAllTabsClosed: 'All tabs closed. Fresh start.',
    toastGroupCreated: 'Created Chrome tab group',
    toastSmartGrouped: ({ count }) => `Created ${count} smart group${count !== 1 ? 's' : ''}`,
    toastSmartGroupNone: 'No matching tabs to group yet',
    toastGroupUpdated: 'Updated Chrome tab group',
    toastGroupUpdateFailed: 'Could not update Chrome tab group',
    toastGroupSaved: 'Saved group as a session',
    toastSessionSaved: 'Session saved',
    toastSessionRestored: 'Session restored as a Chrome tab group',
    toastSessionRestoreFailed: 'Could not restore saved session',
    toastSessionDeleted: ({ title }) => `Deleted "${title}"`,
    toastSessionRestoredFromUndo: 'Saved session restored',
    toastArchiveCleared: ({ count }) => `Cleared ${count} archived item${count !== 1 ? 's' : ''}`,
    toastArchiveRestored: ({ count }) => `Restored ${count} archived item${count !== 1 ? 's' : ''}`,
    toastStorageQuota: 'Local storage is full. Archive or remove saved items, then try again.',
    toastStorageFailed: 'Could not update local storage.',
  },
  zh: {
    documentTitle: 'Super Tab Out',
    languageLabel: '语言',
    dockToolsTitle: '打开工具栏',
    privacyToggleTitle: '切换隐私模式（Esc）',
    themeLabel: '主题',
    themeWarm: '暖笺',
    themeWhite: '素笺',
    themeSystem: '随光',
    themeMaterial: '星轨',
    themeCupertino: '雾岸',
    themeMidnight: '夜航',
    themeArctic: '霜原',
    themeForest: '森屿',
    themeGraphite: '墨金',
    themeCoast: '珊潮',
    themePlum: '梅影',
    themeMatcha: '茶岚',
    themeEmber: '烬岩',
    themeLavender: '薰风',
    themeCurrentTitle: ({ theme }) => `主题：${theme}`,
    fontLabel: '字体与密度',
    fontEntryLabel: '字体',
    fontSystem: '系统',
    fontReadable: '易读',
    fontCompact: '紧凑',
    fontEditorial: '杂志感',
    fontSystemDesc: '使用本机界面字体',
    fontReadableDesc: '更大字号和更松行距',
    fontCompactDesc: '一屏显示更多标签',
    fontEditorialDesc: '标题使用衬线气质',
    fontCurrentTitle: ({ font }) => `字体与密度：${font}`,
    fontSizeByArea: '按区域调字号',
    fontSizeHeader: '标题',
    fontSizeCards: '卡片',
    fontSizeTabs: '标签行',
    fontSizeSmall: '小',
    fontSizeDefault: '默认',
    fontSizeLarge: '大',
    fontSizeSmallShort: '小',
    fontSizeDefaultShort: '中',
    fontSizeLargeShort: '大',
    privacyHint: '按 <kbd>Esc</kbd> 显示标签页',
    privacySettingsTitle: '自定义隐私屏幕',
    customize: '自定义',
    clock: '时钟',
    date: '日期',
    customText: '自定义文字',
    externalFavicons: '加载网站图标',
    mottoPlaceholder: '输入你的文字...',
    closeExtras: '关闭多余项',
    search: '过滤标签页',
    savedForLater: '稍后再看',
    savedSessionsTitle: '已保存会话',
    savedSessionsEmpty: '还没有保存会话。',
    deferredEmpty: '没有保存内容。活在当下。',
    archive: '归档',
    clearArchive: '清空',
    archiveSearchPlaceholder: '过滤已归档标签...',
    openTabsStat: '打开的标签页',
    tabHealthStat: '健康分',
    closedWeekStat: '本周关闭',
    savedWeekStat: '本周保存',
    creditAttribution: 'Apache-2.0 &middot; 基于 <a href="https://github.com/zarazhangrui/tab-out" target="_top">Tab Out</a> (MIT)',
    greetingMorning: '早上好',
    greetingAfternoon: '下午好',
    greetingEvening: '晚上好',
    openTabsTitle: '打开的标签页',
    homepages: '首页',
    localFiles: '本地文件',
    tabsLabel: '标签页',
    viewGroups: '分组',
    viewDomains: '域名',
    viewModeLabel: '视图模式',
    notGrouped: '待整理',
    ungroupedInboxHint: '未归组标签页',
    smartGroup: '智能分组',
    smartGroupHint: '按域名整理未归组标签页；同一域名达到 2 个及以上才会成组。',
    saveAll: '保存全部',
    createGroupFromDomain: '创建分组',
    unnamedGroup: '（未命名）',
    saveForLater: '稍后再看',
    closeThisTab: '关闭这个标签页',
    focusThisTab: '跳转到这个标签页',
    expandHiddenTabs: '显示隐藏标签页',
    dismiss: '移除',
    ungroup: '解除分组',
    createGroup: '创建分组',
    renameGroup: '重命名',
    recolorGroup: '更改颜色',
    groupActions: '分组操作',
    moreActions: '更多操作',
    groupColorPickerLabel: '分组颜色',
    groupColorCurrent: '当前',
    groupColorGrey: '灰色',
    groupColorBlue: '蓝色',
    groupColorRed: '红色',
    groupColorYellow: '黄色',
    groupColorGreen: '绿色',
    groupColorPink: '粉色',
    groupColorPurple: '紫色',
    groupColorCyan: '青色',
    groupColorOrange: '橙色',
    collapseGroup: '折叠',
    expandGroup: '展开',
    saveGroup: '保存会话',
    restoreSession: '恢复',
    deleteSession: '删除',
    undo: '撤销',
    savedSessionTabs: ({ count }) => `${count} 个标签页`,
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
    toastClosedUngrouped: ({ count }) => `已关闭 ${count} 个待整理标签页`,
    toastClosedDuplicates: '已关闭重复项，并保留一份',
    toastClosedChromeGroup: ({ count }) => `已从分组关闭 ${count} 个标签页`,
    toastUngrouped: ({ count }) => `已取消 ${count} 个标签页的分组`,
    toastAllTabsClosed: '所有标签页已关闭。重新开始。',
    toastGroupCreated: '已创建 Chrome 标签分组',
    toastSmartGrouped: ({ count }) => `已创建 ${count} 个智能分组`,
    toastSmartGroupNone: '暂时没有可自动分组的标签页',
    toastGroupUpdated: '已更新 Chrome 标签分组',
    toastGroupUpdateFailed: '无法更新 Chrome 标签分组',
    toastGroupSaved: '已将分组保存为会话',
    toastSessionSaved: '会话已保存',
    toastSessionRestored: '已恢复为 Chrome 标签分组',
    toastSessionRestoreFailed: '无法恢复保存的会话',
    toastSessionDeleted: ({ title }) => `已删除「${title}」`,
    toastSessionRestoredFromUndo: '已恢复保存的会话',
    toastArchiveCleared: ({ count }) => `已清空 ${count} 个归档条目`,
    toastArchiveRestored: ({ count }) => `已恢复 ${count} 个归档条目`,
    toastStorageQuota: '本地存储已满。请归档或删除一些已保存条目后重试。',
    toastStorageFailed: '无法更新本地存储。',
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
  const fontMenu = document.getElementById('fontMenu');
  if (fontMenu) fontMenu.setAttribute('aria-label', tr('fontLabel'));

  const commandDockToolsBtn = document.getElementById('commandDockToolsBtn');
  if (commandDockToolsBtn) {
    commandDockToolsBtn.setAttribute('title', tr('dockToolsTitle'));
    commandDockToolsBtn.setAttribute('aria-label', tr('dockToolsTitle'));
  }

  const privacyToggle = document.getElementById('privacyToggle');
  if (privacyToggle) {
    privacyToggle.setAttribute('title', tr('privacyToggleTitle'));
    privacyToggle.setAttribute('aria-label', tr('privacyToggleTitle'));
  }
  const privacySettingsBtn = document.getElementById('privacySettingsBtn');
  if (privacySettingsBtn) privacySettingsBtn.setAttribute('aria-label', tr('privacySettingsTitle'));

  syncThemeControls();
  syncFontControls();

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
  document.dispatchEvent(new CustomEvent('super-tab-out-language-change', { detail: { language: activeLanguage } }));
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
  if (StorageService?.addDeferredTab) {
    await StorageService.addDeferredTab(tab);
    return;
  }
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
  if (StorageService?.getSavedTabs) return await StorageService.getSavedTabs();
  const { deferred = [] } = await chrome.storage.local.get('deferred');
  const visible = deferred.filter(t => !t.dismissed);
  return {
    active:   visible.filter(t => !t.completed),
    archived: visible.filter(t => t.completed),
  };
}

async function getSavedSessions() {
  if (StorageService?.getSavedSessions) return await StorageService.getSavedSessions();
  try {
    const { savedSessions = [] } = await chrome.storage.local.get('savedSessions');
    return Array.isArray(savedSessions) ? savedSessions : [];
  } catch {
    return [];
  }
}

async function addSavedSession(session) {
  if (StorageService?.addSavedSession) {
    await StorageService.addSavedSession(session);
    return;
  }
  const { savedSessions = [] } = await chrome.storage.local.get('savedSessions');
  savedSessions.unshift(session);
  await chrome.storage.local.set({ savedSessions });
}

async function removeSavedSession(id) {
  if (StorageService?.removeSavedSession) {
    return await StorageService.removeSavedSession(id);
  }
  const { savedSessions = [] } = await chrome.storage.local.get('savedSessions');
  const currentSessions = Array.isArray(savedSessions) ? savedSessions : [];
  const nextSessions = currentSessions.filter(session => session.id !== id);
  await chrome.storage.local.set({ savedSessions: nextSessions });
  return nextSessions.length !== currentSessions.length;
}

async function restoreSavedSession(session, index = 0) {
  const sessions = await getSavedSessions();
  if (!session?.id || sessions.some(item => item.id === session.id)) return false;
  const nextSessions = sessions.slice();
  const insertIndex = Math.max(0, Math.min(Number(index) || 0, nextSessions.length));
  nextSessions.splice(insertIndex, 0, session);
  if (StorageService?.setSavedSessions) await StorageService.setSavedSessions(nextSessions);
  else await chrome.storage.local.set({ savedSessions: nextSessions });
  return true;
}

async function recordActivity(event) {
  try {
    if (StorageService?.recordActivity) await StorageService.recordActivity(event);
  } catch {}
}

async function saveTabsAsSession(tabs, name) {
  const sessionTabs = (tabs || [])
    .filter(tab => tab?.url && !tab.pinned)
    .sort((a, b) => {
      if (a.windowId !== b.windowId) return a.windowId - b.windowId;
      return (a.index || 0) - (b.index || 0);
    });

  const session = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: name || `Session ${new Date().toLocaleString()}`,
    savedAt: new Date().toISOString(),
    group: sessionTabs.find(tab => tab.groupTitle)?.groupTitle || name || '',
    groupColor: sessionTabs.find(tab => tab.groupColor)?.groupColor || '',
    tabs: sessionTabs.map(tab => ({
      url: tab.url,
      title: tab.title || tab.url,
      pinned: tab.pinned === true,
      windowId: tab.windowId,
      index: tab.index,
      groupTitle: tab.groupTitle || '',
      groupColor: tab.groupColor || '',
    })),
    urls: sessionTabs.map(tab => tab.url),
  };
  await addSavedSession(session);
  await recordActivity({ type: 'sessionSaved', count: 1 });
  return session;
}

async function restoreSavedSessionToChrome(session) {
  if (TabsService?.restoreSavedSession) {
    let windowId = null;
    try {
      windowId = (await chrome.windows.getCurrent())?.id;
    } catch {}
    return await TabsService.restoreSavedSession(session, {
      windowId,
      focused: false,
      active: false,
    });
  }
  const urls = session?.urls?.length ? session.urls : (session?.tabs || []).map(tab => tab.url);
  if (!urls.length) return null;
  return await chrome.windows.create({ url: urls });
}

/**
 * checkOffSavedTab(id)
 *
 * Marks a saved tab as completed (checked off). It moves to the archive.
 */
async function checkOffSavedTab(id) {
  if (StorageService?.updateDeferredTab) {
    await StorageService.updateDeferredTab(id, {
      completed: true,
      completedAt: new Date().toISOString(),
    });
    return;
  }
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
  if (StorageService?.updateDeferredTab) {
    await StorageService.updateDeferredTab(id, { dismissed: true });
    return;
  }
  const { deferred = [] } = await chrome.storage.local.get('deferred');
  const tab = deferred.find(t => t.id === id);
  if (tab) {
    tab.dismissed = true;
    await chrome.storage.local.set({ deferred });
  }
}

async function clearArchivedSavedTabs() {
  if (StorageService?.clearArchivedDeferredTabs) {
    return await StorageService.clearArchivedDeferredTabs();
  }
  const { deferred = [] } = await chrome.storage.local.get('deferred');
  const current = Array.isArray(deferred) ? deferred : [];
  const next = current.filter(tab => !tab.completed);
  await chrome.storage.local.set({ deferred: next });
  return current.length - next.length;
}

async function restoreArchivedSavedTabs(archivedTabs) {
  const archived = Array.isArray(archivedTabs) ? archivedTabs : [];
  if (archived.length === 0) return 0;

  const current = StorageService?.getDeferred
    ? await StorageService.getDeferred()
    : ((await chrome.storage.local.get('deferred')).deferred || []);
  const currentList = Array.isArray(current) ? current : [];
  const existingIds = new Set(currentList.map(tab => tab.id).filter(Boolean));
  const toRestore = archived.filter(tab => tab?.id && !existingIds.has(tab.id));
  if (toRestore.length === 0) return 0;

  const next = [...currentList, ...toRestore];
  if (StorageService?.setDeferred) await StorageService.setDeferred(next);
  else await chrome.storage.local.set({ deferred: next });
  return toRestore.length;
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

function prefersReducedMotion() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
}

/**
 * shootConfetti(x, y)
 *
 * Shoots a burst of colorful confetti particles from the given screen
 * coordinates (typically the center of a card being closed).
 * Pure CSS + JS, no libraries.
 */
function shootConfetti(x, y) {
  if (prefersReducedMotion()) return;
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
  if (prefersReducedMotion()) {
    card.remove();
    checkAndShowEmptyState();
    return;
  }

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
let toastHideTimer = null;
let toastActionCleanup = null;

function showToast(message, options = {}) {
  const toast = document.getElementById('toast');
  const text = document.getElementById('toastText');
  if (!toast || !text) return;

  if (toastHideTimer) clearTimeout(toastHideTimer);
  if (typeof toastActionCleanup === 'function') toastActionCleanup();
  toastActionCleanup = null;

  text.textContent = message;
  toast.querySelector('.toast-action')?.remove();

  if (options.actionLabel && typeof options.onAction === 'function') {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'toast-action';
    button.textContent = options.actionLabel;
    const handleAction = async () => {
      button.disabled = true;
      if (toastHideTimer) clearTimeout(toastHideTimer);
      toast.classList.remove('visible');
      try { await options.onAction(); } catch (err) {
        console.error('[tab-out] Toast action failed:', err);
        showToast(tr('toastStorageFailed'));
      }
    };
    button.addEventListener('click', handleAction);
    toastActionCleanup = () => button.removeEventListener('click', handleAction);
    toast.appendChild(button);
  }

  toast.classList.add('visible');
  toastHideTimer = setTimeout(() => {
    toast.classList.remove('visible');
    toastHideTimer = null;
  }, options.duration || (options.actionLabel ? 7000 : 2500));
}

function initStorageErrorToasts() {
  if (!StorageService?.onStorageError) return;
  StorageService.onStorageError((detail) => {
    showToast(tr(detail.quota ? 'toastStorageQuota' : 'toastStorageFailed'));
  });
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
  if (window.SuperTabOutHtml?.escapeHtml) return window.SuperTabOutHtml.escapeHtml(str);
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
let externalFaviconsEnabled = true;

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
  if (!externalFaviconsEnabled) return '';
  return `https://icons.duckduckgo.com/ip3/${encodeURIComponent(domain)}.ico`;
}

// Snapshot a freshly-loaded favicon <img> into localStorage. Needs the
// image to be CORS-clean (data URL or anonymous cross-origin), which is
// why the rendered <img> tag carries crossorigin="anonymous". If the
// canvas gets tainted we silently give up — next render just refetches.
function cacheFaviconFromImg(domain, img) {
  if (!externalFaviconsEnabled) return;
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
  more:    `<svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 24 24"><path d="M5 10.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Zm7 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Zm7 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Z" /></svg>`,
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
  const extensionId = typeof chrome !== 'undefined' ? (chrome.runtime?.id || '') : '';
  if (TabsService?.isRealTab) {
    return openTabs.filter(t => TabsService.isRealTab(t, extensionId));
  }
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
    return `<div class="page-chip clickable${chipClass}" data-action="focus-tab" data-tab-url="${safeUrl}" title="${safeTitle}" role="button" tabindex="0" aria-label="${escapeHtml(tr('focusThisTab'))}: ${safeTitle}">
      ${faviconUrl ? `<img class="chip-favicon" src="${escapeHtml(faviconUrl)}" alt="" crossorigin="anonymous" data-favicon-domain="${escapeHtml(domain)}">` : ''}
      <span class="chip-text">${escapeHtml(label)}</span>${dupeTag}
      <div class="chip-actions">
        <button class="chip-action chip-save" data-action="defer-single-tab" data-tab-url="${safeUrl}" data-tab-title="${safeTitle}" title="${escapeHtml(tr('saveForLater'))}" aria-label="${escapeHtml(tr('saveForLater'))}: ${safeTitle}">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0 1 11.186 0Z" /></svg>
        </button>
        <button class="chip-action chip-close" data-action="close-single-tab" data-tab-url="${safeUrl}" title="${escapeHtml(tr('closeThisTab'))}" aria-label="${escapeHtml(tr('closeThisTab'))}: ${safeTitle}">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
        </button>
      </div>
    </div>`;
  }).join('');

  return `
    <div class="page-chips-overflow" style="display:none">${hiddenChips}</div>
    <div class="page-chip page-chip-overflow clickable" data-action="expand-chips" role="button" tabindex="0" aria-label="${escapeHtml(tr('expandHiddenTabs'))}">
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
    return `<div class="page-chip clickable${chipClass}" data-action="focus-tab" data-tab-url="${safeUrl}" title="${safeTitle}" role="button" tabindex="0" aria-label="${escapeHtml(tr('focusThisTab'))}: ${safeTitle}">
      ${faviconUrl ? `<img class="chip-favicon" src="${escapeHtml(faviconUrl)}" alt="" crossorigin="anonymous" data-favicon-domain="${escapeHtml(domain)}">` : ''}
      <span class="chip-text">${escapeHtml(label)}</span>${dupeTag}
      <div class="chip-actions">
        <button class="chip-action chip-save" data-action="defer-single-tab" data-tab-url="${safeUrl}" data-tab-title="${safeTitle}" title="${escapeHtml(tr('saveForLater'))}" aria-label="${escapeHtml(tr('saveForLater'))}: ${safeTitle}">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0 1 11.186 0Z" /></svg>
        </button>
        <button class="chip-action chip-close" data-action="close-single-tab" data-tab-url="${safeUrl}" title="${escapeHtml(tr('closeThisTab'))}" aria-label="${escapeHtml(tr('closeThisTab'))}: ${safeTitle}">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
        </button>
      </div>
    </div>`;
  }).join('') + (extraCount > 0 ? buildOverflowChips(uniqueTabs.slice(8), urlCounts) : '');

  let actionsHtml = `
    <button class="action-btn close-tabs" data-action="close-domain-tabs" data-domain-key="${safeDomainKey}">
      ${ICONS.close}
      ${escapeHtml(tr('closeAllTabs', { count: tabCount }))}
    </button>
    <button class="action-btn" data-action="create-native-group" data-domain-key="${safeDomainKey}">
      ${escapeHtml(tr('createGroup'))}
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
      updateDashboardSideVisibility();
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
  } finally {
    updateDashboardSideVisibility();
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
    <div class="deferred-item" data-deferred-id="${safeId}" data-search-url="${safeUrl}" data-search-title="${safeTitle}" data-search-domain="${escapeHtml(domain)}">
      <input type="checkbox" class="deferred-checkbox" data-action="check-deferred" data-deferred-id="${safeId}">
      <div class="deferred-info">
        <a href="${safeUrl}" target="_blank" rel="noopener noreferrer" class="deferred-title" title="${safeTitle}">
          ${faviconUrl ? `<img src="${escapeHtml(faviconUrl)}" alt="" style="width:14px;height:14px;vertical-align:-2px;margin-right:4px" crossorigin="anonymous" data-favicon-domain="${escapeHtml(domain)}">` : ''}<span class="deferred-title-text">${safeTitle}</span>
        </a>
        <div class="deferred-meta">
          <span class="deferred-domain-text">${escapeHtml(domain)}</span>
          <span>${escapeHtml(ago)}</span>
        </div>
      </div>
      <button class="deferred-dismiss" data-action="dismiss-deferred" data-deferred-id="${safeId}" title="${escapeHtml(tr('dismiss'))}" aria-label="${escapeHtml(tr('dismiss'))}: ${safeTitle}">
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
  const safeId    = escapeHtml(item.id);
  const safeUrl   = escapeHtml(isSafeNavUrl(item.url) ? item.url : '#');
  const safeTitle = escapeHtml(item.title || item.url || '');
  let domain = '';
  try { domain = new URL(item.url).hostname.replace(/^www\./, ''); } catch {}
  return `
    <div class="archive-item" data-deferred-id="${safeId}" data-search-url="${safeUrl}" data-search-title="${safeTitle}" data-search-domain="${escapeHtml(domain)}">
      <a href="${safeUrl}" target="_blank" rel="noopener noreferrer" class="archive-item-title" title="${safeTitle}">
        <span class="archive-item-title-text">${safeTitle}</span>
      </a>
      <span class="archive-item-date">${escapeHtml(ago)}</span>
    </div>`;
}

function updateDashboardSideVisibility() {
  const side = document.getElementById('dashboardSide');
  if (!side) return;
  const hasVisiblePanel = Array.from(side.children).some(child => child.style.display !== 'none');
  side.style.display = hasVisiblePanel ? 'flex' : 'none';
}

function savedSessionTabs(session) {
  if (Array.isArray(session?.tabs) && session.tabs.length > 0) return session.tabs;
  return (Array.isArray(session?.urls) ? session.urls : [])
    .filter(url => typeof url === 'string' && url.length > 0)
    .map(url => ({ url, title: url }));
}

function savedSessionDomains(session) {
  const domains = [];
  for (const tab of savedSessionTabs(session)) {
    try {
      const domain = new URL(tab.url).hostname.replace(/^www\./, '');
      if (domain && !domains.includes(domain)) domains.push(domain);
    } catch {}
  }
  return domains;
}

function savedSessionGroupColor(session) {
  const colorName = session?.groupColor || savedSessionTabs(session).find(tab => tab.groupColor)?.groupColor || '';
  return CHROME_GROUP_COLORS[colorName] || CHROME_GROUP_COLORS.grey;
}

function renderSavedSessionItem(session) {
  const tabs = savedSessionTabs(session);
  const domains = savedSessionDomains(session);
  const title = session.group || session.name || session.title || tr('savedSessionsTitle');
  const preview = domains.slice(0, 3).join(' · ') || tabs[0]?.url || '';
  const safeId = escapeHtml(session.id || '');
  const safeTitle = escapeHtml(title);
  const safePreview = escapeHtml(preview);
  const tabCount = tabs.length;
  const ago = timeAgo(session.savedAt);
  const color = savedSessionGroupColor(session);

  return `
    <article class="saved-session-item" data-session-id="${safeId}">
      <div class="saved-session-color" style="background:${escapeHtml(color)}"></div>
      <div class="saved-session-main">
        <div class="saved-session-title" title="${safeTitle}">
          <span class="saved-session-title-text">${safeTitle}</span>
        </div>
        <div class="saved-session-meta">
          <span>${escapeHtml(tr('savedSessionTabs', { count: tabCount }))}</span>
          <span>${escapeHtml(ago)}</span>
        </div>
        <div class="saved-session-preview">
          <span class="saved-session-preview-text">${safePreview}</span>
        </div>
        <div class="saved-session-actions">
          <button class="saved-session-action" data-action="restore-saved-session" data-session-id="${safeId}">
            ${escapeHtml(tr('restoreSession'))}
          </button>
          <button class="saved-session-action saved-session-delete" data-action="delete-saved-session" data-session-id="${safeId}">
            ${escapeHtml(tr('deleteSession'))}
          </button>
        </div>
      </div>
    </article>`;
}

async function renderSavedSessionsCard() {
  const card = document.getElementById('savedSessionsCard');
  const list = document.getElementById('savedSessionsList');
  const countEl = document.getElementById('savedSessionsCount');
  const empty = document.getElementById('savedSessionsEmpty');
  if (!card || !list) return;

  try {
    const sessions = await getSavedSessions();
    if (sessions.length === 0) {
      card.style.display = 'none';
      updateDashboardSideVisibility();
      return;
    }

    card.style.display = 'block';
    list.innerHTML = sessions.map(renderSavedSessionItem).join('');
    list.style.display = 'flex';
    if (countEl) countEl.textContent = tr('itemCount', { count: sessions.length });
    if (empty) empty.style.display = 'none';
  } catch (err) {
    console.warn('[tab-out] Could not load saved sessions:', err);
    card.style.display = 'none';
  } finally {
    updateDashboardSideVisibility();
  }
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

const CHROME_GROUP_COLOR_ORDER = Object.keys(CHROME_GROUP_COLORS);

const CHROME_GROUP_COLOR_LABEL_KEYS = {
  grey: 'groupColorGrey',
  blue: 'groupColorBlue',
  red: 'groupColorRed',
  yellow: 'groupColorYellow',
  green: 'groupColorGreen',
  pink: 'groupColorPink',
  purple: 'groupColorPurple',
  cyan: 'groupColorCyan',
  orange: 'groupColorOrange',
};

function isChromeGroupColor(colorName) {
  return Object.prototype.hasOwnProperty.call(CHROME_GROUP_COLORS, colorName);
}

function normalizeChromeGroupColor(colorName, fallback = 'grey') {
  const normalized = String(colorName || '').trim().toLowerCase();
  return isChromeGroupColor(normalized) ? normalized : fallback;
}

function getChromeGroupColorLabel(colorName) {
  const normalized = normalizeChromeGroupColor(colorName);
  return tr(CHROME_GROUP_COLOR_LABEL_KEYS[normalized]);
}

function buildGroupColorPicker(groupInfo) {
  const currentColor = normalizeChromeGroupColor(groupInfo.color);
  const currentLabel = getChromeGroupColorLabel(currentColor);
  const pickerId = `group-color-picker-${groupInfo.id}`;
  const buttonLabel = `${tr('recolorGroup')}: ${currentLabel}`;
  const colorOptions = CHROME_GROUP_COLOR_ORDER.map(colorName => {
    const selected = colorName === currentColor;
    const label = getChromeGroupColorLabel(colorName);
    const ariaLabel = selected
      ? `${label}, ${tr('groupColorCurrent')}`
      : label;
    return `
      <button class="group-color-option${selected ? ' is-selected' : ''}"
              data-action="set-group-color"
              data-group-id="${groupInfo.id}"
              data-group-color="${colorName}"
              role="radio"
              aria-checked="${selected ? 'true' : 'false'}"
              aria-label="${escapeHtml(ariaLabel)}"
              title="${escapeHtml(label)}"
              tabindex="${selected ? '0' : '-1'}">
        <span class="group-color-swatch" style="background:${CHROME_GROUP_COLORS[colorName]}" aria-hidden="true"></span>
      </button>`;
  }).join('');

  return `
    <span class="group-color-control" data-current-color="${currentColor}">
      <button class="action-btn group-color-btn"
              data-action="toggle-group-color-picker"
              data-group-id="${groupInfo.id}"
              aria-haspopup="true"
              aria-expanded="false"
              aria-controls="${pickerId}"
              aria-label="${escapeHtml(buttonLabel)}"
              title="${escapeHtml(buttonLabel)}">
        <span class="group-color-dot" style="background:${CHROME_GROUP_COLORS[currentColor]}" aria-hidden="true"></span>
        ${escapeHtml(tr('recolorGroup'))}
      </button>
      <span class="group-color-picker"
            id="${pickerId}"
            role="radiogroup"
            aria-label="${escapeHtml(tr('groupColorPickerLabel'))}"
            hidden>
        ${colorOptions}
      </span>
    </span>`;
}

function closeGroupColorPickers({ restoreFocus = false } = {}) {
  let focusTarget = null;
  document.querySelectorAll('.group-color-control.is-open').forEach(control => {
    const button = control.querySelector('.group-color-btn');
    const picker = control.querySelector('.group-color-picker');
    if (restoreFocus && control.contains(document.activeElement)) focusTarget = button;
    control.classList.remove('is-open');
    if (picker) picker.hidden = true;
    if (button) button.setAttribute('aria-expanded', 'false');
  });
  if (focusTarget) focusTarget.focus();
}

function setGroupColorPickerOpen(control, open, { focusSelected = false } = {}) {
  const button = control?.querySelector('.group-color-btn');
  const picker = control?.querySelector('.group-color-picker');
  if (!button || !picker) return;

  control.classList.toggle('is-open', open);
  picker.hidden = !open;
  button.setAttribute('aria-expanded', open ? 'true' : 'false');

  if (open && focusSelected) {
    const selected = picker.querySelector('.group-color-option.is-selected') || picker.querySelector('.group-color-option');
    selected?.focus();
  }
}

function toggleGroupColorPicker(button, { focusSelected = false } = {}) {
  const control = button?.closest('.group-color-control');
  if (!control) return;
  const wasOpen = control.classList.contains('is-open');
  closeGroupColorPickers();
  if (!wasOpen) setGroupColorPickerOpen(control, true, { focusSelected });
}

function closeGroupActionMenus({ restoreFocus = false } = {}) {
  let focusTarget = null;
  document.querySelectorAll('.group-action-menu-control.is-open').forEach(control => {
    const button = control.querySelector('.group-action-menu-btn');
    const menu = control.querySelector('.group-action-menu');
    if (restoreFocus && control.contains(document.activeElement)) focusTarget = button;
    control.classList.remove('is-open');
    if (menu) menu.hidden = true;
    if (button) button.setAttribute('aria-expanded', 'false');
  });
  if (focusTarget) focusTarget.focus();
}

function toggleGroupActionMenu(button, { focusFirst = false } = {}) {
  const control = button?.closest('.group-action-menu-control');
  const menu = control?.querySelector('.group-action-menu');
  if (!control || !menu) return;

  const wasOpen = control.classList.contains('is-open');
  closeGroupActionMenus();
  closeGroupColorPickers();

  if (wasOpen) return;
  control.classList.add('is-open');
  menu.hidden = false;
  button.setAttribute('aria-expanded', 'true');
  if (focusFirst) {
    const firstItem = menu.querySelector('button,[tabindex]:not([tabindex="-1"])');
    firstItem?.focus();
  }
}

function updateGroupColorControlState(groupId, colorName) {
  const normalized = normalizeChromeGroupColor(colorName);
  const colorHex = CHROME_GROUP_COLORS[normalized];
  const colorLabel = getChromeGroupColorLabel(normalized);
  const cardEl = document.querySelector(`[data-group-id="group-${groupId}"]`);
  if (!cardEl) return;

  cardEl.style.setProperty('--group-color', colorHex);
  const control = cardEl.querySelector('.group-color-control');
  const button = control?.querySelector('.group-color-btn');
  const dot = control?.querySelector('.group-color-dot');
  const buttonLabel = `${tr('recolorGroup')}: ${colorLabel}`;

  if (control) control.dataset.currentColor = normalized;
  if (dot) dot.style.background = colorHex;
  if (button) {
    button.setAttribute('aria-label', buttonLabel);
    button.setAttribute('title', buttonLabel);
  }

  control?.querySelectorAll('.group-color-option[data-group-color]').forEach(option => {
    const selected = option.dataset.groupColor === normalized;
    option.classList.toggle('is-selected', selected);
    option.setAttribute('aria-checked', selected ? 'true' : 'false');
    option.setAttribute('tabindex', selected ? '0' : '-1');
    const label = getChromeGroupColorLabel(option.dataset.groupColor);
    option.setAttribute(
      'aria-label',
      selected ? `${label}, ${tr('groupColorCurrent')}` : label
    );
  });
}

async function updateChromeTabGroup(groupId, options) {
  if (!Number.isFinite(groupId)) throw new Error('Invalid Chrome tab group id');
  if (TabsService?.updateGroup) {
    const updated = await TabsService.updateGroup(groupId, options);
    if (updated == null) throw new Error('Chrome tabGroups API unavailable');
    return updated;
  }
  if (typeof chrome !== 'undefined' && chrome?.tabGroups?.update) {
    return await chrome.tabGroups.update(groupId, options);
  }
  throw new Error('Chrome tabGroups API unavailable');
}

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
    return `<div class="page-chip clickable${chipClass}" data-action="focus-tab" data-tab-url="${safeUrl}" title="${safeTitle}" role="button" tabindex="0" aria-label="${escapeHtml(tr('focusThisTab'))}: ${safeTitle}">
      ${faviconUrl ? `<img class="chip-favicon" src="${escapeHtml(faviconUrl)}" alt="" crossorigin="anonymous" data-favicon-domain="${escapeHtml(domain)}">` : ''}
      <span class="chip-text">${escapeHtml(label)}</span>${dupeTag}
      <div class="chip-actions">
        <button class="chip-action chip-save" data-action="defer-single-tab" data-tab-url="${safeUrl}" data-tab-title="${safeTitle}" title="${escapeHtml(tr('saveForLater'))}" aria-label="${escapeHtml(tr('saveForLater'))}: ${safeTitle}">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0 1 11.186 0Z" /></svg>
        </button>
        <button class="chip-action chip-close" data-action="close-single-tab" data-tab-url="${safeUrl}" title="${escapeHtml(tr('closeThisTab'))}" aria-label="${escapeHtml(tr('closeThisTab'))}: ${safeTitle}">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
        </button>
      </div>
    </div>`;
  }).join('') + (extraCount > 0 ? buildOverflowChips(uniqueTabs.slice(8), urlCounts) : '');

  const tabBadge = `<span class="open-tabs-badge">${ICONS.tabs} ${escapeHtml(tr('tabsOpen', { count: tabCount }))}</span>`;
  const dupeBadge = hasDupes
    ? `<span class="open-tabs-badge dupe-count-badge" style="color:var(--accent-amber);background:rgba(200,113,58,0.08);">${escapeHtml(tr('duplicates', { count: totalExtras }))}</span>`
    : '';

  const collapseLabel = groupInfo.collapsed ? tr('expandGroup') : tr('collapseGroup');
  const actionsMenuId = `group-actions-menu-${groupInfo.id}`;
  const headerActionsHtml = `
    <div class="mission-top-actions">
      <span class="group-action-menu-control">
        <button class="icon-action-btn group-action-menu-btn"
                data-action="toggle-group-actions-menu"
                data-group-id="${groupInfo.id}"
                aria-haspopup="menu"
                aria-expanded="false"
                aria-controls="${actionsMenuId}"
                title="${escapeHtml(tr('moreActions'))}"
                aria-label="${escapeHtml(tr('groupActions'))}">
          ${ICONS.more}
        </button>
        <span class="group-action-menu" id="${actionsMenuId}" role="menu" aria-label="${escapeHtml(tr('groupActions'))}" hidden>
          <button class="group-menu-item" role="menuitem" data-action="rename-group" data-group-id="${groupInfo.id}">${escapeHtml(tr('renameGroup'))}</button>
          ${buildGroupColorPicker(groupInfo)}
          <button class="group-menu-item" role="menuitem" data-action="toggle-group-collapsed" data-group-id="${groupInfo.id}" data-collapsed="${groupInfo.collapsed ? 'true' : 'false'}">${escapeHtml(collapseLabel)}</button>
          <button class="group-menu-item" role="menuitem" data-action="save-group-session" data-group-id="${groupInfo.id}">${escapeHtml(tr('saveGroup'))}</button>
          <span class="group-menu-separator" aria-hidden="true"></span>
          <button class="group-menu-item" role="menuitem" data-action="ungroup-tabs" data-group-id="${groupInfo.id}">${escapeHtml(tr('ungroup'))}</button>
        </span>
      </span>
    </div>`;

  let actionsHtml = `
    <button class="action-btn close-tabs" data-action="close-group-tabs" data-group-id="${groupInfo.id}">
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
    <div class="mission-card group-card" data-group-id="group-${groupInfo.id}" style="--group-color:${color}">
      <div class="status-bar" style="background:${color}"></div>
      <div class="mission-content">
        <div class="mission-top">
          <span class="mission-name">${escapeHtml(name)}</span>
          <span class="mission-top-badges">${tabBadge}${dupeBadge}</span>
          ${headerActionsHtml}
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

function getUngroupedDomainKey(tab) {
  const url = tab?.url || '';
  if (url.startsWith('file://')) return 'local-files';
  try {
    return new URL(url).hostname.replace(/^www\./, '') || 'unknown';
  } catch {
    return 'unknown';
  }
}

function getUngroupedDomainGroups(ungroupedTabs) {
  const groups = new Map();
  for (const tab of ungroupedTabs) {
    const domain = getUngroupedDomainKey(tab);
    if (!groups.has(domain)) {
      groups.set(domain, {
        domain,
        label: domain === 'local-files' ? tr('localFiles') : friendlyDomain(domain),
        tabs: [],
        firstIndex: Number.isFinite(tab.index) ? tab.index : Number.MAX_SAFE_INTEGER,
      });
    }
    const group = groups.get(domain);
    group.tabs.push(tab);
    if (Number.isFinite(tab.index)) group.firstIndex = Math.min(group.firstIndex, tab.index);
  }
  return Array.from(groups.values()).sort((a, b) => a.firstIndex - b.firstIndex);
}

function renderUngroupedTabRow(tab, urlCounts) {
  const label = cleanTitle(smartTitle(stripTitleNoise(tab.title || ''), tab.url), '');
  const count = urlCounts[tab.url] || 1;
  const dupeTag = count > 1 ? ` <span class="chip-dupe-badge">(${count}x)</span>` : '';
  const chipClass = count > 1 ? ' chip-has-dupes' : '';
  const safeUrl = escapeHtml(tab.url || '');
  const safeTitle = escapeHtml(label);
  const domain = getUngroupedDomainKey(tab);
  const safeDomain = escapeHtml(domain);
  const faviconUrl = faviconUrlFor(domain);

  return `<article class="page-chip ungrouped-row clickable${chipClass}" data-action="focus-tab" data-tab-url="${safeUrl}" title="${safeTitle}" role="button" tabindex="0" aria-label="${escapeHtml(tr('focusThisTab'))}: ${safeTitle}">
    ${faviconUrl ? `<img class="chip-favicon" src="${escapeHtml(faviconUrl)}" alt="" crossorigin="anonymous" data-favicon-domain="${safeDomain}">` : ''}
    <span class="ungrouped-row-main">
      <span class="chip-text ungrouped-title">${safeTitle}</span>${dupeTag}
      <span class="ungrouped-domain">${safeDomain}</span>
    </span>
    <div class="chip-actions">
      <button class="chip-action chip-save" data-action="defer-single-tab" data-tab-url="${safeUrl}" data-tab-title="${safeTitle}" title="${escapeHtml(tr('saveForLater'))}" aria-label="${escapeHtml(tr('saveForLater'))}: ${safeTitle}">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0 1 11.186 0Z" /></svg>
      </button>
      <button class="chip-action chip-close" data-action="close-single-tab" data-tab-url="${safeUrl}" title="${escapeHtml(tr('closeThisTab'))}" aria-label="${escapeHtml(tr('closeThisTab'))}: ${safeTitle}">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
      </button>
    </div>
  </article>`;
}

function renderUngroupedSection(ungroupedTabs) {
  const urlCounts = {};
  for (const tab of ungroupedTabs) urlCounts[tab.url] = (urlCounts[tab.url] || 0) + 1;

  const seen = new Set();
  const uniqueTabs = [];
  for (const tab of ungroupedTabs) {
    if (!seen.has(tab.url)) { seen.add(tab.url); uniqueTabs.push(tab); }
  }

  const domainGroups = getUngroupedDomainGroups(uniqueTabs);
  const smartGroupable = domainGroups.filter(group => group.tabs.length >= 2);
  const groupedBlocks = smartGroupable.map(group => `
    <div class="ungrouped-domain-block" data-ungrouped-domain="${escapeHtml(group.domain)}">
      <div class="ungrouped-domain-header">
        <span class="ungrouped-domain-name">${escapeHtml(group.label)}</span>
        <span class="ungrouped-domain-count">${escapeHtml(tr('tabsOpen', { count: group.tabs.length }))}</span>
        <button class="action-btn ungrouped-domain-action" data-action="create-ungrouped-domain-group" data-domain-key="${escapeHtml(group.domain)}">
          ${escapeHtml(tr('createGroupFromDomain'))}
        </button>
      </div>
      ${group.tabs.map(tab => renderUngroupedTabRow(tab, urlCounts)).join('')}
    </div>`).join('');

  const smartDomains = new Set(smartGroupable.map(group => group.domain));
  const looseRows = domainGroups
    .filter(group => !smartDomains.has(group.domain))
    .flatMap(group => group.tabs)
    .map(tab => renderUngroupedTabRow(tab, urlCounts))
    .join('');

  const smartGroupButton = smartGroupable.length > 0
    ? `<button class="action-btn primary" data-action="smart-group-ungrouped" title="${escapeHtml(tr('smartGroupHint'))}">
        ${escapeHtml(tr('smartGroup'))}
      </button>`
    : '';

  return `
    <div class="ungrouped-section">
      <div class="ungrouped-header">
        <div class="ungrouped-heading">
          <span class="ungrouped-label">${escapeHtml(tr('notGrouped'))}</span>
          <span class="ungrouped-count">${escapeHtml(tr('tabsOpen', { count: ungroupedTabs.length }))}</span>
          <span class="ungrouped-hint">${escapeHtml(tr('ungroupedInboxHint'))}</span>
        </div>
        <div class="ungrouped-actions">
          ${smartGroupButton}
          <button class="action-btn save-tabs" data-action="save-ungrouped-session">
            ${escapeHtml(tr('saveAll'))}
          </button>
          <button class="action-btn close-tabs" data-action="close-ungrouped-tabs">
            ${ICONS.close}
            ${escapeHtml(tr('closeAllTabs', { count: ungroupedTabs.length }))}
          </button>
        </div>
      </div>
      <div class="ungrouped-chips">
        ${groupedBlocks}
        ${looseRows ? `<div class="ungrouped-loose-list">${looseRows}</div>` : ''}
      </div>
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
  await renderDashboardMetrics(realTabs);

  // --- Check for duplicate Tab Out tabs ---
  checkTabOutDupes();

  // --- Render "Saved for Later" column ---
  await renderDeferredColumn();
  await renderSavedSessionsCard();

  const search = document.getElementById('openTabsSearch');
  if (search?.value.trim()) {
    await applyDashboardSearch(search.value);
  }
}

async function renderDashboardMetrics(realTabs = getRealTabs()) {
  const metricTargets = ['statHealth', 'statClosedWeek', 'statSavedWeek']
    .map(id => document.getElementById(id))
    .filter(el => el && !el.closest('[hidden]'));
  if (!metricTargets.length) return;

  if (!MetricsService?.calculateTabHealth) return;
  const health = MetricsService.calculateTabHealth(realTabs);
  const stats = StorageService?.getActivityStats ? await StorageService.getActivityStats() : {};
  const summary = MetricsService.summarizeActivity ? MetricsService.summarizeActivity(stats) : {};

  const healthEl = document.getElementById('statHealth');
  if (healthEl) healthEl.textContent = health.score;
  const closedEl = document.getElementById('statClosedWeek');
  if (closedEl) closedEl.textContent = summary.closedThisWeek || 0;
  const savedEl = document.getElementById('statSavedWeek');
  if (savedEl) savedEl.textContent = summary.savedThisWeek || 0;

  const achievements = MetricsService.evaluateAchievements
    ? MetricsService.evaluateAchievements(stats, health)
    : [];
  if (achievements.length && StorageService?.unlockAchievements) {
    await StorageService.unlockAchievements(achievements);
  }
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
  const isGroupMenuColorAction = action === 'toggle-group-color-picker' || action === 'set-group-color';
  if (actionEl.closest('.group-action-menu') && !isGroupMenuColorAction) closeGroupActionMenus();

  // ---- Switch color theme ----
  if (action === 'set-theme') {
    const name = actionEl.dataset.themeName;
    if (name) applyTheme(name, { save: true });
    setThemeMenuOpen(false);
    return;
  }

  // ---- Open/close theme palette ----
  if (action === 'toggle-theme-menu') {
    setFontMenuOpen(false);
    toggleThemeMenu();
    return;
  }

  // ---- Switch font and density preset ----
  if (action === 'set-font-preset') {
    const preset = actionEl.dataset.fontPreset;
    if (preset) applyFontPreset(preset, { save: true });
    setFontMenuOpen(false);
    return;
  }

  // ---- Switch a specific area's font size ----
  if (action === 'set-font-size') {
    const area = actionEl.dataset.fontSizeArea;
    const value = actionEl.dataset.fontSizeValue;
    if (FONT_SIZE_AREAS.includes(area) && FONT_SIZE_VALUES.includes(value)) {
      applyFontSizeSettings({ ...getActiveFontSizeSettings(), [area]: value }, { save: true });
    }
    return;
  }

  // ---- Open/close font preset menu ----
  if (action === 'toggle-font-menu') {
    setThemeMenuOpen(false);
    toggleFontMenu();
    return;
  }

  // ---- Open/close Chrome tab group overflow menu ----
  if (action === 'toggle-group-actions-menu') {
    e.stopPropagation();
    toggleGroupActionMenu(actionEl, { focusFirst: e.detail === 0 });
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
    const closeCount = openTabs.filter(t => !t.pinned && t.url === tabUrl).length || 1;
    await closeTabsByUrls([tabUrl]);

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
    await recordActivity({ type: 'closed', count: closeCount });
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
    await closeTabsByUrls([tabUrl]);

    // Animate chip out
    const chip = actionEl.closest('.page-chip');
    if (chip) {
      chip.style.transition = 'opacity 0.2s, transform 0.2s';
      chip.style.opacity    = '0';
      chip.style.transform  = 'scale(0.8)';
      setTimeout(() => chip.remove(), 200);
    }

    showToast(tr('toastSavedForLater'));
    await recordActivity({ type: 'saved', count: 1 });
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

  // ---- Clear archived saved tabs, with a short undo window ----
  if (action === 'clear-archive') {
    const { archived } = await getSavedTabs();
    if (archived.length === 0) return;

    actionEl.disabled = true;
    try {
      const removed = await clearArchivedSavedTabs();
      await renderDeferredColumn();
      showToast(tr('toastArchiveCleared', { count: removed }), {
        actionLabel: tr('undo'),
        onAction: async () => {
          const restored = await restoreArchivedSavedTabs(archived);
          await renderDeferredColumn();
          showToast(tr('toastArchiveRestored', { count: restored }));
        },
      });
    } catch (err) {
      console.error('[tab-out] Failed to clear archive:', err);
      actionEl.disabled = false;
      showToast(tr('toastStorageFailed'));
    }
    return;
  }

  // ---- Restore a saved session into open tabs and rebuild its Chrome group ----
  if (action === 'restore-saved-session') {
    const id = actionEl.dataset.sessionId;
    if (!id) return;
    const sessions = await getSavedSessions();
    const session = sessions.find(item => item.id === id);
    if (!session) return;

    actionEl.disabled = true;
    try {
      await restoreSavedSessionToChrome(session);
      await saveViewMode('group');
      await renderDashboard();
      showToast(tr('toastSessionRestored'));
    } catch (err) {
      console.error('[tab-out] Failed to restore saved session:', err);
      actionEl.disabled = false;
      showToast(tr('toastSessionRestoreFailed'));
    }
    return;
  }

  // ---- Delete a saved session from local storage, with undo ----
  if (action === 'delete-saved-session') {
    const id = actionEl.dataset.sessionId;
    if (!id) return;
    const sessions = await getSavedSessions();
    const sessionIndex = sessions.findIndex(item => item.id === id);
    const session = sessions[sessionIndex];
    if (!session) return;

    actionEl.disabled = true;
    await removeSavedSession(id);

    const item = actionEl.closest('.saved-session-item');
    if (item) {
      item.classList.add('removing');
      setTimeout(() => renderSavedSessionsCard(), 250);
    } else {
      await renderSavedSessionsCard();
    }
    const sessionTitle = session.group || session.name || session.title || tr('savedSessionsTitle');
    showToast(tr('toastSessionDeleted', { title: sessionTitle }), {
      actionLabel: tr('undo'),
      onAction: async () => {
        const restored = await restoreSavedSession(session, sessionIndex);
        if (restored) await renderSavedSessionsCard();
        showToast(tr('toastSessionRestoredFromUndo'));
      },
    });
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
    await recordActivity({ type: 'closed', count: urls.length, domain: group.domain });

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
    await recordActivity({ type: 'duplicateClosed', count: urls.length });
    return;
  }

  // ---- Create a native Chrome group from a domain card ----
  if (action === 'create-native-group') {
    const domainKey = actionEl.dataset.domainKey;
    const group = domainGroups.find(g => g.domain === domainKey);
    if (!group) return;
    const tabIds = group.tabs.map(tab => tab.id).filter(Boolean);
    const title = group.domain === '__landing-pages__' ? tr('homepages') : (group.label || friendlyDomain(group.domain));
    await TabsService?.groupTabs?.(tabIds, { title, color: 'blue' });
    await fetchTabGroups();
    await saveViewMode('group');
    await renderDashboard();
    showToast(tr('toastGroupCreated'));
    return;
  }

  // ---- Save all ungrouped tabs as one local session ----
  if (action === 'save-ungrouped-session') {
    const ungroupedTabs = getRealTabs().filter(t => t.groupId === -1);
    if (ungroupedTabs.length === 0) return;
    actionEl.disabled = true;
    await saveTabsAsSession(ungroupedTabs, tr('notGrouped'));
    await renderSavedSessionsCard();
    showToast(tr('toastSessionSaved'));
    return;
  }

  // ---- Close all ungrouped tabs ----
  if (action === 'close-ungrouped-tabs') {
    const ungroupedTabs = getRealTabs().filter(t => t.groupId === -1);
    const tabIds = ungroupedTabs.map(tab => tab.id).filter(Boolean);
    if (tabIds.length === 0) return;
    await closeTabsByIds(tabIds);
    playCloseSound();
    animateCardOut(actionEl.closest('.ungrouped-section'));
    showToast(tr('toastClosedUngrouped', { count: tabIds.length }));
    await recordActivity({ type: 'closed', count: tabIds.length });
    return;
  }

  // ---- Smart group ungrouped tabs by domain ----
  if (action === 'smart-group-ungrouped') {
    const ungroupedTabs = getRealTabs().filter(t => t.groupId === -1);
    const groups = getUngroupedDomainGroups(ungroupedTabs).filter(group => group.tabs.length >= 2);
    if (groups.length === 0) {
      showToast(tr('toastSmartGroupNone'));
      return;
    }

    actionEl.disabled = true;
    let createdCount = 0;
    for (const group of groups) {
      const tabIds = group.tabs.map(tab => tab.id).filter(Boolean);
      if (tabIds.length < 2) continue;
      const groupId = await TabsService?.groupTabs?.(tabIds, { title: group.label, color: 'blue' });
      if (groupId != null) createdCount += 1;
    }
    await fetchTabGroups();
    await saveViewMode('group');
    await renderDashboard();
    showToast(createdCount > 0 ? tr('toastSmartGrouped', { count: createdCount }) : tr('toastSmartGroupNone'));
    return;
  }

  // ---- Create one Chrome tab group from an ungrouped domain cluster ----
  if (action === 'create-ungrouped-domain-group') {
    const domainKey = actionEl.dataset.domainKey;
    const group = getUngroupedDomainGroups(getRealTabs().filter(t => t.groupId === -1))
      .find(item => item.domain === domainKey);
    if (!group) return;
    const tabIds = group.tabs.map(tab => tab.id).filter(Boolean);
    if (tabIds.length === 0) return;
    actionEl.disabled = true;
    await TabsService?.groupTabs?.(tabIds, { title: group.label, color: 'blue' });
    await fetchTabGroups();
    await saveViewMode('group');
    await renderDashboard();
    showToast(tr('toastGroupCreated'));
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
    await recordActivity({ type: 'closed', count: tabIds.length });
    return;
  }

  // ---- Rename a Chrome tab group ----
  if (action === 'rename-group') {
    const groupId = Number(actionEl.dataset.groupId);
    if (!Number.isFinite(groupId)) return;
    const current = tabGroupsList.find(g => g.id === groupId);
    const title = prompt(tr('renameGroup'), current?.title || '');
    if (title == null) return;
    await TabsService?.updateGroup?.(groupId, { title: title.trim() });
    await renderDashboard();
    showToast(tr('toastGroupUpdated'));
    return;
  }

  // ---- Open / close Chrome tab group color picker ----
  if (action === 'toggle-group-color-picker') {
    const groupId = Number(actionEl.dataset.groupId);
    if (!Number.isFinite(groupId)) return;
    e.stopPropagation();
    toggleGroupColorPicker(actionEl, { focusSelected: e.detail === 0 });
    return;
  }

  // ---- Recolor a Chrome tab group ----
  if (action === 'set-group-color') {
    const groupId = Number(actionEl.dataset.groupId);
    const normalized = normalizeChromeGroupColor(actionEl.dataset.groupColor, '');
    if (!Number.isFinite(groupId) || !normalized) return;

    e.stopPropagation();
    const current = tabGroupsList.find(g => g.id === groupId);
    const previousColor = normalizeChromeGroupColor(current?.color);
    closeGroupColorPickers();
    if (normalized === previousColor) return;

    updateGroupColorControlState(groupId, normalized);
    try {
      await updateChromeTabGroup(groupId, { color: normalized });
      if (current) current.color = normalized;
      await fetchTabGroups();
      showToast(tr('toastGroupUpdated'));
    } catch (err) {
      console.error('[tab-out] Failed to update Chrome tab group color:', err);
      updateGroupColorControlState(groupId, previousColor);
      showToast(tr('toastGroupUpdateFailed'));
    }
    return;
  }

  // ---- Collapse / expand a Chrome tab group ----
  if (action === 'toggle-group-collapsed') {
    const groupId = Number(actionEl.dataset.groupId);
    if (!Number.isFinite(groupId)) return;
    const collapsed = actionEl.dataset.collapsed === 'true';
    await TabsService?.updateGroup?.(groupId, { collapsed: !collapsed });
    await renderDashboard();
    showToast(tr('toastGroupUpdated'));
    return;
  }

  // ---- Save Chrome tab group as a session ----
  if (action === 'save-group-session') {
    const groupId = Number(actionEl.dataset.groupId);
    if (!Number.isFinite(groupId)) return;
    const groupInfo = tabGroupsList.find(g => g.id === groupId);
    const groupTabs = openTabs
      .filter(t => t.groupId === groupId)
      .map(t => ({ ...t, groupTitle: groupInfo?.title || '', groupColor: groupInfo?.color || '' }));
    await saveTabsAsSession(groupTabs, groupInfo?.title || tr('unnamedGroup'));
    await renderSavedSessionsCard();
    showToast(tr('toastGroupSaved'));
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
    await recordActivity({ type: 'closed', count: allUrls.length });
    return;
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  const actionEl = e.target.closest('[role="button"][data-action]');
  if (!actionEl || actionEl.tagName === 'BUTTON') return;
  e.preventDefault();
  actionEl.click();
});

document.addEventListener('keydown', (e) => {
  const option = e.target.closest('.group-color-option');
  if (!option) return;

  const keys = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End'];
  if (!keys.includes(e.key)) return;

  const options = Array.from(option.closest('.group-color-picker')?.querySelectorAll('.group-color-option') || []);
  if (options.length === 0) return;

  e.preventDefault();
  const currentIndex = Math.max(0, options.indexOf(option));
  let nextIndex = currentIndex;
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') nextIndex = (currentIndex + 1) % options.length;
  if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') nextIndex = (currentIndex - 1 + options.length) % options.length;
  if (e.key === 'Home') nextIndex = 0;
  if (e.key === 'End') nextIndex = options.length - 1;
  options[nextIndex].focus();
});

// ---- Archive toggle — expand/collapse the archive section ----
document.addEventListener('click', (e) => {
  const toggle = e.target.closest('#archiveToggle');
  if (!toggle) return;

  toggle.classList.toggle('open');
  toggle.setAttribute('aria-expanded', toggle.classList.contains('open') ? 'true' : 'false');
  const body = document.getElementById('archiveBody');
  if (body) {
    body.style.display = body.style.display === 'none' ? 'block' : 'none';
  }
});

let _dashboardSearchRun = 0;

function resetSearchHighlights(root = document) {
  root.querySelectorAll('[data-search-raw-text]').forEach(el => {
    el.textContent = el.dataset.searchRawText || '';
  });
}

function highlightTextElement(el, query) {
  if (!el || !SearchService?.getHighlightSegments) return;
  if (!el.dataset.searchRawText) el.dataset.searchRawText = el.textContent || '';
  const segments = SearchService.getHighlightSegments(el.dataset.searchRawText, query);
  el.innerHTML = segments
    .map(segment => segment.match
      ? `<mark class="search-match">${escapeHtml(segment.text)}</mark>`
      : escapeHtml(segment.text))
    .join('');
}

function resetDashboardSearch() {
  const missionsEl = document.getElementById('openTabsMissions');
  if (missionsEl) {
    missionsEl.classList.remove('is-searching');
    missionsEl.querySelectorAll('.mission-card, .page-chip, .ungrouped-section').forEach(el => {
      el.classList.remove('search-hidden');
    });
    missionsEl.querySelectorAll('.page-chips-overflow').forEach(overflow => {
      if (overflow.parentElement?.querySelector('.page-chip-overflow')) {
        overflow.style.display = 'none';
      }
    });
  }

  const column = document.getElementById('deferredColumn');
  const hasSavedItems = !!document.querySelector('.deferred-item, .archive-item');
  if (column) column.style.display = hasSavedItems ? 'block' : 'none';
  document.querySelectorAll('.deferred-item, .archive-item').forEach(el => {
    el.classList.remove('search-hidden');
  });
  const empty = document.getElementById('deferredEmpty');
  if (empty) {
    const hasActiveItems = !!document.querySelector('.deferred-item');
    empty.style.display = hasSavedItems && !hasActiveItems ? 'block' : 'none';
    const label = empty.querySelector('[data-i18n="deferredEmpty"]') || empty;
    label.textContent = tr('deferredEmpty');
  }

  const sessionsCard = document.getElementById('savedSessionsCard');
  const sessionItems = document.querySelectorAll('.saved-session-item[data-session-id]');
  if (sessionsCard) sessionsCard.style.display = sessionItems.length > 0 ? 'block' : 'none';
  sessionItems.forEach(el => el.classList.remove('search-hidden'));
  const sessionsList = document.getElementById('savedSessionsList');
  if (sessionsList) sessionsList.style.display = sessionItems.length > 0 ? 'flex' : 'none';
  const sessionsCount = document.getElementById('savedSessionsCount');
  if (sessionsCount) sessionsCount.textContent = sessionItems.length > 0 ? tr('itemCount', { count: sessionItems.length }) : '';
  const sessionsEmpty = document.getElementById('savedSessionsEmpty');
  if (sessionsEmpty) sessionsEmpty.style.display = 'none';

  resetSearchHighlights();
  updateDashboardSideVisibility();
}

async function buildDashboardSearchIndex() {
  if (!SearchService?.buildSearchIndex) return [];
  const { active, archived } = await getSavedTabs();
  const savedSessions = await getSavedSessions();
  return SearchService.buildSearchIndex({
    tabs: getRealTabs(),
    tabGroups: tabGroupsList,
    savedTabs: [...active, ...archived],
    savedSessions,
  });
}

function applyOpenTabSearchResults(results, query) {
  const missionsEl = document.getElementById('openTabsMissions');
  if (!missionsEl) return;

  const matchedUrls = new Set(
    results
      .filter(record => record.type === 'tab')
      .map(record => record.url)
  );

  missionsEl.classList.add('is-searching');

  missionsEl.querySelectorAll('.mission-card').forEach(card => {
    let anyVisible = false;
    card.querySelectorAll('.page-chips-overflow').forEach(overflow => {
      overflow.style.display = 'contents';
    });

    card.querySelectorAll('.page-chip:not(.page-chip-overflow)').forEach(chip => {
      const visible = matchedUrls.has(chip.dataset.tabUrl || '');
      chip.classList.toggle('search-hidden', !visible);
      if (visible) {
        anyVisible = true;
        highlightTextElement(chip.querySelector('.chip-text'), query);
      }
    });

    card.classList.toggle('search-hidden', !anyVisible);
    if (anyVisible) highlightTextElement(card.querySelector('.mission-name'), query);
  });

  missionsEl.querySelectorAll('.ungrouped-section').forEach(section => {
    let anyVisible = false;
    section.querySelectorAll('.page-chip').forEach(chip => {
      const visible = matchedUrls.has(chip.dataset.tabUrl || '');
      chip.classList.toggle('search-hidden', !visible);
      if (visible) {
        anyVisible = true;
        highlightTextElement(chip.querySelector('.chip-text'), query);
      }
    });
    section.classList.toggle('search-hidden', !anyVisible);
    if (anyVisible) highlightTextElement(section.querySelector('.ungrouped-label'), query);
  });
}

function applySavedSearchResults(results, query) {
  const column = document.getElementById('deferredColumn');
  if (!column) return;

  const matchedSavedIds = new Set(
    results
      .filter(record => record.type === 'saved')
      .map(record => String(record.source?.id || '').trim())
      .filter(Boolean)
  );

  let activeVisible = 0;
  document.querySelectorAll('.deferred-item[data-deferred-id]').forEach(item => {
    const visible = matchedSavedIds.has(item.dataset.deferredId);
    item.classList.toggle('search-hidden', !visible);
    if (visible) {
      activeVisible += 1;
      highlightTextElement(item.querySelector('.deferred-title-text'), query);
      highlightTextElement(item.querySelector('.deferred-domain-text'), query);
    }
  });

  let archiveVisible = 0;
  document.querySelectorAll('.archive-item[data-deferred-id]').forEach(item => {
    const visible = matchedSavedIds.has(item.dataset.deferredId);
    item.classList.toggle('search-hidden', !visible);
    if (visible) {
      archiveVisible += 1;
      highlightTextElement(item.querySelector('.archive-item-title-text'), query);
    }
  });

  const countEl = document.getElementById('deferredCount');
  if (countEl) countEl.textContent = activeVisible > 0 ? tr('itemCount', { count: activeVisible }) : '';

  const archiveCountEl = document.getElementById('archiveCount');
  if (archiveCountEl) archiveCountEl.textContent = archiveVisible > 0 ? `(${archiveVisible})` : '';

  const empty = document.getElementById('deferredEmpty');
  if (empty) {
    empty.style.display = activeVisible === 0 && archiveVisible === 0 ? 'block' : 'none';
    const label = empty.querySelector('[data-i18n="deferredEmpty"]') || empty;
    label.textContent = activeVisible === 0 && archiveVisible === 0 ? tr('noResults') : tr('deferredEmpty');
  }

  const archiveEl = document.getElementById('deferredArchive');
  const archiveBody = document.getElementById('archiveBody');
  const archiveToggle = document.getElementById('archiveToggle');
  if (archiveEl) archiveEl.style.display = archiveVisible > 0 ? 'block' : 'none';
  if (archiveVisible > 0 && archiveBody) archiveBody.style.display = 'block';
  if (archiveVisible > 0 && archiveToggle) archiveToggle.classList.add('open');

  column.style.display = activeVisible > 0 || archiveVisible > 0 ? 'block' : 'none';
  updateDashboardSideVisibility();
}

function applySavedSessionSearchResults(results, query) {
  const card = document.getElementById('savedSessionsCard');
  if (!card) return;

  const matchedSessionIds = new Set(
    results
      .filter(record => record.type === 'session')
      .map(record => String(record.source?.id || '').trim())
      .filter(Boolean)
  );

  let visibleCount = 0;
  document.querySelectorAll('.saved-session-item[data-session-id]').forEach(item => {
    const visible = matchedSessionIds.has(item.dataset.sessionId);
    item.classList.toggle('search-hidden', !visible);
    if (visible) {
      visibleCount += 1;
      highlightTextElement(item.querySelector('.saved-session-title-text'), query);
      highlightTextElement(item.querySelector('.saved-session-preview-text'), query);
    }
  });

  const list = document.getElementById('savedSessionsList');
  if (list) list.style.display = visibleCount > 0 ? 'flex' : 'none';

  const countEl = document.getElementById('savedSessionsCount');
  if (countEl) countEl.textContent = visibleCount > 0 ? tr('itemCount', { count: visibleCount }) : '';

  const empty = document.getElementById('savedSessionsEmpty');
  if (empty) {
    empty.style.display = visibleCount === 0 ? 'block' : 'none';
    const label = empty.querySelector('[data-i18n="savedSessionsEmpty"]') || empty;
    label.textContent = visibleCount === 0 ? tr('noResults') : tr('savedSessionsEmpty');
  }

  card.style.display = visibleCount > 0 ? 'block' : 'none';
  updateDashboardSideVisibility();
}

async function applyDashboardSearch(query) {
  const run = ++_dashboardSearchRun;
  const trimmed = String(query || '').trim();
  if (!trimmed) {
    resetDashboardSearch();
    return;
  }

  resetDashboardSearch();
  const index = await buildDashboardSearchIndex();
  if (run !== _dashboardSearchRun) return;

  const results = SearchService?.searchIndex ? SearchService.searchIndex(index, trimmed) : [];
  applyOpenTabSearchResults(results, trimmed);
  applySavedSearchResults(results, trimmed);
  applySavedSessionSearchResults(results, trimmed);
}

// ---- Open-tabs search — filter domain cards and chips as user types ----
document.addEventListener('input', async (e) => {
  if (e.target.id !== 'openTabsSearch') return;
  await applyDashboardSearch(e.target.value);
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

const PRIVACY_DEFAULTS = { clock: true, date: true, motto: true, mottoText: '', externalFavicons: true };

async function getPrivacyMode() {
  try {
    if (StorageService?.getPrivacyMode) return await StorageService.getPrivacyMode();
    const { privacyMode } = await chrome.storage.local.get('privacyMode');
    return privacyMode === true;
  } catch { return false; }
}

async function getPrivacySettings() {
  try {
    if (StorageService?.getPrivacySettings) return await StorageService.getPrivacySettings();
    const { privacySettings } = await chrome.storage.local.get('privacySettings');
    return { ...PRIVACY_DEFAULTS, ...privacySettings };
  } catch { return { ...PRIVACY_DEFAULTS }; }
}

async function savePrivacySettings(settings) {
  try {
    if (StorageService?.setPrivacySettings) await StorageService.setPrivacySettings(settings);
    else await chrome.storage.local.set({ privacySettings: settings });
  } catch {}
}

async function setPrivacyMode(enabled) {
  try {
    if (StorageService?.setPrivacyMode) await StorageService.setPrivacyMode(enabled);
    else await chrome.storage.local.set({ privacyMode: enabled });
  } catch {}
  if (enabled) setCommandDrawerOpen(false);
  document.body.classList.toggle('privacy-mode', enabled);
  if (enabled) {
    await applyPrivacyWidgets();
    startPrivacyClock();
  } else {
    const panel = document.getElementById('privacySettings');
    const btn = document.getElementById('privacySettingsBtn');
    if (panel) panel.style.display = 'none';
    if (btn) btn.setAttribute('aria-expanded', 'false');
    stopPrivacyClock();
    // Refresh is suppressed while locked (see scheduleRefresh); catch up now.
    renderDashboard();
  }
}

function setCommandDrawerView(viewName = 'tools') {
  const activeViewName = document.getElementById(`${viewName}View`) ? viewName : 'tools';
  document.dispatchEvent(new CustomEvent('super-tab-out-command-view', {
    detail: { view: activeViewName },
  }));
  document.querySelectorAll('.panel-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === activeViewName);
  });
  document.querySelectorAll('.panel-view').forEach(view => {
    view.classList.toggle('active', view.id === `${activeViewName}View`);
  });
  document.querySelectorAll('.command-dock-btn[data-command-dock-view]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.commandDockView === activeViewName);
  });
  document.getElementById('commandDrawer')?.setAttribute('data-active-view', activeViewName);
  return activeViewName;
}

function setCommandDrawerOpen(open, { view = null } = {}) {
  const drawer = document.getElementById('commandDrawer');
  if (!drawer) return;
  const drawerPanel = drawer.querySelector('.command-drawer');
  const shouldOpen = open && !document.body.classList.contains('privacy-mode');
  const activeViewName = setCommandDrawerView(view || drawer.getAttribute('data-active-view') || 'tools');
  const dockButtons = document.querySelectorAll('.command-dock-btn[data-command-dock-view]');
  document.body.classList.toggle('command-drawer-open', shouldOpen);
  drawer.setAttribute('aria-hidden', 'false');
  if (drawerPanel) {
    drawerPanel.setAttribute('aria-hidden', shouldOpen ? 'false' : 'true');
    drawerPanel.inert = !shouldOpen;
  }
  dockButtons.forEach(btn => {
    const expanded = shouldOpen && btn.dataset.commandDockView === activeViewName;
    btn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
  });
  if (shouldOpen) {
    drawer.dispatchEvent(new Event('super-tab-out-panel-refresh', { bubbles: true }));
    const focusSelector = activeViewName === 'tools' ? 'toolSearch' : 'panelSearch';
    setTimeout(() => document.getElementById(focusSelector)?.focus(), 80);
  } else if (drawer.contains(document.activeElement)) {
    let focusTarget = document.querySelector(`.command-dock-btn[data-command-dock-view="${activeViewName}"]`);
    if (!focusTarget || focusTarget.offsetParent === null) {
      focusTarget = document.getElementById('commandDockToolsBtn');
    }
    focusTarget?.focus({ preventScroll: true });
  }
}
document.addEventListener('click', (event) => {
  const btn = event.target.closest('[data-command-dock-view]');
  const drawer = document.getElementById('commandDrawer');
  if (!btn || !drawer) return;
  const view = btn.dataset.commandDockView;
  const isOpen = document.body.classList.contains('command-drawer-open');
  const isPrimaryToggle = btn.id === 'commandDockToolsBtn';
  const activeView = drawer.getAttribute('data-active-view') || 'tools';
  if (isPrimaryToggle && isOpen && activeView === view) {
    setCommandDrawerOpen(false);
    return;
  }
  setCommandDrawerOpen(true, { view });
});
document.getElementById('commandDrawerClose')?.addEventListener('click', () => setCommandDrawerOpen(false));
document.getElementById('commandDrawerBackdrop')?.addEventListener('click', () => setCommandDrawerOpen(false));

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' || !document.body.classList.contains('command-drawer-open')) return;
  e.preventDefault();
  e.stopImmediatePropagation();
  setCommandDrawerOpen(false);
}, true);

async function applyPrivacyWidgets() {
  const s = await getPrivacySettings();
  const timeEl   = document.getElementById('privacyTime');
  const dateEl   = document.getElementById('privacyDate');
  const mottoEl  = document.getElementById('privacyMotto');

  if (timeEl)   timeEl.style.display   = s.clock  ? '' : 'none';
  if (dateEl)   dateEl.style.display   = s.date   ? '' : 'none';
  if (mottoEl) {
    mottoEl.style.display = s.motto && s.mottoText ? '' : 'none';
    mottoEl.textContent   = s.mottoText || '';
  }

  // Sync checkboxes in the settings panel with persisted state.
  const ids = { psClock: 'clock', psDate: 'date', psMotto: 'motto' };
  for (const [elId, key] of Object.entries(ids)) {
    const cb = document.getElementById(elId);
    if (cb) cb.checked = s[key];
  }
  const mottoInput = document.getElementById('psMottoInput');
  if (mottoInput) mottoInput.value = s.mottoText || '';
  const mottoEdit = document.getElementById('psMottoEdit');
  if (mottoEdit) mottoEdit.style.display = s.motto ? '' : 'none';
  const faviconCb = document.getElementById('psFavicons');
  if (faviconCb) faviconCb.checked = s.externalFavicons !== false;
  externalFaviconsEnabled = s.externalFavicons !== false;
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
  if (document.querySelector('.group-color-control.is-open')) {
    e.preventDefault();
    closeGroupColorPickers({ restoreFocus: true });
    return;
  }
  if (document.querySelector('.group-action-menu-control.is-open')) {
    e.preventDefault();
    closeGroupActionMenus({ restoreFocus: true });
    return;
  }
  const themePicker = document.getElementById('themePicker');
  if (themePicker?.classList.contains('theme-menu-open')) {
    e.preventDefault();
    setThemeMenuOpen(false);
    return;
  }
  const fontPicker = document.getElementById('fontPicker');
  if (fontPicker?.classList.contains('font-menu-open')) {
    e.preventDefault();
    setFontMenuOpen(false);
    return;
  }
  const active = document.activeElement;
  const GUARDED_IDS = ['psMottoInput', 'openTabsSearch', 'archiveSearch'];
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
  const btn = document.getElementById('privacySettingsBtn');
  if (!panel) return;
  const willOpen = panel.style.display === 'none';
  panel.style.display = willOpen ? '' : 'none';
  if (btn) btn.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
});

document.addEventListener('click', (e) => {
  if (!e.target.closest('.group-color-control')) closeGroupColorPickers();
  if (!e.target.closest('.group-action-menu-control')) closeGroupActionMenus();

  const themePicker = document.getElementById('themePicker');
  if (themePicker && !themePicker.contains(e.target)) setThemeMenuOpen(false);
  const fontPicker = document.getElementById('fontPicker');
  if (fontPicker && !fontPicker.contains(e.target)) setFontMenuOpen(false);

  const panel = document.getElementById('privacySettings');
  const btn   = document.getElementById('privacySettingsBtn');
  if (!panel || panel.style.display === 'none') return;
  if (panel.contains(e.target) || (btn && btn.contains(e.target))) return;
  panel.style.display = 'none';
  if (btn) btn.setAttribute('aria-expanded', 'false');
});

for (const id of ['psClock', 'psDate', 'psMotto', 'psFavicons']) {
  document.getElementById(id)?.addEventListener('change', async () => {
    const s = await getPrivacySettings();
    s.clock  = document.getElementById('psClock')?.checked ?? true;
    s.date   = document.getElementById('psDate')?.checked ?? true;
    s.motto  = document.getElementById('psMotto')?.checked ?? true;
    s.externalFavicons = document.getElementById('psFavicons')?.checked ?? true;
    await savePrivacySettings(s);
    await applyPrivacyWidgets();
    renderDashboard();
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

if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === 'toggle-privacy-mode') togglePrivacyMode();
  });
}


// Ctrl/Cmd + Shift + G — quickly toggle between Groups and Domains view.
// No-op when no Chrome tab groups exist.
document.addEventListener('keydown', async (e) => {
  if (e.key === 'Escape') {
    closeGroupColorPickers();
    setThemeMenuOpen(false);
    setFontMenuOpen(false);
  }
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
initFontSwitcher();
initLanguageSwitcher();
initStorageErrorToasts();
cleanExpiredFavicons();

async function initApp() {
  try {
    await StorageService?.migrateStorage?.();
  } catch (err) {
    console.warn('[tab-out] Storage migration failed:', err);
  }

  // initPrivacyMode runs first so a locked session never flashes the
  // dashboard into view before the body.privacy-mode class lands.
  await initPrivacyMode();
  await renderDashboard();
  _initialRenderDone = true;
}

initApp();

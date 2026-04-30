'use strict';

(function initSuperTabOutPanel() {
if (!document.getElementById('tabsView') && !document.getElementById('toolsView')) return;

let openTabs = [];
let tabGroups = [];
let savedTabs = { active: [], archived: [] };
let savedSessions = [];
let currentQuery = '';
let toolFavorites = [];
let toolRecent = [];
let toolOrder = [];
const DOCK_FAVORITE_LIMIT = 8;
const DOCK_NARROW_QUERY = '(max-width: 1279px)';
const DOCK_COMPACT_QUERY = '(max-width: 560px)';
const DOCK_BOTTOM_QUERY = '(max-width: 1179px)';
const DOCK_LONG_PRESS_MS = 450;
const DOCK_POINTER_TOLERANCE = 6;
const DOCK_EDIT_IDLE_MS = 4000;
const dockSortState = {
  editing: false,
  dragging: false,
  pointerId: null,
  draggedId: '',
  longPressTimer: null,
  idleTimer: null,
  startX: 0,
  startY: 0,
  suppressClickUntil: 0,
  dropTargetId: '',
  dropPosition: '',
  settledId: '',
  settleTimer: null,
};
const toolListSortState = {
  dragging: false,
  pointerId: null,
  draggedId: '',
  startX: 0,
  startY: 0,
  suppressClickUntil: 0,
  dropTargetId: '',
  dropPosition: '',
  settledId: '',
  settleTimer: null,
};
let dockResizeTimer = null;

const $ = (selector) => document.querySelector(selector);

const PANEL_LANGUAGE_KEY = 'tab-out-language';
const PANEL_COPY = {
  en: {
    commandCenter: 'Command Center',
    refresh: 'Refresh',
    close: 'Close',
    tabs: 'Tabs',
    health: 'Health',
    tools: 'Tools',
    searchTools: 'Search tools',
    fullPage: 'Full page',
    currentTabTools: 'Current tab tools',
    allTools: 'All tools',
    moreFavoriteTools: ({ count }) => `${count} more favorite tool${count === 1 ? '' : 's'}`,
    openTool: 'Open',
    favorite: 'Favorite',
    unfavorite: 'Unfavorite',
    sendToUrl: 'URL',
    sendToQr: 'QR',
    sendToHash: 'Hash',
    export: 'Export',
    searchPlaceholder: 'Search tabs, saved items, sessions',
    searchLabel: 'Search tabs saved items and sessions',
    save: 'Save',
    cleanDuplicates: 'Clean duplicates',
    newTabDashboard: 'New tab dashboard',
    noResults: 'No results',
    recentlyClosed: 'Recently closed',
    restore: 'Restore',
    nothingRecentlyClosed: 'Nothing recently closed.',
    jump: 'Jump',
    saveAction: 'Save',
    closeAction: 'Close',
    open: 'Open',
    saved: 'Saved',
    savedSession: 'Saved session',
    tabSingular: 'tab',
    tabPlural: 'tabs',
    tabWindow: ({ count }) => `${count} tab window`,
    tabHealth: 'Tab health',
    openTabs: 'Open tabs',
    duplicateExtras: 'Duplicate extras',
    closedThisWeek: 'Closed this week',
    savedThisWeek: 'Saved this week',
    topDomains: 'Top domains',
    achievements: 'Achievements',
    noDomainStats: 'No domain stats yet',
    noAchievements: 'No achievements yet.',
    achievementClosed10: 'Closed 10 tabs',
    achievementClosed100: 'Closed 100 tabs',
    achievementSaved10: 'Saved 10 tabs for later',
    achievementDedupe10: 'Removed 10 duplicate extras',
    achievementSessionSaver: 'Saved a browsing session',
    achievementCalmDeck: 'Kept tab health above 90',
    sessionSaved: 'Session saved',
    noDuplicates: 'No duplicates',
    duplicatesCleaned: 'Duplicates cleaned',
    savedForLater: 'Saved for later',
    tabClosed: 'Tab closed',
  },
  zh: {
    commandCenter: '控制中心',
    refresh: '刷新',
    close: '关闭',
    tabs: '标签页',
    health: '健康',
    tools: '工具',
    searchTools: '搜索工具',
    fullPage: '完整页面',
    currentTabTools: '当前标签工具',
    allTools: '全部工具',
    moreFavoriteTools: ({ count }) => `还有 ${count} 个收藏工具`,
    openTool: '打开',
    favorite: '收藏',
    unfavorite: '取消收藏',
    sendToUrl: 'URL',
    sendToQr: '二维码',
    sendToHash: 'Hash',
    export: '导出',
    searchPlaceholder: '搜索标签页、稍后再看和会话',
    searchLabel: '搜索标签页、稍后再看和会话',
    save: '保存',
    cleanDuplicates: '清理重复项',
    newTabDashboard: '新标签页仪表盘',
    noResults: '没有结果',
    recentlyClosed: '最近关闭',
    restore: '恢复',
    nothingRecentlyClosed: '没有最近关闭的内容。',
    jump: '跳转',
    saveAction: '保存',
    closeAction: '关闭',
    open: '打开',
    saved: '已保存',
    savedSession: '已保存会话',
    tabSingular: '个标签页',
    tabPlural: '个标签页',
    tabWindow: ({ count }) => `${count} 个标签页窗口`,
    tabHealth: '标签页健康',
    openTabs: '打开的标签页',
    duplicateExtras: '重复项',
    closedThisWeek: '本周关闭',
    savedThisWeek: '本周保存',
    topDomains: '常见域名',
    achievements: '成就',
    noDomainStats: '暂无域名统计',
    noAchievements: '暂无成就。',
    achievementClosed10: '已关闭 10 个标签页',
    achievementClosed100: '已关闭 100 个标签页',
    achievementSaved10: '已稍后保存 10 个标签页',
    achievementDedupe10: '已移除 10 个重复项',
    achievementSessionSaver: '已保存一个浏览会话',
    achievementCalmDeck: '标签页健康保持在 90 分以上',
    sessionSaved: '会话已保存',
    noDuplicates: '没有重复项',
    duplicatesCleaned: '重复项已清理',
    savedForLater: '已加入稍后再看',
    tabClosed: '标签页已关闭',
  },
};
let panelLanguage = getPanelLanguage();

function getPanelLanguage() {
  try {
    const stored = localStorage.getItem(PANEL_LANGUAGE_KEY);
    if (stored === 'zh' || stored === 'en') return stored;
  } catch {}
  return document.documentElement.dataset.lang === 'zh' ? 'zh' : 'en';
}

function panelTr(key, params = {}) {
  const value = PANEL_COPY[panelLanguage]?.[key] || PANEL_COPY.en[key] || key;
  return typeof value === 'function' ? value(params) : value;
}

function setText(selector, key) {
  document.querySelectorAll(selector).forEach(el => { el.textContent = panelTr(key); });
}

function setAttr(selector, attr, key) {
  document.querySelectorAll(selector).forEach(el => { el.setAttribute(attr, panelTr(key)); });
}

function applyPanelTranslations({ rerender = false } = {}) {
  panelLanguage = getPanelLanguage();
  setText('.panel-tab[data-view="tabs"]', 'tabs');
  setText('.panel-tab[data-view="health"]', 'health');
  setText('.panel-tab[data-view="tools"]', 'tools');
  setAttr('#refreshBtn', 'title', 'refresh');
  setAttr('#refreshBtn', 'aria-label', 'refresh');
  setAttr('#commandDrawerClose', 'title', 'close');
  setAttr('#commandDrawerClose', 'aria-label', 'close');
  setAttr('#panelSearch', 'placeholder', 'searchPlaceholder');
  setAttr('#panelSearch', 'aria-label', 'searchLabel');
  setText('#saveSessionBtn', 'save');
  setText('#dedupeBtn', 'cleanDuplicates');
  setText('#newTabBtn', 'newTabDashboard');
  setText('#healthView .health-label', 'tabHealth');
  setAttr('#toolSearch', 'placeholder', 'searchTools');
  setAttr('#toolSearch', 'aria-label', 'searchTools');
  setText('#openToolsPageBtn', 'fullPage');
  document.querySelectorAll('[data-tool-copy]').forEach(el => {
    el.textContent = panelTr(el.dataset.toolCopy);
  });
  document.querySelectorAll('#healthView .metric-grid span').forEach((el, index) => {
    el.textContent = [panelTr('openTabs'), panelTr('duplicateExtras'), panelTr('closedThisWeek'), panelTr('savedThisWeek')][index] || el.textContent;
  });
  document.querySelectorAll('.panel-section-title').forEach(el => {
    if (el.parentElement?.querySelector('#recentList')) el.textContent = panelTr('recentlyClosed');
    if (el.parentElement?.querySelector('#topDomains')) el.textContent = panelTr('topDomains');
    if (el.parentElement?.querySelector('#achievements')) el.textContent = panelTr('achievements');
  });
  setPanelView(document.getElementById('commandDrawer')?.getAttribute('data-active-view') || activePanelView());
  if (rerender) renderAll();
}

function panelViewTitle(viewName) {
  if (viewName === 'tools') return panelTr('tools');
  if (viewName === 'health') return panelTr('health');
  return panelTr('tabs');
}

function activePanelView() {
  const active = document.querySelector('.panel-view.active');
  if (active?.id) return active.id.replace(/View$/, '');
  return document.getElementById('toolsView') ? 'tools' : 'tabs';
}

function setPanelView(viewName) {
  const requestedViewName = viewName || activePanelView();
  let activeViewName = requestedViewName;
  let targetId = `${activeViewName}View`;
  let targetView = document.getElementById(targetId);
  if (!targetView) {
    activeViewName = document.getElementById('toolsView') ? 'tools' : 'tabs';
    targetId = `${activeViewName}View`;
    targetView = document.getElementById(targetId);
  }
  if (!targetView) return;
  document.querySelectorAll('.panel-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === activeViewName);
  });
  document.querySelectorAll('.panel-view').forEach(view => {
    view.classList.toggle('active', view.id === targetId);
  });
  document.querySelectorAll('.command-dock-btn[data-command-dock-view]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.commandDockView === activeViewName);
  });
  document.getElementById('commandDrawer')?.setAttribute('data-active-view', activeViewName);
  const title = document.getElementById('commandDrawerTitle');
  if (title) title.textContent = panelViewTitle(activeViewName);
}

function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderToolIcon(tool) {
  return self.SuperTabOutTools?.getToolIconSvg
    ? self.SuperTabOutTools.getToolIconSvg(tool.icon)
    : `<span class="tool-icon-fallback">${escapeHtml(tool.id.slice(0, 2).toUpperCase())}</span>`;
}

function toast(message) {
  const el = $('#panelToast');
  el.textContent = message;
  el.classList.add('visible');
  setTimeout(() => el.classList.remove('visible'), 2200);
}

function highlight(text, query = currentQuery) {
  if (!query || !self.SuperTabOutSearch?.getHighlightSegments) return escapeHtml(text);
  return self.SuperTabOutSearch.getHighlightSegments(text, query)
    .map(segment => segment.match
      ? `<mark class="search-match">${escapeHtml(segment.text)}</mark>`
      : escapeHtml(segment.text))
    .join('');
}

function domainFor(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); }
  catch { return ''; }
}

async function refreshData() {
  openTabs = (await self.SuperTabOutTabs.fetchOpenTabs())
    .filter(tab => self.SuperTabOutTabs.isRealTab(tab, chrome.runtime.id));
  tabGroups = await self.SuperTabOutTabs.fetchTabGroups();
  savedTabs = await self.SuperTabOutStorage.getSavedTabs();
  savedSessions = await self.SuperTabOutStorage.getSavedSessions();
  if (self.SuperTabOutTools) {
    [toolFavorites, toolRecent, toolOrder] = await Promise.all([
      self.SuperTabOutTools.getFavorites(),
      self.SuperTabOutTools.getRecent(),
      self.SuperTabOutTools.getToolOrder ? self.SuperTabOutTools.getToolOrder() : Promise.resolve([]),
    ]);
  }
  await renderAll();
}

function buildIndex() {
  return self.SuperTabOutSearch.buildSearchIndex({
    tabs: openTabs,
    tabGroups,
    savedTabs: [...savedTabs.active, ...savedTabs.archived],
    savedSessions,
  });
}

function renderResults() {
  const list = $('#resultList');
  if (!list) return;
  const query = currentQuery.trim();
  const records = query
    ? self.SuperTabOutSearch.searchIndex(buildIndex(), query)
    : buildIndex().filter(record => record.type === 'tab').slice(0, 25);
  const toolRecords = query && self.SuperTabOutTools
    ? self.SuperTabOutTools.searchTools(query, { lang: panelLanguage }).map(tool => ({ type: 'tool', title: tool.title, url: '', domain: tool.category, source: tool }))
    : [];
  const results = [...toolRecords, ...records];

  list.innerHTML = results.slice(0, 40).map(renderResultCard).join('')
    || `<div class="result-card"><div class="result-meta">${escapeHtml(panelTr('noResults'))}</div></div>`;
}

function renderResultCard(record) {
  if (record.type === 'tool') {
    const tool = record.source;
    return `
      <article class="result-card">
        <div class="result-title">${escapeHtml(tool.title)}</div>
        <div class="result-meta">${escapeHtml(tool.description)}</div>
        <div class="result-actions">
          <button data-action="open-tool" data-tool-id="${escapeHtml(tool.id)}">${escapeHtml(panelTr('openTool'))}</button>
          <button data-action="toggle-tool-favorite" data-tool-id="${escapeHtml(tool.id)}">${escapeHtml(toolFavorites.includes(tool.id) ? panelTr('unfavorite') : panelTr('favorite'))}</button>
        </div>
      </article>`;
  }

  const title = record.title || record.url || 'Untitled';
  const meta = record.type === 'tab'
    ? `${record.domain || domainFor(record.url)}${record.group ? ` · ${record.group}` : ''}`
    : record.type === 'saved'
      ? `${panelTr('saved')} · ${record.domain || domainFor(record.url)}`
      : `${panelTr('savedSession')} · ${(record.source.tabs || record.source.urls || []).length} ${panelTr('tabPlural')}`;

  const actions = record.type === 'tab'
    ? `<button data-action="focus" data-url="${escapeHtml(record.url)}">${escapeHtml(panelTr('jump'))}</button>
       <button data-action="save-tab" data-url="${escapeHtml(record.url)}" data-title="${escapeHtml(title)}">${escapeHtml(panelTr('saveAction'))}</button>
       <button data-action="close-url" data-url="${escapeHtml(record.url)}">${escapeHtml(panelTr('closeAction'))}</button>
       <button data-action="open-tool" data-tool-id="url" data-tool-input="${escapeHtml(record.url)}">${escapeHtml(panelTr('sendToUrl'))}</button>
       <button data-action="open-tool" data-tool-id="qr" data-tool-input="${escapeHtml(record.url)}">${escapeHtml(panelTr('sendToQr'))}</button>
       <button data-action="open-tool" data-tool-id="hash" data-tool-input="${escapeHtml(record.url)}">${escapeHtml(panelTr('sendToHash'))}</button>`
    : record.type === 'saved'
      ? `<button data-action="open-url" data-url="${escapeHtml(record.url)}">${escapeHtml(panelTr('open'))}</button>
         <button data-action="open-tool" data-tool-id="url" data-tool-input="${escapeHtml(record.url)}">${escapeHtml(panelTr('sendToUrl'))}</button>
         <button data-action="open-tool" data-tool-id="qr" data-tool-input="${escapeHtml(record.url)}">${escapeHtml(panelTr('sendToQr'))}</button>
         <button data-action="open-tool" data-tool-id="hash" data-tool-input="${escapeHtml(record.url)}">${escapeHtml(panelTr('sendToHash'))}</button>`
      : `<button data-action="restore-saved-session" data-session-id="${escapeHtml(record.source.id)}">${escapeHtml(panelTr('restore'))}</button>
         <button data-action="open-tool" data-tool-id="session-export">${escapeHtml(panelTr('export'))}</button>`;

  return `
    <article class="result-card">
      <div class="result-title">${highlight(title)}</div>
      <div class="result-meta">${highlight(meta)}</div>
      <div class="result-actions">${actions}</div>
    </article>`;
}

async function renderRecent() {
  const list = $('#recentList');
  if (!list) return;
  let sessions = [];
  try { sessions = await self.SuperTabOutTabs.getRecentlyClosed(8); } catch {}
  list.innerHTML = sessions.map((entry) => {
    const item = entry.tab || entry.window;
    const title = entry.tab?.title || panelTr('tabWindow', { count: entry.window?.tabs?.length || 0 });
    const sessionId = entry.tab?.sessionId || entry.window?.sessionId;
    const meta = entry.tab?.url || (entry.window?.tabs || []).map(tab => tab.url).filter(Boolean).slice(0, 2).join(' · ');
    const toolActions = entry.tab?.url
      ? `<button data-action="open-tool" data-tool-id="url" data-tool-input="${escapeHtml(entry.tab.url)}">${escapeHtml(panelTr('sendToUrl'))}</button>
         <button data-action="open-tool" data-tool-id="qr" data-tool-input="${escapeHtml(entry.tab.url)}">${escapeHtml(panelTr('sendToQr'))}</button>
         <button data-action="open-tool" data-tool-id="hash" data-tool-input="${escapeHtml(entry.tab.url)}">${escapeHtml(panelTr('sendToHash'))}</button>`
      : `<button data-action="open-tool" data-tool-id="session-export">${escapeHtml(panelTr('export'))}</button>`;
    return `
      <div class="recent-card">
        <div class="result-title">${escapeHtml(title)}</div>
        <div class="recent-meta">${escapeHtml(meta || '')}</div>
        <div class="result-actions">
          <button data-action="restore-recent" data-session-id="${escapeHtml(sessionId || '')}">${escapeHtml(panelTr('restore'))}</button>
          ${toolActions}
        </div>
      </div>`;
  }).join('') || `<div class="recent-card"><div class="recent-meta">${escapeHtml(panelTr('nothingRecentlyClosed'))}</div></div>`;
}

async function renderHealth() {
  if (!$('#healthScore')) return;
  const health = self.SuperTabOutMetrics.calculateTabHealth(openTabs);
  const stats = await self.SuperTabOutStorage.getActivityStats();
  const summary = self.SuperTabOutMetrics.summarizeActivity(stats);
  const achievements = await self.SuperTabOutStorage.unlockAchievements(
    self.SuperTabOutMetrics.evaluateAchievements(stats, health)
  );

  $('#healthScore').textContent = health.score;
  $('#metricTabs').textContent = health.tabCount;
  $('#metricDupes').textContent = health.duplicateExtras;
  $('#metricClosed').textContent = summary.closedThisWeek;
  $('#metricSaved').textContent = summary.savedThisWeek;
  $('#topDomains').innerHTML = summary.topDomains.map(item =>
    `<div class="compact-row"><span>${escapeHtml(item.domain)}</span><strong>${item.count}</strong></div>`
  ).join('') || `<div class="compact-row"><span>${escapeHtml(panelTr('noDomainStats'))}</span></div>`;
  $('#achievements').innerHTML = achievements.map(labelForAchievement).map(label =>
    `<div class="achievement">${escapeHtml(label)}</div>`
  ).join('') || `<div class="achievement">${escapeHtml(panelTr('noAchievements'))}</div>`;
}

function renderToolCard(tool, { compact = false } = {}) {
  const favorite = toolFavorites.includes(tool.id);
  const accent = toolAccentColor(tool);
  return `
    <article class="tool-directory-card${compact ? ' compact' : ''}" data-tool-id="${escapeHtml(tool.id)}" aria-roledescription="sortable tool" style="--tool-accent: ${escapeHtml(accent)}">
      <button class="tool-card-main" data-action="open-tool" data-tool-id="${escapeHtml(tool.id)}">
        <span class="tool-icon" aria-hidden="true">${renderToolIcon(tool)}</span>
        <span class="tool-card-copy">
          <strong>${escapeHtml(tool.title)}</strong>
          <span>${escapeHtml(tool.description)}</span>
        </span>
      </button>
      <button class="tool-favorite-btn" data-action="toggle-tool-favorite" data-tool-id="${escapeHtml(tool.id)}" aria-label="${escapeHtml(favorite ? panelTr('unfavorite') : panelTr('favorite'))}">${favorite ? '★' : '☆'}</button>
    </article>`;
}

function orderedToolIds() {
  const validIds = self.SuperTabOutTools?.getTools
    ? self.SuperTabOutTools.getTools({ lang: panelLanguage }).map(tool => tool.id)
    : [];
  const validSet = new Set(validIds);
  const next = [];
  for (const id of toolOrder) {
    if (validSet.has(id) && !next.includes(id)) next.push(id);
  }
  for (const id of validIds) {
    if (!next.includes(id)) next.push(id);
  }
  return next;
}

function sortToolsByOrder(tools) {
  const orderMap = new Map(orderedToolIds().map((id, index) => [id, index]));
  return [...tools].sort((a, b) => (orderMap.get(a.id) ?? 999) - (orderMap.get(b.id) ?? 999));
}

function toolListCards() {
  return Array.from(document.querySelectorAll('#toolList .tool-directory-card[data-tool-id]'));
}

function visibleToolListIds() {
  return toolListCards().map(card => card.dataset.toolId).filter(Boolean);
}

function mergeVisibleToolOrder(visibleIds) {
  const currentOrder = orderedToolIds();
  const visibleSet = new Set(visibleIds);
  let visibleIndex = 0;
  return currentOrder.map(id => visibleSet.has(id) ? visibleIds[visibleIndex++] : id);
}

function syncToolListSortClasses() {
  const list = $('#toolList');
  list?.classList.toggle('sorting', toolListSortState.dragging);
  toolListCards().forEach(card => {
    const dragging = toolListSortState.dragging && card.dataset.toolId === toolListSortState.draggedId;
    const dropTarget = toolListSortState.dragging && card.dataset.toolId === toolListSortState.dropTargetId;
    card.classList.toggle('dragging', dragging);
    card.classList.toggle('drop-before', dropTarget && toolListSortState.dropPosition === 'before');
    card.classList.toggle('drop-after', dropTarget && toolListSortState.dropPosition === 'after');
    card.classList.toggle('settled', !toolListSortState.dragging && card.dataset.toolId === toolListSortState.settledId);
  });
}

function clearToolListSettleTimer() {
  if (toolListSortState.settleTimer) clearTimeout(toolListSortState.settleTimer);
  toolListSortState.settleTimer = null;
}

async function saveToolOrder() {
  if (self.SuperTabOutTools?.setToolOrder) {
    toolOrder = await self.SuperTabOutTools.setToolOrder(toolOrder);
  }
}

function reorderToolListAtPoint(event) {
  const cards = toolListCards();
  if (!toolListSortState.draggedId || cards.length < 2) return;
  const visibleIds = cards.map(card => card.dataset.toolId).filter(Boolean);
  const from = visibleIds.indexOf(toolListSortState.draggedId);
  if (from === -1) return;

  let to = visibleIds.length - 1;
  let dropTargetIndex = cards.length - 1;
  let dropPosition = 'after';
  for (let i = 0; i < cards.length; i++) {
    const rect = cards[i].getBoundingClientRect();
    const center = rect.top + rect.height / 2;
    if (event.clientY < center) {
      to = i;
      dropTargetIndex = i;
      dropPosition = 'before';
      break;
    }
  }
  toolListSortState.dropTargetId = cards[dropTargetIndex]?.dataset.toolId || '';
  toolListSortState.dropPosition = dropPosition;
  syncToolListSortClasses();
  if (from < to) to -= 1;
  if (from === to) return;

  const reordered = [...visibleIds];
  const [item] = reordered.splice(from, 1);
  reordered.splice(to, 0, item);
  toolOrder = mergeVisibleToolOrder(reordered);
  renderToolsPanel();
  toolListSortState.draggedId = item;
  toolListSortState.dragging = true;
  toolListSortState.dropTargetId = '';
  toolListSortState.dropPosition = '';
  syncToolListSortClasses();
}

function beginToolListDrag(card, event) {
  toolListSortState.dragging = true;
  toolListSortState.pointerId = event.pointerId;
  toolListSortState.draggedId = card.dataset.toolId;
  toolListSortState.suppressClickUntil = Date.now() + 650;
  toolListSortState.settledId = '';
  toolListSortState.dropTargetId = '';
  toolListSortState.dropPosition = '';
  clearToolListSettleTimer();
  try { card.setPointerCapture?.(event.pointerId); } catch {}
  syncToolListSortClasses();
  event.preventDefault();
}

function handleToolListPointerDown(event) {
  const card = event.target.closest('#toolList .tool-directory-card[data-tool-id]');
  if (!card || event.target.closest('.tool-favorite-btn')) return;
  if (event.button != null && event.button !== 0) return;
  toolListSortState.pointerId = event.pointerId;
  toolListSortState.startX = event.clientX;
  toolListSortState.startY = event.clientY;
  toolListSortState.draggedId = card.dataset.toolId;
}

function handleToolListPointerMove(event) {
  if (toolListSortState.pointerId !== event.pointerId) return;
  if (!toolListSortState.dragging) {
    const dx = Math.abs(event.clientX - toolListSortState.startX);
    const dy = Math.abs(event.clientY - toolListSortState.startY);
    if (Math.max(dx, dy) < DOCK_POINTER_TOLERANCE) return;
    const card = toolListCards().find(item => item.dataset.toolId === toolListSortState.draggedId);
    if (!card) return;
    beginToolListDrag(card, event);
  }
  reorderToolListAtPoint(event);
  event.preventDefault();
}

async function handleToolListPointerEnd(event) {
  if (toolListSortState.pointerId !== event.pointerId && toolListSortState.pointerId != null) return;
  const wasDragging = toolListSortState.dragging;
  toolListSortState.pointerId = null;
  toolListSortState.dragging = false;
  if (wasDragging) {
    const settledId = toolListSortState.draggedId;
    await saveToolOrder();
    await renderToolsPanel();
    toolListSortState.settledId = settledId;
    toolListSortState.dropTargetId = '';
    toolListSortState.dropPosition = '';
    clearToolListSettleTimer();
    toolListSortState.settleTimer = setTimeout(() => {
      toolListSortState.settledId = '';
      syncToolListSortClasses();
    }, 360);
    toolListSortState.suppressClickUntil = Date.now() + 400;
  }
  syncToolListSortClasses();
}

function clearDockLongPress() {
  if (dockSortState.longPressTimer) clearTimeout(dockSortState.longPressTimer);
  dockSortState.longPressTimer = null;
}

function clearDockIdleTimer() {
  if (dockSortState.idleTimer) clearTimeout(dockSortState.idleTimer);
  dockSortState.idleTimer = null;
}

function clearDockSettleTimer() {
  if (dockSortState.settleTimer) clearTimeout(dockSortState.settleTimer);
  dockSortState.settleTimer = null;
}

function resetDockIdleTimer() {
  clearDockIdleTimer();
  if (!dockSortState.editing || dockSortState.dragging) return;
  dockSortState.idleTimer = setTimeout(() => setDockEditing(false), DOCK_EDIT_IDLE_MS);
}

function dockFavoriteButtons() {
  return Array.from(document.querySelectorAll('#commandDockFavorites .command-dock-tool[data-tool-id]'));
}

function visibleDockFavoriteIds() {
  return dockFavoriteButtons().map(btn => btn.dataset.toolId).filter(Boolean);
}

function dockFavoriteLimit() {
  if (window.matchMedia?.(DOCK_COMPACT_QUERY).matches) return 0;
  if (window.matchMedia?.(DOCK_NARROW_QUERY).matches) return 3;
  return DOCK_FAVORITE_LIMIT;
}

function syncDockSortClasses() {
  const dock = $('#commandDockFavorites');
  const rail = document.querySelector('.command-dock-rail');
  dock?.classList.toggle('editing', dockSortState.editing);
  rail?.classList.toggle('sorting', dockSortState.editing);
  dockFavoriteButtons().forEach(btn => {
    const dragging = dockSortState.dragging && btn.dataset.toolId === dockSortState.draggedId;
    const dropTarget = dockSortState.dragging && btn.dataset.toolId === dockSortState.dropTargetId;
    btn.classList.toggle('dragging', dragging);
    btn.classList.toggle('drop-before', dropTarget && dockSortState.dropPosition === 'before');
    btn.classList.toggle('drop-after', dropTarget && dockSortState.dropPosition === 'after');
    btn.classList.toggle('settled', !dockSortState.dragging && btn.dataset.toolId === dockSortState.settledId);
    btn.setAttribute('aria-pressed', dockSortState.editing ? 'true' : 'false');
  });
}

function setDockEditing(editing) {
  dockSortState.editing = editing;
  clearDockLongPress();
  if (!editing) {
    dockSortState.dragging = false;
    dockSortState.pointerId = null;
    dockSortState.draggedId = '';
    dockSortState.dropTargetId = '';
    dockSortState.dropPosition = '';
    dockSortState.settledId = '';
    clearDockSettleTimer();
    clearDockIdleTimer();
  }
  syncDockSortClasses();
  resetDockIdleTimer();
}

function mergeVisibleFavoriteOrder(visibleIds) {
  return [
    ...visibleIds,
    ...toolFavorites.filter(id => !visibleIds.includes(id)),
  ];
}

async function saveFavoriteOrder() {
  if (self.SuperTabOutTools?.setFavoritesOrder) {
    toolFavorites = await self.SuperTabOutTools.setFavoritesOrder(toolFavorites);
    if (self.SuperTabOutTools.getToolOrder) toolOrder = await self.SuperTabOutTools.getToolOrder();
  }
}

function focusDockTool(toolId) {
  setTimeout(() => {
    dockFavoriteButtons()
      .find(btn => btn.dataset.toolId === toolId)
      ?.focus({ preventScroll: true });
  }, 0);
}

async function moveDockFavorite(toolId, offset, { persist = false } = {}) {
  const visibleIds = visibleDockFavoriteIds();
  const from = visibleIds.indexOf(toolId);
  if (from === -1) return false;
  const to = Math.max(0, Math.min(visibleIds.length - 1, from + offset));
  if (from === to) return false;
  const reordered = [...visibleIds];
  const [item] = reordered.splice(from, 1);
  reordered.splice(to, 0, item);
  toolFavorites = mergeVisibleFavoriteOrder(reordered);
  await renderToolsPanel();
  setDockEditing(true);
  dockSortState.draggedId = toolId;
  syncDockSortClasses();
  focusDockTool(toolId);
  if (persist) await saveFavoriteOrder();
  resetDockIdleTimer();
  return true;
}

function reorderDockFavoriteAtPoint(event) {
  const buttons = dockFavoriteButtons();
  if (!dockSortState.draggedId || buttons.length < 2) return;
  const visibleIds = buttons.map(btn => btn.dataset.toolId).filter(Boolean);
  const from = visibleIds.indexOf(dockSortState.draggedId);
  if (from === -1) return;

  const horizontal = window.matchMedia?.(DOCK_BOTTOM_QUERY).matches === true;
  const pointer = horizontal ? event.clientX : event.clientY;
  let to = visibleIds.length - 1;
  let dropTargetIndex = buttons.length - 1;
  let dropPosition = 'after';
  for (let i = 0; i < buttons.length; i++) {
    const rect = buttons[i].getBoundingClientRect();
    const center = horizontal ? rect.left + rect.width / 2 : rect.top + rect.height / 2;
    if (pointer < center) {
      to = i;
      dropTargetIndex = i;
      dropPosition = 'before';
      break;
    }
  }
  dockSortState.dropTargetId = buttons[dropTargetIndex]?.dataset.toolId || '';
  dockSortState.dropPosition = dropPosition;
  syncDockSortClasses();
  if (from < to) to -= 1;
  if (from === to) return;

  const reordered = [...visibleIds];
  const [item] = reordered.splice(from, 1);
  reordered.splice(to, 0, item);
  toolFavorites = mergeVisibleFavoriteOrder(reordered);
  renderToolsPanel();
  dockSortState.draggedId = item;
  dockSortState.dragging = true;
  dockSortState.editing = true;
  dockSortState.dropTargetId = '';
  dockSortState.dropPosition = '';
  syncDockSortClasses();
}

function beginDockDrag(button, event) {
  clearDockLongPress();
  dockSortState.editing = true;
  dockSortState.dragging = true;
  dockSortState.pointerId = event.pointerId;
  dockSortState.draggedId = button.dataset.toolId;
  dockSortState.suppressClickUntil = Date.now() + 800;
  dockSortState.settledId = '';
  dockSortState.dropTargetId = '';
  dockSortState.dropPosition = '';
  clearDockSettleTimer();
  try { button.setPointerCapture?.(event.pointerId); } catch {}
  syncDockSortClasses();
  clearDockIdleTimer();
  event.preventDefault();
}

function handleDockPointerDown(event) {
  const favoriteButton = event.target.closest('#commandDockFavorites .command-dock-tool[data-tool-id]');
  if (!favoriteButton) {
    if (dockSortState.editing && !event.target.closest('.command-dock-rail')) setDockEditing(false);
    return;
  }
  if (event.button != null && event.button !== 0) return;
  dockSortState.pointerId = event.pointerId;
  dockSortState.startX = event.clientX;
  dockSortState.startY = event.clientY;
  dockSortState.draggedId = favoriteButton.dataset.toolId;
  if (dockSortState.editing) {
    beginDockDrag(favoriteButton, event);
    return;
  }
  clearDockLongPress();
  dockSortState.longPressTimer = setTimeout(() => {
    beginDockDrag(favoriteButton, event);
  }, DOCK_LONG_PRESS_MS);
}

function handleDockPointerMove(event) {
  if (dockSortState.pointerId !== event.pointerId) return;
  const dx = Math.abs(event.clientX - dockSortState.startX);
  const dy = Math.abs(event.clientY - dockSortState.startY);
  if (dockSortState.longPressTimer && Math.max(dx, dy) > DOCK_POINTER_TOLERANCE) {
    clearDockLongPress();
    return;
  }
  if (!dockSortState.dragging) return;
  reorderDockFavoriteAtPoint(event);
  event.preventDefault();
}

async function handleDockPointerEnd(event) {
  if (dockSortState.pointerId !== event.pointerId && dockSortState.pointerId != null) return;
  const wasDragging = dockSortState.dragging;
  clearDockLongPress();
  dockSortState.pointerId = null;
  dockSortState.dragging = false;
  if (wasDragging) {
    const settledId = dockSortState.draggedId;
    await saveFavoriteOrder();
    await renderToolsPanel();
    setDockEditing(true);
    dockSortState.settledId = settledId;
    dockSortState.dropTargetId = '';
    dockSortState.dropPosition = '';
    clearDockSettleTimer();
    dockSortState.settleTimer = setTimeout(() => {
      dockSortState.settledId = '';
      syncDockSortClasses();
    }, 360);
    dockSortState.suppressClickUntil = Date.now() + 500;
  }
  syncDockSortClasses();
  resetDockIdleTimer();
}

async function handleDockKeydown(event) {
  const favoriteButton = event.target.closest('#commandDockFavorites .command-dock-tool[data-tool-id]');
  if (!favoriteButton) return;
  const toolId = favoriteButton.dataset.toolId;
  if (event.key === 'Escape' && dockSortState.editing) {
    event.preventDefault();
    setDockEditing(false);
    focusDockTool(toolId);
    return;
  }
  if ((event.key === ' ' || event.key === 'Spacebar') && !dockSortState.editing) {
    event.preventDefault();
    dockSortState.draggedId = toolId;
    setDockEditing(true);
    focusDockTool(toolId);
    return;
  }
  if (!dockSortState.editing) return;
  if (event.key === 'Enter') {
    event.preventDefault();
    await saveFavoriteOrder();
    setDockEditing(false);
    focusDockTool(toolId);
    return;
  }
  const delta = event.key === 'ArrowUp' || event.key === 'ArrowLeft'
    ? -1
    : event.key === 'ArrowDown' || event.key === 'ArrowRight'
      ? 1
      : 0;
  if (delta === 0) return;
  event.preventDefault();
  dockSortState.draggedId = toolId;
  await moveDockFavorite(toolId, delta, { persist: true });
}

function renderDockFavorites(byId) {
  const dock = $('#commandDockFavorites');
  if (!dock) return;
  const favoriteSet = new Set(toolFavorites);
  const favoriteTools = [
    ...orderedToolIds().filter(id => favoriteSet.has(id)),
    ...toolFavorites.filter(id => !orderedToolIds().includes(id)),
  ].map(id => byId.get(id)).filter(Boolean);
  dock.hidden = favoriteTools.length === 0;
  if (favoriteTools.length === 0) {
    dock.innerHTML = '';
    return;
  }

  const visibleLimit = dockFavoriteLimit();
  const visible = favoriteTools.slice(0, visibleLimit);
  const overflowCount = favoriteTools.length - visible.length;
  const favoriteButtons = visible.map(tool => {
    const title = `${tool.title} · ${tool.description}`;
    return `
      <button class="command-dock-tool" data-action="open-tool" data-tool-id="${escapeHtml(tool.id)}" draggable="false" aria-roledescription="sortable favorite" style="--tool-accent: ${escapeHtml(toolAccentColor(tool))}" title="${escapeHtml(title)}" aria-label="${escapeHtml(tool.title)}" type="button">
        <span aria-hidden="true">${renderToolIcon(tool)}</span>
      </button>`;
  }).join('');
  const overflowButton = overflowCount > 0
    ? `<button class="command-dock-tool more" data-command-dock-view="tools" title="${escapeHtml(panelTr('moreFavoriteTools', { count: overflowCount }))}" aria-label="${escapeHtml(panelTr('moreFavoriteTools', { count: overflowCount }))}" type="button">…</button>`
    : '';
  dock.innerHTML = `<div class="command-dock-divider" aria-hidden="true"></div>${favoriteButtons}${overflowButton}`;
  syncDockSortClasses();
}

async function renderToolsPanel() {
  if (!self.SuperTabOutTools || !$('#toolList')) return;
  const query = $('#toolSearch')?.value || '';
  const tools = self.SuperTabOutTools.getTools({ lang: panelLanguage });
  const allTools = query
    ? sortToolsByOrder(self.SuperTabOutTools.searchTools(query, { lang: panelLanguage }))
    : sortToolsByOrder(tools);
  const byId = new Map(tools.map(tool => [tool.id, tool]));

  renderDockFavorites(byId);
  $('#toolList').innerHTML = allTools.map(tool => renderToolCard(tool)).join('')
    || `<div class="result-card"><div class="result-meta">${escapeHtml(panelTr('noResults'))}</div></div>`;
  syncToolListSortClasses();
}

function labelForAchievement(id) {
  return ({
    'closed-10': panelTr('achievementClosed10'),
    'closed-100': panelTr('achievementClosed100'),
    'saved-10': panelTr('achievementSaved10'),
    'dedupe-10': panelTr('achievementDedupe10'),
    'session-saver': panelTr('achievementSessionSaver'),
    'calm-deck': panelTr('achievementCalmDeck'),
  })[id] || id;
}

function toolAccentColor(tool) {
  return ({
    blue: '#2563eb',
    teal: '#0f766e',
    slate: '#475569',
    amber: '#d97706',
    green: '#15803d',
    red: '#dc2626',
    purple: '#7c3aed',
  })[tool?.accent] || '#475569';
}

async function renderAll() {
  renderResults();
  await renderRecent();
  if ($('#healthView') && !$('#healthView')?.hidden) await renderHealth();
  await renderToolsPanel();
}

async function saveCurrentSession() {
  const response = await chrome.runtime.sendMessage({ type: 'save-current-session', scope: 'all' });
  if (response?.ok) {
    toast(panelTr('sessionSaved'));
    await refreshData();
  }
}

async function cleanDuplicates() {
  const counts = new Map();
  for (const tab of openTabs) counts.set(tab.url, (counts.get(tab.url) || 0) + 1);
  const urls = Array.from(counts.entries()).filter(([, count]) => count > 1).map(([url]) => url);
  if (urls.length === 0) {
    toast(panelTr('noDuplicates'));
    return;
  }
  const closed = await self.SuperTabOutTabs.closeDuplicateTabs(urls, true);
  await self.SuperTabOutStorage.recordActivity({ type: 'duplicateClosed', count: closed.length || urls.length });
  toast(panelTr('duplicatesCleaned'));
  await refreshData();
}

async function restoreSavedSession(id) {
  const session = savedSessions.find(item => item.id === id);
  if (!session) return;
  if (self.SuperTabOutTabs?.restoreSavedSession) {
    await self.SuperTabOutTabs.restoreSavedSession(session, { focused: true });
  } else {
    const urls = session.urls?.length ? session.urls : (session.tabs || []).map(tab => tab.url);
    if (urls.length) await chrome.windows.create({ url: urls });
  }
  await refreshData();
}

function toolPageUrl(toolId, input = '') {
  const params = new URLSearchParams();
  if (toolId) params.set('tool', toolId);
  if (input) {
    params.set('input', input);
    params.set('source', input);
  }
  return chrome.runtime.getURL(`tools.html?${params.toString()}`);
}

async function getCurrentTabUrl() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return self.SuperTabOutTabs?.isInternalUrl?.(tab?.url || '', chrome.runtime.id) ? '' : tab?.url || '';
  } catch {
    return '';
  }
}

async function openTool(toolId, input = '') {
  await self.SuperTabOutTools?.recordRecent(toolId);
  await chrome.tabs.create({ url: toolPageUrl(toolId, input) });
  if (self.SuperTabOutTools) toolRecent = await self.SuperTabOutTools.getRecent();
  await renderToolsPanel();
}

function renderQrLike(text) {
  const value = String(text || '').trim();
  if (!value) {
    $('#qrBox').innerHTML = `<div class="result-meta">${escapeHtml(panelTr('qrEmpty'))}</div>`;
    return;
  }

  const size = 29;
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  function bit(x, y) {
    const finder = (x < 7 && y < 7) || (x > size - 8 && y < 7) || (x < 7 && y > size - 8);
    if (finder) return x === 0 || y === 0 || x === 6 || y === 6 || (x > 1 && x < 5 && y > 1 && y < 5);
    const n = Math.imul(hash ^ (x * 73856093) ^ (y * 19349663), 83492791);
    return ((n >>> ((x + y) % 16)) & 1) === 1;
  }
  const cells = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (bit(x, y)) cells.push(`<rect x="${x}" y="${y}" width="1" height="1"/>`);
    }
  }
  $('#qrBox').innerHTML = `<svg viewBox="0 0 ${size} ${size}" role="img" aria-label="${escapeHtml(panelTr('qrAria'))}"><rect width="${size}" height="${size}" fill="white"/><g fill="#111">${cells.join('')}</g></svg>`;
}

function convertTime() {
  const raw = $('#timeInput').value.trim();
  const n = Number(raw);
  let date = Number.isFinite(n)
    ? new Date(String(Math.trunc(n)).length <= 10 ? n * 1000 : n)
    : new Date(raw);
  if (Number.isNaN(date.getTime())) {
    $('#timeOutput').textContent = panelTr('invalidDate');
    return;
  }
  $('#timeOutput').textContent = `${date.toISOString()} · ${date.toLocaleString()}`;
}

document.addEventListener('click', async (e) => {
  if (Date.now() < toolListSortState.suppressClickUntil) {
    e.preventDefault();
    e.stopImmediatePropagation();
    return;
  }
  if (Date.now() < dockSortState.suppressClickUntil) {
    e.preventDefault();
    e.stopImmediatePropagation();
    return;
  }
  if (dockSortState.editing && e.target.closest('#commandDockFavorites .command-dock-tool[data-tool-id]')) {
    e.preventDefault();
    resetDockIdleTimer();
    return;
  }
  if (dockSortState.editing && e.target.closest('[data-command-dock-view]')) {
    setDockEditing(false);
  }
  if (dockSortState.editing && !e.target.closest('#commandDockFavorites') && !e.target.closest('.command-dock-rail')) {
    setDockEditing(false);
  }

  const tab = e.target.closest('.panel-tab');
  if (tab) {
    setPanelView(tab.dataset.view);
    return;
  }

  const actionEl = e.target.closest('[data-action]');
  if (!actionEl) return;

  const embeddedDrawer = document.getElementById('commandDrawer');
  if (embeddedDrawer && !embeddedDrawer.contains(actionEl) && !actionEl.closest('.command-dock-rail')) return;

  const action = actionEl.dataset.action;
  const url = actionEl.dataset.url;
  if (action === 'focus') await self.SuperTabOutTabs.focusTab(url);
  if (action === 'save-tab') {
    await self.SuperTabOutStorage.addDeferredTab({ url, title: actionEl.dataset.title || url });
    await self.SuperTabOutTabs.closeTabsByUrls([url]);
    await self.SuperTabOutStorage.recordActivity({ type: 'saved', count: 1, domain: domainFor(url) });
    toast(panelTr('savedForLater'));
    await refreshData();
  }
  if (action === 'close-url') {
    const closed = await self.SuperTabOutTabs.closeTabsByUrls([url]);
    await self.SuperTabOutStorage.recordActivity({ type: 'closed', count: closed.length || 1, domain: domainFor(url) });
    toast(panelTr('tabClosed'));
    await refreshData();
  }
  if (action === 'open-url') await chrome.tabs.create({ url });
  if (action === 'restore-recent') {
    await self.SuperTabOutTabs.restoreSession(actionEl.dataset.sessionId);
    await refreshData();
  }
  if (action === 'restore-saved-session') await restoreSavedSession(actionEl.dataset.sessionId);
  if (action === 'open-tool') await openTool(actionEl.dataset.toolId, actionEl.dataset.toolInput || '');
  if (action === 'open-tool-current') await openTool(actionEl.dataset.toolId, await getCurrentTabUrl());
  if (action === 'toggle-tool-favorite') {
    const id = actionEl.dataset.toolId;
    toolFavorites = await self.SuperTabOutTools.setFavorite(id, !toolFavorites.includes(id));
    if (self.SuperTabOutTools.getToolOrder) toolOrder = await self.SuperTabOutTools.getToolOrder();
    renderResults();
    await renderToolsPanel();
  }
});

$('#panelSearch')?.addEventListener('input', (e) => {
  currentQuery = e.target.value;
  renderResults();
});
$('#refreshBtn')?.addEventListener('click', refreshData);
$('#saveSessionBtn')?.addEventListener('click', saveCurrentSession);
$('#dedupeBtn')?.addEventListener('click', cleanDuplicates);
$('#newTabBtn')?.addEventListener('click', () => chrome.tabs.create({ url: chrome.runtime.getURL('index.html') }));
$('#toolSearch')?.addEventListener('input', renderToolsPanel);
$('#openToolsPageBtn')?.addEventListener('click', () => chrome.tabs.create({ url: chrome.runtime.getURL('tools.html') }));
window.addEventListener('resize', () => {
  if (dockResizeTimer) clearTimeout(dockResizeTimer);
  dockResizeTimer = setTimeout(() => {
    dockResizeTimer = null;
    renderToolsPanel();
  }, 120);
});
document.addEventListener('pointerdown', handleDockPointerDown);
document.addEventListener('pointermove', handleDockPointerMove);
document.addEventListener('pointerup', handleDockPointerEnd);
document.addEventListener('pointercancel', handleDockPointerEnd);
document.addEventListener('pointerdown', handleToolListPointerDown);
document.addEventListener('pointermove', handleToolListPointerMove);
document.addEventListener('pointerup', handleToolListPointerEnd);
document.addEventListener('pointercancel', handleToolListPointerEnd);
document.addEventListener('keydown', handleDockKeydown);

document.addEventListener('super-tab-out-panel-refresh', refreshData);
document.addEventListener('super-tab-out-command-view', (event) => setPanelView(event.detail?.view || activePanelView()));
document.addEventListener('super-tab-out-language-change', () => applyPanelTranslations({ rerender: true }));
window.addEventListener('storage', (event) => {
  if (event.key === PANEL_LANGUAGE_KEY) applyPanelTranslations({ rerender: true });
});

applyPanelTranslations();
refreshData();
})();

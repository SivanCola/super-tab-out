'use strict';

(function initToolsWorkbench() {
  const Tools = self.SuperTabOutTools;
  const Tabs = self.SuperTabOutTabs;
  if (!Tools) return;

  const LANGUAGE_KEY = 'tab-out-language';
  const PAGE_COPY = {
    en: {
      title: 'Tools',
      searchTools: 'Search tools',
      favoriteTools: 'Favorites',
      allTools: 'All tools',
      noFavorites: 'No favorites yet.',
      noTools: 'No tools found.',
      useCurrentUrl: 'Use current URL',
      favorite: 'Favorite',
      unfavorite: 'Unfavorite',
      copyOutput: 'Copy output',
      download: 'Download',
      dashboard: 'Dashboard',
      input: 'Input',
      inputHelp: 'Paste text, use an example, or send the current tab here.',
      result: 'Result',
      preview: 'Preview',
      text: 'Text',
      clear: 'Clear',
      inputPlaceholder: 'Paste text here...',
      outputCopied: 'Output copied',
      valueCopied: 'Value copied',
      outputDownloaded: 'Output downloaded',
      runFirst: 'Run a tool first.',
      currentUrlLoaded: 'Current URL loaded',
      noSourceUrl: 'No source URL available.',
      localTool: 'Local tool',
      ready: 'Ready',
      error: 'Error',
      emptyPreview: 'Run an action to preview the result.',
      diagnostics: 'Diagnostics',
      fields: 'Fields',
      queryParams: 'Query params',
      noParams: 'No query params.',
      key: 'Key',
      value: 'Value',
      decoded: 'Decoded',
      copy: 'Copy',
      qrMeta: ({ count }) => `${count} byte${count === 1 ? '' : 's'} encoded locally`,
    },
    zh: {
      title: '工具',
      searchTools: '搜索工具',
      favoriteTools: '收藏',
      allTools: '全部工具',
      noFavorites: '暂无收藏工具。',
      noTools: '没有找到工具。',
      useCurrentUrl: '使用当前 URL',
      favorite: '收藏',
      unfavorite: '取消收藏',
      copyOutput: '复制输出',
      download: '下载',
      dashboard: '仪表盘',
      input: '输入',
      inputHelp: '粘贴文本、使用示例，或把当前标签页发送到这里。',
      result: '结果',
      preview: '预览',
      text: '文本',
      clear: '清空',
      inputPlaceholder: '在这里粘贴文本...',
      outputCopied: '输出已复制',
      valueCopied: '值已复制',
      outputDownloaded: '已下载输出',
      runFirst: '请先运行工具。',
      currentUrlLoaded: '已填入当前 URL',
      noSourceUrl: '没有可用的来源 URL。',
      localTool: '本地工具',
      ready: '就绪',
      error: '错误',
      emptyPreview: '运行一个操作后预览结果。',
      diagnostics: '诊断',
      fields: '字段',
      queryParams: '查询参数',
      noParams: '没有查询参数。',
      key: '键',
      value: '值',
      decoded: '解码',
      copy: '复制',
      qrMeta: ({ count }) => `已在本地编码 ${count} 字节`,
    },
  };

  const ACCENT_COLORS = {
    blue: '#2563eb',
    teal: '#0f766e',
    slate: '#475569',
    amber: '#d97706',
    green: '#15803d',
    red: '#dc2626',
    purple: '#7c3aed',
  };

  let lang = getLanguage();
  let selectedToolId = new URLSearchParams(location.search).get('tool') || 'json';
  let stateSaveTimer = null;
  let lastResult = null;
  let resultView = 'preview';
  let sourceUrl = '';

  const $ = selector => document.querySelector(selector);

  function getLanguage() {
    try {
      const value = localStorage.getItem(LANGUAGE_KEY);
      if (value === 'zh' || value === 'en') return value;
    } catch {}
    return 'en';
  }

  function pageTr(key, params = {}) {
    const value = PAGE_COPY[lang]?.[key] || PAGE_COPY.en[key] || key;
    return typeof value === 'function' ? value(params) : value;
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function createEl(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = String(text);
    return node;
  }

  function toast(message) {
    const el = $('#toolsToast');
    el.textContent = message;
    el.classList.add('visible');
    setTimeout(() => el.classList.remove('visible'), 2000);
  }

  function currentTool() {
    return Tools.getTool(selectedToolId, { lang }) || Tools.getTools({ lang })[0];
  }

  function accentColor(tool) {
    return ACCENT_COLORS[tool.accent] || ACCENT_COLORS.slate;
  }

  function renderToolIcon(tool) {
    return Tools.getToolIconSvg
      ? Tools.getToolIconSvg(tool.icon)
      : `<span class="tool-icon-fallback">${escapeHtml(tool.id.slice(0, 2).toUpperCase())}</span>`;
  }

  function renderList(container, tools, emptyText) {
    container.innerHTML = tools.map(tool => `
      <button class="tools-list-button${tool.id === selectedToolId ? ' active' : ''}" style="--tool-accent: ${escapeHtml(accentColor(tool))}" data-tool-id="${escapeHtml(tool.id)}">
        <span class="tool-icon" aria-hidden="true">${renderToolIcon(tool)}</span>
        <span class="tools-list-copy">
          <strong>${escapeHtml(tool.title)}</strong>
          <span>${escapeHtml(tool.description)}</span>
        </span>
      </button>
    `).join('') || `<div class="tools-list-empty">${escapeHtml(emptyText)}</div>`;
  }

  function renderToolLists() {
    const query = $('#toolSearchPage').value.trim();
    const all = Tools.searchTools(query, { lang });
    renderList($('#toolsList'), all, pageTr('noTools'));
  }

  function applyTranslations() {
    lang = getLanguage();
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
    document.title = `Super Tab Out ${pageTr('title')}`;
    $('#toolsTitle').textContent = pageTr('title');
    $('#toolSearchLabel').textContent = pageTr('searchTools');
    $('#toolSearchPage').placeholder = pageTr('searchTools');
    $('#toolSearchPage').setAttribute('aria-label', pageTr('searchTools'));
    document.querySelectorAll('[data-tool-copy]').forEach(el => { el.textContent = pageTr(el.dataset.toolCopy); });
    $('#useCurrentUrlBtn').textContent = pageTr('useCurrentUrl');
    $('#copyToolOutputBtn').textContent = pageTr('copyOutput');
    $('#downloadToolOutputBtn').textContent = pageTr('download');
    $('#dashboardLink').textContent = pageTr('dashboard');
    $('#toolInputTitle').textContent = pageTr('input');
    $('#toolInputHelp').textContent = pageTr('inputHelp');
    $('#toolOutputTitle').textContent = pageTr('result');
    $('#previewViewBtn').textContent = pageTr('preview');
    $('#textViewBtn').textContent = pageTr('text');
    $('#clearToolBtn').textContent = pageTr('clear');
    $('#toolInput').placeholder = pageTr('inputPlaceholder');
  }

  function orderedActions(tool) {
    const byId = new Map(tool.actions.map(action => [action.id, action]));
    const ordered = tool.primaryActions.map(id => byId.get(id)).filter(Boolean);
    for (const action of tool.actions) {
      if (!ordered.some(item => item.id === action.id)) ordered.push(action);
    }
    return ordered;
  }

  function renderActions(tool, activeAction) {
    $('#toolActions').innerHTML = orderedActions(tool).map((action, index) => `
      <button data-tool-action="${escapeHtml(action.id)}"${(activeAction || tool.primaryActions[0] || tool.actions[0]?.id) === action.id || (!activeAction && index === 0) ? ' class="active"' : ''}>
        ${escapeHtml(action.label)}
      </button>
    `).join('');
  }

  function renderExamples(tool) {
    $('#toolExamples').innerHTML = tool.examples.map(example => `
      <button class="tool-example-btn" data-example-action="${escapeHtml(example.action)}" data-example-value="${escapeHtml(example.value)}">
        ${escapeHtml(example.label)}
      </button>
    `).join('');
  }

  function isInternalUrl(url) {
    return Tabs?.isInternalUrl
      ? Tabs.isInternalUrl(url || '', chrome.runtime.id)
      : /^(chrome|chrome-extension|edge|brave|about):/.test(url || '');
  }

  function isUsableSourceUrl(url) {
    try {
      const parsed = new URL(url || '');
      return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && !isInternalUrl(parsed.href);
    } catch {
      return false;
    }
  }

  async function selectTool(id, { keepInput = false, inputOverride = null, actionOverride = null } = {}) {
    selectedToolId = Tools.getTool(id) ? id : 'json';
    const tool = currentTool();
    history.replaceState(null, '', `tools.html?tool=${encodeURIComponent(selectedToolId)}`);

    $('#toolCategory').textContent = `${pageTr('localTool')} · ${tool.categoryLabel}`;
    $('#toolTitle').textContent = tool.title;
    $('#toolDescription').textContent = tool.description;
    renderActions(tool, actionOverride);
    renderExamples(tool);

    if (!keepInput) {
      const savedState = await Tools.getToolState(tool.id);
      const hasInputOverride = inputOverride != null;
      $('#toolInput').value = inputOverride != null ? inputOverride : savedState.input || '';
      $('#toolOutput').value = hasInputOverride ? '' : savedState.output || '';
      $('#toolStatus').textContent = hasInputOverride ? pageTr('ready') : savedState.status || pageTr('ready');
      $('#toolStatus').classList.toggle('error', hasInputOverride ? false : savedState.error === true);
      lastResult = null;
      renderDiagnostics(null);
      renderPreview(null);
      if (!hasInputOverride && savedState.output) setResultView('text');
      else setResultView('preview');
      if (!hasInputOverride && savedState.action) renderActions(tool, savedState.action);
    }

    renderToolLists();
  }

  async function getExportTabs(scope) {
    const allTabs = await chrome.tabs.query(scope === 'current' ? { currentWindow: true } : {});
    const groupIds = Array.from(new Set(allTabs.map(tab => tab.groupId).filter(id => id >= 0)));
    const groups = new Map();
    for (const id of groupIds) {
      try {
        const group = await chrome.tabGroups.get(id);
        groups.set(id, group);
      } catch {}
    }
    return allTabs
      .filter(tab => Tabs?.isInternalUrl ? !Tabs.isInternalUrl(tab.url || '', chrome.runtime.id) : /^https?:/.test(tab.url || ''))
      .map(tab => ({
        title: tab.title || tab.url,
        url: tab.url,
        pinned: tab.pinned === true,
        windowId: tab.windowId,
        index: tab.index,
        groupTitle: groups.get(tab.groupId)?.title || '',
      }));
  }

  async function runSelectedTool(actionId) {
    const tool = currentTool();
    const status = $('#toolStatus');
    const output = $('#toolOutput');
    let options = { action: actionId, lang };

    if (tool.id === 'session-export') {
      const scope = actionId.startsWith('current-') ? 'current' : 'all';
      const [currentWindow, tabs] = await Promise.all([
        chrome.windows.getCurrent(),
        getExportTabs(scope),
      ]);
      options = { ...options, tabs, currentWindowId: currentWindow.id };
    }

    const result = await Tools.runTool(tool.id, $('#toolInput').value, options);
    lastResult = result;
    output.value = result.ok ? result.output : '';
    if (result.meta?.suggestedInput) $('#toolInput').value = result.meta.suggestedInput;
    status.textContent = result.ok ? Tools.tr(result.meta?.labelKey, lang) || pageTr('ready') : `${pageTr('error')}: ${result.error}`;
    status.classList.toggle('error', !result.ok);
    renderDiagnostics(result);
    renderPreview(result);
    setResultView(result.ok && !result.visual ? 'text' : 'preview');
    await Tools.recordRecent(tool.id);
    await Tools.setToolState(tool.id, {
      input: $('#toolInput').value,
      output: output.value,
      status: status.textContent,
      error: !result.ok,
      action: actionId,
    });
    renderToolLists();
  }

  function renderDiagnostics(result) {
    const box = $('#toolDiagnostics');
    box.textContent = '';
    box.hidden = true;
    if (!result?.diagnostics) return;
    const diag = result.diagnostics;
    const message = diag.line
      ? `${pageTr('diagnostics')}: ${diag.message} · line ${diag.line}, column ${diag.column}`
      : `${pageTr('diagnostics')}: ${diag.message}`;
    box.textContent = message;
    box.hidden = false;
  }

  function renderPreview(result) {
    const preview = $('#toolPreview');
    preview.textContent = '';
    if (!result?.ok) {
      preview.append(createEl('div', 'preview-empty', result?.error || pageTr('emptyPreview')));
      return;
    }
    if (!result.visual) {
      const pre = createEl('pre', 'json-tree', result.output || pageTr('emptyPreview'));
      preview.append(pre);
      return;
    }
    if (result.visual.type === 'json-tree') renderJsonPreview(preview, result.visual);
    else if (result.visual.type === 'url') renderUrlPreview(preview, result.visual);
    else if (result.visual.type === 'qr') renderQrPreview(preview, result.visual);
    else if (result.visual.type === 'timestamp') renderTimestampPreview(preview, result.visual);
    else if (result.visual.type === 'key-value') renderKeyValuePreview(preview, result.visual);
    else preview.append(createEl('div', 'preview-empty', pageTr('emptyPreview')));
  }

  function renderJsonPreview(root, visual) {
    const title = createEl('div', 'visual-section-title', visual.summary || 'JSON');
    const tree = createEl('div', 'json-tree');
    tree.append(renderJsonNode(visual.tree, true));
    root.append(title, tree);
  }

  function renderJsonNode(node, open = false) {
    if (!node?.children) {
      const line = createEl('div');
      const key = createEl('span', 'json-key', `${node.key}: `);
      const value = createEl('span', 'json-value', node.summary);
      const type = createEl('span', 'json-type', ` (${node.type})`);
      line.append(key, value, type);
      return line;
    }
    const details = document.createElement('details');
    details.open = open;
    const summary = document.createElement('summary');
    const key = createEl('span', 'json-key', node.key);
    const type = createEl('span', 'json-type', ` ${node.type} · ${node.summary}`);
    summary.append(key, type);
    details.append(summary);
    node.children.forEach(child => details.append(renderJsonNode(child)));
    return details;
  }

  function renderUrlPreview(root, visual) {
    const fields = createEl('section', 'visual-section');
    fields.append(createEl('h4', 'visual-section-title', pageTr('fields')));
    fields.append(renderRowsTable(visual.fields.map(([key, value]) => ({ key, value })), false));
    const params = createEl('section', 'visual-section');
    params.append(createEl('h4', 'visual-section-title', pageTr('queryParams')));
    if (visual.params.length) {
      const table = document.createElement('table');
      table.className = 'visual-table';
      table.innerHTML = `<thead><tr><th>${escapeHtml(pageTr('key'))}</th><th>${escapeHtml(pageTr('value'))}</th><th>${escapeHtml(pageTr('decoded'))}</th><th></th></tr></thead>`;
      const body = document.createElement('tbody');
      visual.params.forEach(row => {
        const tr = document.createElement('tr');
        [row.key, row.value, row.decodedValue].forEach(value => {
          const td = document.createElement('td');
          td.textContent = value;
          tr.append(td);
        });
        const action = document.createElement('td');
        const copy = createEl('button', 'copy-chip-btn', pageTr('copy'));
        copy.dataset.copyValue = row.value;
        action.append(copy);
        tr.append(action);
        body.append(tr);
      });
      table.append(body);
      params.append(table);
    } else {
      params.append(createEl('div', 'visual-muted', pageTr('noParams')));
    }
    root.append(fields, params);
  }

  function renderKeyValuePreview(root, visual) {
    root.append(renderRowsTable(visual.rows || [], true));
  }

  function renderRowsTable(rows, withCopy) {
    const table = document.createElement('table');
    table.className = 'visual-table';
    table.innerHTML = `<thead><tr><th>${escapeHtml(pageTr('key'))}</th><th>${escapeHtml(pageTr('value'))}</th>${withCopy ? '<th></th>' : ''}</tr></thead>`;
    const body = document.createElement('tbody');
    rows.forEach(row => {
      const tr = document.createElement('tr');
      const key = document.createElement('td');
      key.textContent = row.key;
      const value = document.createElement('td');
      value.textContent = row.value;
      tr.append(key, value);
      if (withCopy) {
        const action = document.createElement('td');
        const copy = createEl('button', 'copy-chip-btn', pageTr('copy'));
        copy.dataset.copyValue = row.value;
        action.append(copy);
        tr.append(action);
      }
      body.append(tr);
    });
    table.append(body);
    return table;
  }

  function renderQrPreview(root, visual) {
    const wrap = createEl('div', 'qr-preview');
    const frame = createEl('div', 'qr-frame');
    frame.innerHTML = visual.svg;
    wrap.append(frame, createEl('div', 'visual-muted', pageTr('qrMeta', { count: visual.textLength || 0 })));
    root.append(wrap);
  }

  function renderTimestampPreview(root, visual) {
    const grid = createEl('div', 'timestamp-grid');
    visual.cards.forEach(card => {
      const item = createEl('div', 'timestamp-card');
      item.append(createEl('span', null, card.label), createEl('strong', null, card.value));
      grid.append(item);
    });
    root.append(grid);
  }

  function setResultView(view) {
    resultView = view === 'text' ? 'text' : 'preview';
    const outputPanel = $('.output-panel');
    outputPanel.classList.toggle('text-mode', resultView === 'text');
    document.querySelectorAll('[data-result-view]').forEach(btn => {
      const active = btn.dataset.resultView === resultView;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-selected', active ? 'true' : 'false');
    });
  }

  async function saveStateSoon() {
    clearTimeout(stateSaveTimer);
    stateSaveTimer = setTimeout(async () => {
      const tool = currentTool();
      const activeAction = document.querySelector('[data-tool-action].active')?.dataset.toolAction || tool.primaryActions[0];
      await Tools.setToolState(tool.id, {
        input: $('#toolInput').value,
        output: $('#toolOutput').value,
        status: $('#toolStatus').textContent,
        error: $('#toolStatus').classList.contains('error'),
        action: activeAction,
      });
    }, 250);
  }

  async function useCurrentUrl() {
    let url = sourceUrl;
    if (!isUsableSourceUrl(url)) {
      const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
      url = isUsableSourceUrl(active?.url) ? active.url : '';
    }
    if (!url) {
      toast(pageTr('noSourceUrl'));
      return;
    }
    $('#toolInput').value = url;
    toast(pageTr('currentUrlLoaded'));
    await saveStateSoon();
  }

  async function copyOutput() {
    const output = $('#toolOutput').value;
    if (!output) {
      toast(pageTr('runFirst'));
      return;
    }
    await navigator.clipboard.writeText(output);
    toast(pageTr('outputCopied'));
  }

  function downloadOutput() {
    const output = $('#toolOutput').value;
    if (!output) {
      toast(pageTr('runFirst'));
      return;
    }
    const isSvg = lastResult?.meta?.mime === 'image/svg+xml';
    const blob = new Blob([output], { type: isSvg ? 'image/svg+xml' : 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = isSvg ? 'super-tab-out-qr.svg' : `super-tab-out-${selectedToolId}.txt`;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    toast(pageTr('outputDownloaded'));
  }

  function clearTool() {
    $('#toolInput').value = '';
    $('#toolOutput').value = '';
    $('#toolStatus').textContent = pageTr('ready');
    $('#toolStatus').classList.remove('error');
    lastResult = null;
    renderDiagnostics(null);
    renderPreview(null);
    saveStateSoon();
  }

  document.addEventListener('click', async (event) => {
    const listButton = event.target.closest('.tools-list-button[data-tool-id]');
    if (listButton) {
      await selectTool(listButton.dataset.toolId);
      return;
    }

    const actionButton = event.target.closest('[data-tool-action]');
    if (actionButton) {
      document.querySelectorAll('[data-tool-action]').forEach(btn => btn.classList.toggle('active', btn === actionButton));
      await runSelectedTool(actionButton.dataset.toolAction);
      return;
    }

    const example = event.target.closest('[data-example-value]');
    if (example) {
      $('#toolInput').value = example.dataset.exampleValue || '';
      const action = example.dataset.exampleAction || currentTool().primaryActions[0];
      document.querySelectorAll('[data-tool-action]').forEach(btn => btn.classList.toggle('active', btn.dataset.toolAction === action));
      await runSelectedTool(action);
      return;
    }

    const copy = event.target.closest('.copy-chip-btn[data-copy-value]');
    if (copy) {
      await navigator.clipboard.writeText(copy.dataset.copyValue || '');
      toast(pageTr('valueCopied'));
      return;
    }

    const viewButton = event.target.closest('[data-result-view]');
    if (viewButton) setResultView(viewButton.dataset.resultView);
  });

  $('#toolSearchPage').addEventListener('input', renderToolLists);
  $('#toolInput').addEventListener('input', saveStateSoon);
  $('#useCurrentUrlBtn').addEventListener('click', useCurrentUrl);
  $('#copyToolOutputBtn').addEventListener('click', copyOutput);
  $('#downloadToolOutputBtn').addEventListener('click', downloadOutput);
  $('#clearToolBtn').addEventListener('click', clearTool);
  window.addEventListener('storage', async (event) => {
    if (event.key !== LANGUAGE_KEY) return;
    applyTranslations();
    await selectTool(selectedToolId, { keepInput: true });
  });

  (async () => {
    applyTranslations();
    const params = new URLSearchParams(location.search);
    sourceUrl = params.get('source') || params.get('input') || '';
    await selectTool(params.get('tool') || selectedToolId, {
      inputOverride: params.get('input'),
      actionOverride: params.get('action'),
    });
    const action = params.get('action');
    if (action) await runSelectedTool(action);
  })();
})();

/* Super Tab Out local tools registry.
   Inspired by FeHelper's tool collection shape, but implemented from scratch. */
(function (global) {
  'use strict';

  const FAVORITES_KEY = 'toolFavorites';
  const TOOL_ORDER_KEY = 'toolOrder';
  const RECENT_KEY = 'toolRecent';
  const STATE_PREFIX = 'toolState:';
  const STATE_MAX_CHARS = 20000;
  const RECENT_LIMIT = 12;

  const TOOL_COPY = {
    en: {
      toolJson: 'JSON',
      toolJsonDesc: 'Format, minify, and validate JSON.',
      toolUrl: 'URL parser',
      toolUrlDesc: 'Parse query params, encode, or decode URLs.',
      toolCodec: 'Codec',
      toolCodecDesc: 'Base64, Unicode, and HTML entity conversion.',
      toolTimestamp: 'Timestamp',
      toolTimestampDesc: 'Convert Unix timestamps, dates, and FILETIME.',
      toolQr: 'QR',
      toolQrDesc: 'Generate a real local QR SVG for text or URLs.',
      toolUuid: 'UUID & password',
      toolUuidDesc: 'Generate UUID v4 values and local random passwords.',
      toolHash: 'Hash',
      toolHashDesc: 'Calculate MD5, SHA-1, and SHA-256 hashes.',
      toolCookie: 'Cookie to JSON',
      toolCookieDesc: 'Convert a Cookie header string into JSON.',
      toolSessionExport: 'Session export',
      toolSessionExportDesc: 'Export current or all windows as JSON, Markdown, or URL lists.',
      actionFormat: 'Format',
      actionMinify: 'Minify',
      actionValidate: 'Validate',
      actionParse: 'Parse',
      actionEncode: 'Encode',
      actionDecode: 'Decode',
      actionBase64Encode: 'Base64 encode',
      actionBase64Decode: 'Base64 decode',
      actionUnicodeEncode: 'Unicode encode',
      actionUnicodeDecode: 'Unicode decode',
      actionHtmlEncode: 'HTML encode',
      actionHtmlDecode: 'HTML decode',
      actionConvert: 'Convert',
      actionNow: 'Now',
      actionTodayStart: 'Today start',
      actionYesterday: 'Yesterday',
      actionWeekStart: 'Week start',
      actionFiletime: 'FILETIME',
      actionGenerateQr: 'Generate',
      actionUuid: 'UUID v4',
      actionPassword: 'Password',
      actionMd5: 'MD5',
      actionSha1: 'SHA-1',
      actionSha256: 'SHA-256',
      actionCookieJson: 'To JSON',
      actionCurrentJson: 'Current JSON',
      actionAllJson: 'All JSON',
      actionCurrentMarkdown: 'Current Markdown',
      actionAllMarkdown: 'All Markdown',
      actionCurrentUrls: 'Current URLs',
      actionAllUrls: 'All URLs',
      okJsonValid: 'Valid JSON',
      okParsed: 'Parsed',
      okEncoded: 'Encoded',
      okDecoded: 'Decoded',
      okConverted: 'Converted',
      okGenerated: 'Generated',
      okExported: 'Exported',
      categoryFormat: 'Format',
      categoryEncode: 'Encoding',
      categoryTime: 'Time',
      categoryGenerate: 'Generate',
      categoryCrypto: 'Crypto',
      categoryTabs: 'Tabs',
    },
    zh: {
      toolJson: 'JSON',
      toolJsonDesc: '格式化、压缩和校验 JSON。',
      toolUrl: 'URL 解析',
      toolUrlDesc: '解析查询参数，编码或解码 URL。',
      toolCodec: '编解码',
      toolCodecDesc: 'Base64、Unicode 和 HTML Entity 转换。',
      toolTimestamp: '时间戳',
      toolTimestampDesc: '转换 Unix 时间戳、日期和 FILETIME。',
      toolQr: '二维码',
      toolQrDesc: '为文本或 URL 生成真实的本地二维码 SVG。',
      toolUuid: 'UUID 与密码',
      toolUuidDesc: '生成 UUID v4 和本地随机密码。',
      toolHash: 'Hash',
      toolHashDesc: '计算 MD5、SHA-1 和 SHA-256。',
      toolCookie: 'Cookie 转 JSON',
      toolCookieDesc: '把 Cookie 字符串转换为 JSON。',
      toolSessionExport: '会话导出',
      toolSessionExportDesc: '把当前窗口或全部窗口导出为 JSON、Markdown 或 URL 列表。',
      actionFormat: '格式化',
      actionMinify: '压缩',
      actionValidate: '校验',
      actionParse: '解析',
      actionEncode: '编码',
      actionDecode: '解码',
      actionBase64Encode: 'Base64 编码',
      actionBase64Decode: 'Base64 解码',
      actionUnicodeEncode: 'Unicode 编码',
      actionUnicodeDecode: 'Unicode 解码',
      actionHtmlEncode: 'HTML 编码',
      actionHtmlDecode: 'HTML 解码',
      actionConvert: '转换',
      actionNow: '当前',
      actionTodayStart: '今天开始',
      actionYesterday: '昨天',
      actionWeekStart: '本周开始',
      actionFiletime: 'FILETIME',
      actionGenerateQr: '生成',
      actionUuid: 'UUID v4',
      actionPassword: '密码',
      actionMd5: 'MD5',
      actionSha1: 'SHA-1',
      actionSha256: 'SHA-256',
      actionCookieJson: '转 JSON',
      actionCurrentJson: '当前 JSON',
      actionAllJson: '全部 JSON',
      actionCurrentMarkdown: '当前 Markdown',
      actionAllMarkdown: '全部 Markdown',
      actionCurrentUrls: '当前 URL',
      actionAllUrls: '全部 URL',
      okJsonValid: 'JSON 有效',
      okParsed: '已解析',
      okEncoded: '已编码',
      okDecoded: '已解码',
      okConverted: '已转换',
      okGenerated: '已生成',
      okExported: '已导出',
      categoryFormat: '格式化',
      categoryEncode: '编解码',
      categoryTime: '时间',
      categoryGenerate: '生成',
      categoryCrypto: '加密',
      categoryTabs: '标签页',
    },
  };

  const CATEGORY_KEYS = {
    format: 'categoryFormat',
    encode: 'categoryEncode',
    time: 'categoryTime',
    generate: 'categoryGenerate',
    crypto: 'categoryCrypto',
    tabs: 'categoryTabs',
  };

  const TOOL_ICON_SVGS = {
    'json-tree': '<svg class="tool-icon-svg" data-tool-icon="json-tree" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5c-1.5 0-2.28.82-2.28 2.25v1.4c0 .92-.5 1.46-1.5 1.62 1 .18 1.5.72 1.5 1.64v1.84c0 1.43.78 2.25 2.28 2.25M16 5.5c1.5 0 2.28.82 2.28 2.25v1.4c0 .92.5 1.46 1.5 1.62-1 .18-1.5.72-1.5 1.64v1.84c0 1.43-.78 2.25-2.28 2.25" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/><text x="10.05" y="15.35" fill="currentColor" font-family="ui-serif, Georgia, serif" font-size="9.4" font-weight="900" font-style="italic">j</text></svg>',
    'url-search': '<svg class="tool-icon-svg" data-tool-icon="url-search" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="7.4" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M4.95 9.85h14.1M4.95 14.15h14.1M12 4.6c1.8 1.88 2.72 4.35 2.72 7.4S13.8 17.52 12 19.4M12 4.6C10.2 6.48 9.28 8.95 9.28 12s.92 5.52 2.72 7.4" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round"/><text x="6.65" y="13.45" fill="currentColor" font-family="ui-sans-serif, system-ui, sans-serif" font-size="4.45" font-weight="900">www</text></svg>',
    'codec-arrows': '<svg class="tool-icon-svg" data-tool-icon="codec-arrows" viewBox="0 0 24 24" aria-hidden="true"><text x="4" y="8.3" fill="currentColor" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="3.8" font-weight="800">text</text><text x="13.1" y="8.3" fill="currentColor" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="5" font-weight="900">&lt;/&gt;</text><path d="M6.3 12.25h10.9l-2.1-2.1M17.2 12.25l-2.1 2.1M17.7 16.85H6.8l2.1-2.1M6.8 16.85l2.1 2.1" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round"/><text x="8.2" y="21" fill="currentColor" font-family="ui-sans-serif, system-ui, sans-serif" font-size="6.2" font-weight="900">A0</text></svg>',
    'time-ruler': '<svg class="tool-icon-svg" data-tool-icon="time-ruler" viewBox="0 0 24 24" aria-hidden="true"><circle cx="9.2" cy="12" r="5.7" fill="none" stroke="currentColor" stroke-width="1.75"/><path d="M9.2 8.8V12l2.25 1.45M17 7h3.2M17 10.4h2.1M17 13.8h3.2M17 17.2h2.1" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    'qr-grid': '<svg class="tool-icon-svg" data-tool-icon="qr-grid" viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="5.2" height="5.2" rx="1" fill="none" stroke="currentColor" stroke-width="1.6"/><rect x="14.8" y="4" width="5.2" height="5.2" rx="1" fill="none" stroke="currentColor" stroke-width="1.6"/><rect x="4" y="14.8" width="5.2" height="5.2" rx="1" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="6.6" cy="6.6" r=".95" fill="currentColor"/><circle cx="17.4" cy="6.6" r=".95" fill="currentColor"/><circle cx="6.6" cy="17.4" r=".95" fill="currentColor"/><path d="M12 12h1.7v1.7H12zM15.4 12h1.7v1.7h-1.7zM12 15.4h1.7v1.7H12zM17.1 17.1h1.7v1.7h-1.7zM15.4 18.8h1.7" fill="currentColor"/></svg>',
    'id-key': '<svg class="tool-icon-svg" data-tool-icon="id-key" viewBox="0 0 24 24" aria-hidden="true"><rect x="3.7" y="5.2" width="11.7" height="13.6" rx="2.2" fill="none" stroke="currentColor" stroke-width="1.75"/><circle cx="8.2" cy="10" r="1.65" fill="none" stroke="currentColor" stroke-width="1.45"/><path d="M6.15 14.6h5M17.25 14.9a2.2 2.2 0 1 0-1.55-1.55M17.1 15.05l3.7 3.7M19.05 17.05l1.35-1.35M20.25 18.25l1.05-1.05" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    'fingerprint-hash': '<svg class="tool-icon-svg" data-tool-icon="fingerprint-hash" viewBox="0 0 24 24" aria-hidden="true"><rect x="3.6" y="5.2" width="16.8" height="13.6" rx="3.1" fill="none" stroke="currentColor" stroke-width="1.65"/><path d="M7.05 14.75V9.45l2.05 3.25 2.05-3.25v5.3M13.25 9.45h2.15c1.7 0 2.8 1.02 2.8 2.65s-1.1 2.65-2.8 2.65h-2.15V9.45Z" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round"/><text x="14.25" y="17.35" fill="currentColor" font-family="ui-sans-serif, system-ui, sans-serif" font-size="4.4" font-weight="900">5</text><path d="M6.25 17.25h3.9" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round"/></svg>',
    'cookie-kv': '<svg class="tool-icon-svg" data-tool-icon="cookie-kv" viewBox="0 0 24 24" aria-hidden="true"><path d="M13.25 4.2c-.12.35-.18.72-.18 1.12a3.1 3.1 0 0 0 3.1 3.1c.42 0 .82-.08 1.18-.23.25.55.68 1 1.2 1.28A7.2 7.2 0 1 1 13.25 4.2Z" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/><circle cx="8.15" cy="10.1" r=".88" fill="currentColor"/><circle cx="11.7" cy="13.35" r=".88" fill="currentColor"/><circle cx="7.75" cy="15.95" r=".72" fill="currentColor"/><rect x="10.65" y="15.35" width="9.8" height="4.2" rx="1.4" fill="var(--card-bg, var(--panel-card, white))" stroke="currentColor" stroke-width="1.35"/><text x="11.85" y="18.34" fill="currentColor" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="3.65" font-weight="850">k=v</text></svg>',
    'session-export': '<svg class="tool-icon-svg" data-tool-icon="session-export" viewBox="0 0 24 24" aria-hidden="true"><path d="M4.4 9.25h8.8a1.8 1.8 0 0 1 1.8 1.8v5.9a1.8 1.8 0 0 1-1.8 1.8H4.4a1.8 1.8 0 0 1-1.8-1.8v-5.9a1.8 1.8 0 0 1 1.8-1.8Z" fill="none" stroke="currentColor" stroke-width="1.65"/><path d="M2.95 12.1h11.7M6.1 6.2h8.8a1.8 1.8 0 0 1 1.8 1.8v6.3M8.95 3.5h8.4a1.8 1.8 0 0 1 1.8 1.8v6.1M14.25 14.35l6.25-6.25M16 8.1h4.5v4.5" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    'tool-default': '<svg class="tool-icon-svg" data-tool-icon="tool-default" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M5 12h14M5 17h14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  };

  const TOOLS = [
    {
      id: 'json',
      category: 'format',
      icon: 'json-tree',
      accent: 'blue',
      layout: 'split',
      titleKey: 'toolJson',
      descriptionKey: 'toolJsonDesc',
      keywords: ['json', 'format', 'minify', 'validate'],
      inputKind: 'text',
      primaryActions: ['format', 'minify', 'validate'],
      examples: [
        {
          label: { en: 'Nested object', zh: '嵌套对象' },
          action: 'format',
          value: '{"name":"Super Tab Out","tools":["JSON","URL","QR"],"local":true}',
        },
      ],
      actions: [
        { id: 'format', labelKey: 'actionFormat' },
        { id: 'minify', labelKey: 'actionMinify' },
        { id: 'validate', labelKey: 'actionValidate' },
      ],
      run: runJsonTool,
    },
    {
      id: 'qr',
      category: 'generate',
      icon: 'qr-grid',
      accent: 'green',
      layout: 'visual',
      titleKey: 'toolQr',
      descriptionKey: 'toolQrDesc',
      keywords: ['qr', 'qrcode', 'code', 'url'],
      inputKind: 'text',
      primaryActions: ['generate'],
      examples: [
        { label: { en: 'Project URL', zh: '项目 URL' }, action: 'generate', value: 'https://github.com/SivanCola/super-tab-out' },
      ],
      actions: [{ id: 'generate', labelKey: 'actionGenerateQr' }],
      run: runQrTool,
    },
    {
      id: 'timestamp',
      category: 'time',
      icon: 'time-ruler',
      accent: 'amber',
      layout: 'cards',
      titleKey: 'toolTimestamp',
      descriptionKey: 'toolTimestampDesc',
      keywords: ['time', 'timestamp', 'unix', 'filetime', 'date'],
      inputKind: 'text',
      primaryActions: ['now', 'convert', 'today-start', 'yesterday', 'week-start'],
      examples: [
        { label: { en: 'Unix seconds', zh: 'Unix 秒' }, action: 'convert', value: '0' },
        { label: { en: 'ISO time', zh: 'ISO 时间' }, action: 'convert', value: '2026-04-30T00:00:00Z' },
      ],
      actions: [
        { id: 'convert', labelKey: 'actionConvert' },
        { id: 'now', labelKey: 'actionNow' },
        { id: 'today-start', labelKey: 'actionTodayStart' },
        { id: 'yesterday', labelKey: 'actionYesterday' },
        { id: 'week-start', labelKey: 'actionWeekStart' },
        { id: 'filetime', labelKey: 'actionFiletime' },
      ],
      run: runTimestampTool,
    },
    {
      id: 'url',
      category: 'encode',
      icon: 'url-search',
      accent: 'teal',
      layout: 'table',
      titleKey: 'toolUrl',
      descriptionKey: 'toolUrlDesc',
      keywords: ['url', 'query', 'params', 'encode', 'decode'],
      inputKind: 'text',
      primaryActions: ['parse', 'encode', 'decode'],
      examples: [
        {
          label: { en: 'URL with params', zh: '带参数 URL' },
          action: 'parse',
          value: 'https://example.com/search?q=super%20tab&lang=zh&lang=en#result',
        },
      ],
      actions: [
        { id: 'parse', labelKey: 'actionParse' },
        { id: 'encode', labelKey: 'actionEncode' },
        { id: 'decode', labelKey: 'actionDecode' },
      ],
      run: runUrlTool,
    },
    {
      id: 'codec',
      category: 'encode',
      icon: 'codec-arrows',
      accent: 'slate',
      layout: 'split',
      titleKey: 'toolCodec',
      descriptionKey: 'toolCodecDesc',
      keywords: ['base64', 'unicode', 'html', 'entity', 'decode', 'encode'],
      inputKind: 'text',
      primaryActions: ['base64-encode', 'base64-decode', 'html-encode'],
      actions: [
        { id: 'base64-encode', labelKey: 'actionBase64Encode' },
        { id: 'base64-decode', labelKey: 'actionBase64Decode' },
        { id: 'unicode-encode', labelKey: 'actionUnicodeEncode' },
        { id: 'unicode-decode', labelKey: 'actionUnicodeDecode' },
        { id: 'html-encode', labelKey: 'actionHtmlEncode' },
        { id: 'html-decode', labelKey: 'actionHtmlDecode' },
      ],
      run: runCodecTool,
    },
    {
      id: 'uuid',
      category: 'generate',
      icon: 'id-key',
      accent: 'green',
      layout: 'single',
      titleKey: 'toolUuid',
      descriptionKey: 'toolUuidDesc',
      keywords: ['uuid', 'password', 'random'],
      inputKind: 'text',
      primaryActions: ['uuid', 'password'],
      actions: [
        { id: 'uuid', labelKey: 'actionUuid' },
        { id: 'password', labelKey: 'actionPassword' },
      ],
      run: runUuidTool,
    },
    {
      id: 'hash',
      category: 'crypto',
      icon: 'fingerprint-hash',
      accent: 'red',
      layout: 'single',
      titleKey: 'toolHash',
      descriptionKey: 'toolHashDesc',
      keywords: ['hash', 'md5', 'sha1', 'sha-1', 'sha256', 'sha-256'],
      inputKind: 'text',
      primaryActions: ['sha256', 'sha1', 'md5'],
      actions: [
        { id: 'md5', labelKey: 'actionMd5' },
        { id: 'sha1', labelKey: 'actionSha1' },
        { id: 'sha256', labelKey: 'actionSha256' },
      ],
      run: runHashTool,
    },
    {
      id: 'cookie',
      category: 'format',
      icon: 'cookie-kv',
      accent: 'blue',
      layout: 'table',
      titleKey: 'toolCookie',
      descriptionKey: 'toolCookieDesc',
      keywords: ['cookie', 'json', 'header'],
      inputKind: 'text',
      primaryActions: ['json'],
      examples: [
        { label: { en: 'Cookie header', zh: 'Cookie 字符串' }, action: 'json', value: 'sid=abc123; theme=warm%20paper; logged_in=true' },
      ],
      actions: [{ id: 'json', labelKey: 'actionCookieJson' }],
      run: runCookieTool,
    },
    {
      id: 'session-export',
      category: 'tabs',
      icon: 'session-export',
      accent: 'purple',
      layout: 'tabs',
      titleKey: 'toolSessionExport',
      descriptionKey: 'toolSessionExportDesc',
      keywords: ['session', 'export', 'tabs', 'markdown', 'urls'],
      inputKind: 'tabs',
      primaryActions: ['current-json', 'current-markdown', 'current-urls'],
      actions: [
        { id: 'current-json', labelKey: 'actionCurrentJson' },
        { id: 'all-json', labelKey: 'actionAllJson' },
        { id: 'current-markdown', labelKey: 'actionCurrentMarkdown' },
        { id: 'all-markdown', labelKey: 'actionAllMarkdown' },
        { id: 'current-urls', labelKey: 'actionCurrentUrls' },
        { id: 'all-urls', labelKey: 'actionAllUrls' },
      ],
      run: runSessionExportTool,
    },
  ];

  function tr(key, lang = 'en') {
    return TOOL_COPY[lang]?.[key] || TOOL_COPY.en[key] || key;
  }

  function toolForUi(tool, lang = 'en') {
    return {
      id: tool.id,
      category: tool.category,
      categoryLabel: tr(CATEGORY_KEYS[tool.category] || tool.category, lang),
      icon: tool.icon || tool.id.slice(0, 2).toUpperCase(),
      accent: tool.accent || 'slate',
      layout: tool.layout || 'split',
      titleKey: tool.titleKey,
      descriptionKey: tool.descriptionKey,
      title: tr(tool.titleKey, lang),
      description: tr(tool.descriptionKey, lang),
      keywords: [...tool.keywords],
      inputKind: tool.inputKind,
      primaryActions: [...(tool.primaryActions || tool.actions.map(action => action.id))],
      examples: (tool.examples || []).map(example => ({
        label: example.label?.[lang] || example.label?.en || '',
        value: example.value || '',
        action: example.action || tool.actions[0]?.id || '',
      })),
      actions: tool.actions.map(action => ({
        id: action.id,
        labelKey: action.labelKey,
        label: tr(action.labelKey, lang),
      })),
    };
  }

  function getToolIconSvg(icon) {
    const key = Object.prototype.hasOwnProperty.call(TOOL_ICON_SVGS, icon) ? icon : 'tool-default';
    return TOOL_ICON_SVGS[key];
  }

  function getTools({ lang = 'en' } = {}) {
    return TOOLS.map(tool => toolForUi(tool, lang));
  }

  function getTool(id, { lang = 'en' } = {}) {
    const tool = TOOLS.find(item => item.id === id);
    return tool ? toolForUi(tool, lang) : null;
  }

  function searchTools(query, { lang = 'en' } = {}) {
    const q = String(query || '').trim().toLowerCase();
    const tools = getTools({ lang });
    if (!q) return tools;
    return tools.filter(tool => [
      tool.id,
      tool.category,
      tool.title,
      tool.description,
      ...tool.keywords,
    ].join(' ').toLowerCase().includes(q));
  }

  function ok(output, meta = {}, extra = {}) {
    return { ok: true, output: String(output ?? ''), meta, ...extra };
  }

  function fail(error, extra = {}) {
    return { ok: false, output: '', error: error?.message || String(error || 'Tool failed'), ...extra };
  }

  async function runTool(id, input = '', options = {}) {
    const tool = TOOLS.find(item => item.id === id);
    if (!tool) return fail(`Unknown tool: ${id}`);
    try {
      const result = await tool.run(String(input ?? ''), options || {});
      if (result && typeof result === 'object' && Object.prototype.hasOwnProperty.call(result, 'ok')) {
        return {
          ok: result.ok !== false,
          output: String(result.output ?? ''),
          meta: result.meta || {},
          ...(result.error ? { error: result.error } : {}),
          ...(result.diagnostics ? { diagnostics: result.diagnostics } : {}),
          ...(result.visual ? { visual: result.visual } : {}),
        };
      }
      return ok(result?.output ?? result, result?.meta || {});
    } catch (error) {
      return fail(error);
    }
  }

  function runJsonTool(input, options) {
    const action = options.action || 'format';
    let parsed;
    try {
      parsed = JSON.parse(input || 'null');
    } catch (error) {
      return fail('Invalid JSON', { diagnostics: jsonDiagnostics(input, error) });
    }
    const visual = {
      type: 'json-tree',
      summary: jsonSummary(parsed),
      tree: toJsonTree(parsed),
    };
    if (action === 'minify') return ok(JSON.stringify(parsed), { labelKey: 'okJsonValid' }, { visual });
    if (action === 'validate') return ok(tr('okJsonValid', options.lang), { labelKey: 'okJsonValid' }, { visual });
    return ok(JSON.stringify(parsed, null, 2), { labelKey: 'okJsonValid' }, { visual });
  }

  function runUrlTool(input, options) {
    const action = options.action || 'parse';
    if (action === 'encode') return ok(encodeURIComponent(input), { labelKey: 'okEncoded' });
    if (action === 'decode') return ok(decodeURIComponent(input.replace(/\+/g, ' ')), { labelKey: 'okDecoded' });

    const parsed = new URL(input);
    const params = {};
    const rows = [];
    parsed.searchParams.forEach((value, key) => {
      rows.push({
        key,
        value,
        decodedKey: safeDecode(key),
        decodedValue: safeDecode(value),
      });
      if (Object.prototype.hasOwnProperty.call(params, key)) {
        params[key] = Array.isArray(params[key]) ? [...params[key], value] : [params[key], value];
      } else {
        params[key] = value;
      }
    });
    const payload = {
      href: parsed.href,
      origin: parsed.origin,
      protocol: parsed.protocol,
      host: parsed.host,
      hostname: parsed.hostname,
      pathname: parsed.pathname,
      hash: parsed.hash,
      params,
    };
    return ok(JSON.stringify(payload, null, 2), { labelKey: 'okParsed' }, {
      visual: {
        type: 'url',
        fields: [
          ['href', parsed.href],
          ['origin', parsed.origin],
          ['protocol', parsed.protocol],
          ['host', parsed.host],
          ['pathname', parsed.pathname],
          ['hash', parsed.hash],
        ],
        params: rows,
      },
    });
  }

  function runCodecTool(input, options) {
    const action = options.action || 'base64-encode';
    if (action === 'base64-encode') return ok(base64Encode(input), { labelKey: 'okEncoded' });
    if (action === 'base64-decode') return ok(base64Decode(input), { labelKey: 'okDecoded' });
    if (action === 'unicode-encode') return ok([...input].map(ch => {
      const code = ch.codePointAt(0).toString(16).padStart(4, '0');
      return code.length > 4 ? `\\u{${code}}` : `\\u${code}`;
    }).join(''), { labelKey: 'okEncoded' });
    if (action === 'unicode-decode') {
      return ok(input
        .replace(/\\u\{([0-9a-fA-F]+)\}/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
        .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16))), { labelKey: 'okDecoded' });
    }
    if (action === 'html-encode') return ok(input.replace(/[&<>"']/g, ch => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    })[ch]), { labelKey: 'okEncoded' });
    if (action === 'html-decode') return ok(input
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&amp;/g, '&'), { labelKey: 'okDecoded' });
    return fail(`Unsupported codec action: ${action}`);
  }

  function runTimestampTool(input, options) {
    const action = options.action || 'convert';
    const now = new Date();
    if (action === 'now') {
      const payload = datePayload(now);
      return ok(JSON.stringify(payload, null, 2), { labelKey: 'okConverted' }, timestampVisual(payload));
    }

    if (action === 'today-start' || action === 'yesterday' || action === 'week-start') {
      const date = quickDate(action, now);
      const payload = datePayload(date);
      return ok(JSON.stringify(payload, null, 2), { labelKey: 'okConverted', suggestedInput: payload.iso }, timestampVisual(payload));
    }

    if (action === 'filetime') {
      const value = BigInt(String(input || '0').trim());
      const ms = Number((value - 116444736000000000n) / 10000n);
      const payload = datePayload(new Date(ms));
      return ok(JSON.stringify(payload, null, 2), { labelKey: 'okConverted' }, timestampVisual(payload));
    }

    const raw = input.trim();
    if (!raw) return fail('Invalid date or timestamp');
    const numeric = Number(raw);
    const date = Number.isFinite(numeric)
      ? new Date(String(Math.trunc(numeric)).length <= 10 ? numeric * 1000 : numeric)
      : new Date(raw);
    if (Number.isNaN(date.getTime())) return fail('Invalid date or timestamp');
    const payload = datePayload(date);
    return ok(JSON.stringify(payload, null, 2), { labelKey: 'okConverted' }, timestampVisual(payload));
  }

  function datePayload(date) {
    const ms = date.getTime();
    return {
      iso: date.toISOString(),
      unixSeconds: Math.floor(ms / 1000),
      unixMilliseconds: ms,
      local: date.toLocaleString(),
      filetime: unixMsToFiletime(ms),
    };
  }

  function jsonDiagnostics(input, error) {
    const message = error?.message || 'Invalid JSON';
    const match = message.match(/position\s+(\d+)/i);
    const position = match ? Number(match[1]) : -1;
    if (!Number.isFinite(position) || position < 0) return { message };
    const before = String(input || '').slice(0, position);
    const lines = before.split(/\r\n|\r|\n/);
    return {
      message,
      position,
      line: lines.length,
      column: lines[lines.length - 1].length + 1,
    };
  }

  function jsonSummary(value) {
    if (Array.isArray(value)) return `${value.length} item${value.length === 1 ? '' : 's'}`;
    if (value && typeof value === 'object') {
      const count = Object.keys(value).length;
      return `${count} key${count === 1 ? '' : 's'}`;
    }
    return value === null ? 'null' : typeof value;
  }

  function toJsonTree(value, key = 'root') {
    if (Array.isArray(value)) {
      return {
        key,
        type: 'array',
        summary: `${value.length} item${value.length === 1 ? '' : 's'}`,
        children: value.map((item, index) => toJsonTree(item, String(index))),
      };
    }
    if (value && typeof value === 'object') {
      const entries = Object.entries(value);
      return {
        key,
        type: 'object',
        summary: `${entries.length} key${entries.length === 1 ? '' : 's'}`,
        children: entries.map(([childKey, childValue]) => toJsonTree(childValue, childKey)),
      };
    }
    return {
      key,
      type: value === null ? 'null' : typeof value,
      value,
      summary: value === null ? 'null' : JSON.stringify(value),
    };
  }

  function quickDate(action, now = new Date()) {
    const date = new Date(now);
    date.setHours(0, 0, 0, 0);
    if (action === 'yesterday') date.setDate(date.getDate() - 1);
    if (action === 'week-start') {
      const mondayOffset = (date.getDay() + 6) % 7;
      date.setDate(date.getDate() - mondayOffset);
    }
    return date;
  }

  function timestampVisual(payload) {
    return {
      visual: {
        type: 'timestamp',
        cards: [
          { label: 'ISO', value: payload.iso },
          { label: 'Unix seconds', value: String(payload.unixSeconds) },
          { label: 'Unix milliseconds', value: String(payload.unixMilliseconds) },
          { label: 'Local', value: payload.local },
          { label: 'FILETIME', value: payload.filetime },
        ],
      },
    };
  }

  function unixMsToFiletime(ms) {
    return String(BigInt(Math.trunc(ms)) * 10000n + 116444736000000000n);
  }

  function runQrTool(input, options = {}) {
    const value = input || 'Super Tab Out';
    const color = normalizeHexColor(options.color || '#111827');
    const svg = makeQrSvg(value, { color });
    return ok(svg, { mime: 'image/svg+xml', labelKey: 'okGenerated' }, {
      visual: {
        type: 'qr',
        svg,
        textLength: String(value).length,
        color,
      },
    });
  }

  function runUuidTool(input, options) {
    if ((options.action || 'uuid') === 'password') {
      const length = Math.min(128, Math.max(8, Number.parseInt(input, 10) || Number(options.length) || 20));
      const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*_-+=';
      return ok(randomString(length, alphabet), { labelKey: 'okGenerated' });
    }
    return ok(uuidV4(), { labelKey: 'okGenerated' });
  }

  async function runHashTool(input, options) {
    const action = options.action || 'sha256';
    if (action === 'md5') return ok(md5(input), { labelKey: 'okGenerated' });
    if (action === 'sha1') return ok(await shaDigest('SHA-1', input), { labelKey: 'okGenerated' });
    if (action === 'sha256') return ok(await shaDigest('SHA-256', input), { labelKey: 'okGenerated' });
    return fail(`Unsupported hash action: ${action}`);
  }

  function runCookieTool(input) {
    const result = {};
    const rows = [];
    for (const pair of input.split(';')) {
      const trimmed = pair.trim();
      if (!trimmed) continue;
      const index = trimmed.indexOf('=');
      const key = index === -1 ? trimmed : trimmed.slice(0, index).trim();
      const value = index === -1 ? '' : trimmed.slice(index + 1).trim();
      if (key) {
        const decoded = safeDecode(value);
        result[key] = decoded;
        rows.push({ key, value: decoded });
      }
    }
    return ok(JSON.stringify(result, null, 2), { labelKey: 'okParsed' }, {
      visual: { type: 'key-value', rows },
    });
  }

  function runSessionExportTool(_input, options) {
    const action = options.action || 'all-json';
    const tabs = normalizeExportTabs(options.tabs || []);
    const scope = action.startsWith('current-') ? 'current' : 'all';
    const format = action.endsWith('-markdown') ? 'markdown' : action.endsWith('-urls') ? 'urls' : 'json';
    const scopedTabs = scope === 'current' && options.currentWindowId != null
      ? tabs.filter(tab => tab.windowId === options.currentWindowId)
      : tabs;
    return ok(formatSessionExport(scopedTabs, format), { labelKey: 'okExported', format, scope });
  }

  function normalizeExportTabs(tabs) {
    return (Array.isArray(tabs) ? tabs : [])
      .filter(tab => tab && typeof tab.url === 'string' && tab.url)
      .map(tab => ({
        title: tab.title || tab.url,
        url: tab.url,
        pinned: tab.pinned === true,
        windowId: tab.windowId ?? 0,
        index: Number(tab.index) || 0,
        groupTitle: tab.groupTitle || '',
      }))
      .sort((a, b) => a.windowId === b.windowId ? a.index - b.index : a.windowId - b.windowId);
  }

  function formatSessionExport(tabs, format = 'json') {
    const normalized = normalizeExportTabs(tabs);
    if (format === 'urls') return normalized.map(tab => tab.url).join('\n');
    if (format === 'markdown') {
      return normalized.map(tab => {
        const prefix = tab.groupTitle ? `- **${escapeMarkdown(tab.groupTitle)}** ` : '- ';
        return `${prefix}[${escapeMarkdown(tab.title)}](${tab.url})`;
      }).join('\n');
    }
    return JSON.stringify({
      exportedAt: new Date().toISOString(),
      tabs: normalized,
    }, null, 2);
  }

  function escapeMarkdown(text) {
    return String(text || '').replace(/([\\[\]()_*`])/g, '\\$1');
  }

  function safeDecode(value) {
    try { return decodeURIComponent(value); } catch { return value; }
  }

  function base64Encode(value) {
    if (typeof Buffer !== 'undefined') return Buffer.from(value, 'utf8').toString('base64');
    return btoa(unescape(encodeURIComponent(value)));
  }

  function base64Decode(value) {
    if (typeof Buffer !== 'undefined') return Buffer.from(value, 'base64').toString('utf8');
    return decodeURIComponent(escape(atob(value)));
  }

  async function shaDigest(algorithm, input) {
    if (typeof require === 'function') {
      try {
        const nodeCrypto = require('node:crypto');
        return nodeCrypto.createHash(algorithm.toLowerCase().replace('-', '')).update(input).digest('hex');
      } catch {}
    }
    const data = new TextEncoder().encode(input);
    const digest = await global.crypto.subtle.digest(algorithm, data);
    return Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, '0')).join('');
  }

  function randomBytes(length) {
    const bytes = new Uint8Array(length);
    if (global.crypto?.getRandomValues) global.crypto.getRandomValues(bytes);
    else {
      for (let i = 0; i < length; i++) bytes[i] = Math.floor(Math.random() * 256);
    }
    return bytes;
  }

  function randomString(length, alphabet) {
    const bytes = randomBytes(length);
    return Array.from(bytes, byte => alphabet[byte % alphabet.length]).join('');
  }

  function uuidV4() {
    if (global.crypto?.randomUUID) return global.crypto.randomUUID();
    const bytes = randomBytes(16);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0'));
    return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10).join('')}`;
  }

  function normalizeHexColor(value) {
    const color = String(value || '').trim();
    return /^#[0-9a-fA-F]{6}$/.test(color) ? color : '#111827';
  }

  function makeQrLikeSvg(value) {
    return makeQrSvg(value);
  }

  function makeQrSvg(value, options = {}) {
    const bytes = Array.from(new TextEncoder().encode(String(value || '')));
    const specs = [
      { version: 1, dataCodewords: 19, eccCodewords: 7 },
      { version: 2, dataCodewords: 34, eccCodewords: 10 },
      { version: 3, dataCodewords: 55, eccCodewords: 15 },
      { version: 4, dataCodewords: 80, eccCodewords: 20 },
      { version: 5, dataCodewords: 108, eccCodewords: 26 },
    ];
    const spec = specs.find(item => bytes.length + 2 <= item.dataCodewords);
    if (!spec) throw new Error('QR input is too long for the local encoder');

    const data = qrDataCodewords(bytes, spec.dataCodewords);
    const ecc = qrErrorCorrection(data, spec.eccCodewords);
    const modules = qrBuildMatrix(spec.version, data.concat(ecc));
    const size = modules.length;
    const quiet = 4;
    const color = normalizeHexColor(options.color || '#111827');
    const cells = [];
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (modules[y][x]) cells.push(`<rect x="${x + quiet}" y="${y + quiet}" width="1" height="1"/>`);
      }
    }
    const viewSize = size + quiet * 2;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewSize} ${viewSize}" role="img" aria-label="QR code"><rect width="${viewSize}" height="${viewSize}" fill="white"/><g fill="${color}">${cells.join('')}</g></svg>`;
  }

  function qrDataCodewords(bytes, capacity) {
    const bits = [];
    const pushBits = (value, length) => {
      for (let i = length - 1; i >= 0; i--) bits.push((value >>> i) & 1);
    };
    pushBits(0b0100, 4);
    pushBits(bytes.length, 8);
    bytes.forEach(byte => pushBits(byte, 8));
    const maxBits = capacity * 8;
    for (let i = 0; i < 4 && bits.length < maxBits; i++) bits.push(0);
    while (bits.length % 8 !== 0) bits.push(0);
    const words = [];
    for (let i = 0; i < bits.length; i += 8) {
      let word = 0;
      for (let j = 0; j < 8; j++) word = (word << 1) | bits[i + j];
      words.push(word);
    }
    for (let pad = 0; words.length < capacity; pad++) words.push(pad % 2 === 0 ? 0xec : 0x11);
    return words;
  }

  function qrErrorCorrection(data, eccCount) {
    const gen = qrGeneratorPolynomial(eccCount);
    const result = new Array(eccCount).fill(0);
    data.forEach(byte => {
      const factor = byte ^ result.shift();
      result.push(0);
      for (let i = 0; i < eccCount; i++) {
        result[i] ^= qrGfMul(gen[i + 1], factor);
      }
    });
    return result;
  }

  function qrGeneratorPolynomial(degree) {
    let poly = [1];
    for (let i = 0; i < degree; i++) {
      const next = new Array(poly.length + 1).fill(0);
      for (let j = 0; j < poly.length; j++) {
        next[j] ^= qrGfMul(poly[j], 1);
        next[j + 1] ^= qrGfMul(poly[j], qrGfPow(i));
      }
      poly = next;
    }
    return poly;
  }

  function qrGfPow(power) {
    let value = 1;
    for (let i = 0; i < power; i++) {
      value <<= 1;
      if (value & 0x100) value ^= 0x11d;
    }
    return value;
  }

  function qrGfMul(a, b) {
    let result = 0;
    for (let i = 0; i < 8; i++) {
      if ((b & 1) !== 0) result ^= a;
      const high = a & 0x80;
      a = (a << 1) & 0xff;
      if (high) a ^= 0x1d;
      b >>>= 1;
    }
    return result;
  }

  function qrBuildMatrix(version, codewords) {
    const size = version * 4 + 17;
    const modules = Array.from({ length: size }, () => Array(size).fill(false));
    const reserved = Array.from({ length: size }, () => Array(size).fill(false));
    const set = (x, y, dark, reserve = true) => {
      if (x < 0 || y < 0 || x >= size || y >= size) return;
      modules[y][x] = dark === true;
      if (reserve) reserved[y][x] = true;
    };
    const finder = (left, top) => {
      for (let y = -1; y <= 7; y++) {
        for (let x = -1; x <= 7; x++) {
          const xx = left + x;
          const yy = top + y;
          const inPattern = x >= 0 && x <= 6 && y >= 0 && y <= 6;
          const dark = inPattern && (x === 0 || x === 6 || y === 0 || y === 6 || (x >= 2 && x <= 4 && y >= 2 && y <= 4));
          set(xx, yy, dark);
        }
      }
    };
    finder(0, 0);
    finder(size - 7, 0);
    finder(0, size - 7);
    for (let i = 8; i < size - 8; i++) {
      set(i, 6, i % 2 === 0);
      set(6, i, i % 2 === 0);
    }
    if (version >= 2) {
      const pos = 4 * version + 10;
      qrAlignment(modules, reserved, pos, pos);
    }
    set(8, size - 8, true);
    qrSetFormat(modules, reserved, 0, size);

    const bits = [];
    codewords.forEach(word => {
      for (let i = 7; i >= 0; i--) bits.push((word >>> i) & 1);
    });
    let bitIndex = 0;
    let upward = true;
    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right--;
      for (let vert = 0; vert < size; vert++) {
        const y = upward ? size - 1 - vert : vert;
        for (let dx = 0; dx < 2; dx++) {
          const x = right - dx;
          if (reserved[y][x]) continue;
          modules[y][x] = (bits[bitIndex++] || 0) === 1;
          reserved[y][x] = false;
        }
      }
      upward = !upward;
    }

    const dataReserved = reserved.map(row => row.slice());
    let bestMask = 0;
    let bestScore = Infinity;
    let bestModules = modules;
    for (let mask = 0; mask < 8; mask++) {
      const candidate = modules.map(row => row.slice());
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          if (!dataReserved[y][x] && qrMask(mask, x, y)) candidate[y][x] = !candidate[y][x];
        }
      }
      qrSetFormat(candidate, reserved, mask, size);
      const score = qrPenalty(candidate);
      if (score < bestScore) {
        bestScore = score;
        bestMask = mask;
        bestModules = candidate;
      }
    }
    qrSetFormat(bestModules, reserved, bestMask, size);
    return bestModules;
  }

  function qrAlignment(modules, reserved, cx, cy) {
    for (let y = -2; y <= 2; y++) {
      for (let x = -2; x <= 2; x++) {
        const dark = Math.max(Math.abs(x), Math.abs(y)) !== 1;
        modules[cy + y][cx + x] = dark;
        reserved[cy + y][cx + x] = true;
      }
    }
  }

  function qrSetFormat(modules, reserved, mask, size) {
    const data = (1 << 3) | mask;
    let bits = data << 10;
    for (let i = 14; i >= 10; i--) {
      if (((bits >>> i) & 1) !== 0) bits ^= 0x537 << (i - 10);
    }
    const format = ((data << 10) | bits) ^ 0x5412;
    const bit = i => ((format >>> i) & 1) !== 0;
    const set = (x, y, dark) => {
      modules[y][x] = dark;
      reserved[y][x] = true;
    };
    for (let i = 0; i <= 5; i++) set(8, i, bit(i));
    set(8, 7, bit(6));
    set(8, 8, bit(7));
    set(7, 8, bit(8));
    for (let i = 9; i < 15; i++) set(14 - i, 8, bit(i));
    for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(i));
  }

  function qrMask(mask, x, y) {
    if (mask === 0) return (x + y) % 2 === 0;
    if (mask === 1) return y % 2 === 0;
    if (mask === 2) return x % 3 === 0;
    if (mask === 3) return (x + y) % 3 === 0;
    if (mask === 4) return (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0;
    if (mask === 5) return ((x * y) % 2) + ((x * y) % 3) === 0;
    if (mask === 6) return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
    return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
  }

  function qrPenalty(modules) {
    const size = modules.length;
    let penalty = 0;
    const scoreLine = (get) => {
      let runColor = get(0);
      let runLength = 1;
      for (let i = 1; i < size; i++) {
        const color = get(i);
        if (color === runColor) runLength++;
        else {
          if (runLength >= 5) penalty += runLength - 2;
          runColor = color;
          runLength = 1;
        }
      }
      if (runLength >= 5) penalty += runLength - 2;
    };
    for (let y = 0; y < size; y++) scoreLine(x => modules[y][x]);
    for (let x = 0; x < size; x++) scoreLine(y => modules[y][x]);
    for (let y = 0; y < size - 1; y++) {
      for (let x = 0; x < size - 1; x++) {
        const color = modules[y][x];
        if (color === modules[y][x + 1] && color === modules[y + 1][x] && color === modules[y + 1][x + 1]) penalty += 3;
      }
    }
    const dark = modules.flat().filter(Boolean).length;
    penalty += Math.floor(Math.abs((dark * 20) / (size * size) - 10)) * 10;
    return penalty;
  }

  function md5(input) {
    function add32(a, b) { return (a + b) & 0xffffffff; }
    function cmn(q, a, b, x, s, t) {
      a = add32(add32(a, q), add32(x, t));
      return add32((a << s) | (a >>> (32 - s)), b);
    }
    function ff(a, b, c, d, x, s, t) { return cmn((b & c) | ((~b) & d), a, b, x, s, t); }
    function gg(a, b, c, d, x, s, t) { return cmn((b & d) | (c & (~d)), a, b, x, s, t); }
    function hh(a, b, c, d, x, s, t) { return cmn(b ^ c ^ d, a, b, x, s, t); }
    function ii(a, b, c, d, x, s, t) { return cmn(c ^ (b | (~d)), a, b, x, s, t); }
    function cycle(state, block) {
      let [a, b, c, d] = state;
      const oa = a, ob = b, oc = c, od = d;
      a = ff(a, b, c, d, block[0], 7, -680876936); d = ff(d, a, b, c, block[1], 12, -389564586);
      c = ff(c, d, a, b, block[2], 17, 606105819); b = ff(b, c, d, a, block[3], 22, -1044525330);
      a = ff(a, b, c, d, block[4], 7, -176418897); d = ff(d, a, b, c, block[5], 12, 1200080426);
      c = ff(c, d, a, b, block[6], 17, -1473231341); b = ff(b, c, d, a, block[7], 22, -45705983);
      a = ff(a, b, c, d, block[8], 7, 1770035416); d = ff(d, a, b, c, block[9], 12, -1958414417);
      c = ff(c, d, a, b, block[10], 17, -42063); b = ff(b, c, d, a, block[11], 22, -1990404162);
      a = ff(a, b, c, d, block[12], 7, 1804603682); d = ff(d, a, b, c, block[13], 12, -40341101);
      c = ff(c, d, a, b, block[14], 17, -1502002290); b = ff(b, c, d, a, block[15], 22, 1236535329);
      a = gg(a, b, c, d, block[1], 5, -165796510); d = gg(d, a, b, c, block[6], 9, -1069501632);
      c = gg(c, d, a, b, block[11], 14, 643717713); b = gg(b, c, d, a, block[0], 20, -373897302);
      a = gg(a, b, c, d, block[5], 5, -701558691); d = gg(d, a, b, c, block[10], 9, 38016083);
      c = gg(c, d, a, b, block[15], 14, -660478335); b = gg(b, c, d, a, block[4], 20, -405537848);
      a = gg(a, b, c, d, block[9], 5, 568446438); d = gg(d, a, b, c, block[14], 9, -1019803690);
      c = gg(c, d, a, b, block[3], 14, -187363961); b = gg(b, c, d, a, block[8], 20, 1163531501);
      a = gg(a, b, c, d, block[13], 5, -1444681467); d = gg(d, a, b, c, block[2], 9, -51403784);
      c = gg(c, d, a, b, block[7], 14, 1735328473); b = gg(b, c, d, a, block[12], 20, -1926607734);
      a = hh(a, b, c, d, block[5], 4, -378558); d = hh(d, a, b, c, block[8], 11, -2022574463);
      c = hh(c, d, a, b, block[11], 16, 1839030562); b = hh(b, c, d, a, block[14], 23, -35309556);
      a = hh(a, b, c, d, block[1], 4, -1530992060); d = hh(d, a, b, c, block[4], 11, 1272893353);
      c = hh(c, d, a, b, block[7], 16, -155497632); b = hh(b, c, d, a, block[10], 23, -1094730640);
      a = hh(a, b, c, d, block[13], 4, 681279174); d = hh(d, a, b, c, block[0], 11, -358537222);
      c = hh(c, d, a, b, block[3], 16, -722521979); b = hh(b, c, d, a, block[6], 23, 76029189);
      a = hh(a, b, c, d, block[9], 4, -640364487); d = hh(d, a, b, c, block[12], 11, -421815835);
      c = hh(c, d, a, b, block[15], 16, 530742520); b = hh(b, c, d, a, block[2], 23, -995338651);
      a = ii(a, b, c, d, block[0], 6, -198630844); d = ii(d, a, b, c, block[7], 10, 1126891415);
      c = ii(c, d, a, b, block[14], 15, -1416354905); b = ii(b, c, d, a, block[5], 21, -57434055);
      a = ii(a, b, c, d, block[12], 6, 1700485571); d = ii(d, a, b, c, block[3], 10, -1894986606);
      c = ii(c, d, a, b, block[10], 15, -1051523); b = ii(b, c, d, a, block[1], 21, -2054922799);
      a = ii(a, b, c, d, block[8], 6, 1873313359); d = ii(d, a, b, c, block[15], 10, -30611744);
      c = ii(c, d, a, b, block[6], 15, -1560198380); b = ii(b, c, d, a, block[13], 21, 1309151649);
      a = ii(a, b, c, d, block[4], 6, -145523070); d = ii(d, a, b, c, block[11], 10, -1120210379);
      c = ii(c, d, a, b, block[2], 15, 718787259); b = ii(b, c, d, a, block[9], 21, -343485551);
      state[0] = add32(a, oa); state[1] = add32(b, ob); state[2] = add32(c, oc); state[3] = add32(d, od);
    }
    const bytes = Array.from(new TextEncoder().encode(input));
    const bitLen = bytes.length * 8;
    bytes.push(0x80);
    while (bytes.length % 64 !== 56) bytes.push(0);
    for (let i = 0; i < 8; i++) bytes.push((bitLen / (2 ** (8 * i))) & 0xff);
    const state = [1732584193, -271733879, -1732584194, 271733878];
    for (let i = 0; i < bytes.length; i += 64) {
      const block = [];
      for (let j = 0; j < 64; j += 4) block.push(bytes[i + j] | (bytes[i + j + 1] << 8) | (bytes[i + j + 2] << 16) | (bytes[i + j + 3] << 24));
      cycle(state, block);
    }
    return state.map(n => {
      const hex = [];
      for (let i = 0; i < 4; i++) hex.push(((n >>> (i * 8)) & 0xff).toString(16).padStart(2, '0'));
      return hex.join('');
    }).join('');
  }

  function getStorageArea() {
    return global.chrome?.storage?.local || null;
  }

  async function storageGet(key, fallback) {
    try {
      if (global.SuperTabOutStorage?.get) {
        const data = await global.SuperTabOutStorage.get(key);
        return data[key] ?? fallback;
      }
      const area = getStorageArea();
      if (!area) return fallback;
      const data = await area.get(key);
      return data[key] ?? fallback;
    } catch {
      return fallback;
    }
  }

  async function storageSet(key, value) {
    try {
      if (global.SuperTabOutStorage?.set) return global.SuperTabOutStorage.set({ [key]: value });
      const area = getStorageArea();
      if (area) await area.set({ [key]: value });
    } catch {}
  }

  async function getFavorites() {
    const value = await storageGet(FAVORITES_KEY, []);
    return Array.isArray(value) ? value.filter(id => TOOLS.some(tool => tool.id === id)) : [];
  }

  async function getToolOrder() {
    const validIds = TOOLS.map(tool => tool.id);
    const validSet = new Set(validIds);
    const stored = await storageGet(TOOL_ORDER_KEY, []);
    const favorites = await getFavorites();
    const seed = Array.isArray(stored) && stored.length ? stored : favorites;
    const next = [];
    for (const id of Array.isArray(seed) ? seed : []) {
      if (validSet.has(id) && !next.includes(id)) next.push(id);
    }
    for (const id of validIds) {
      if (!next.includes(id)) next.push(id);
    }
    return next;
  }

  async function setToolOrder(ids) {
    const validIds = TOOLS.map(tool => tool.id);
    const validSet = new Set(validIds);
    const next = [];
    for (const id of Array.isArray(ids) ? ids : []) {
      if (validSet.has(id) && !next.includes(id)) next.push(id);
    }
    for (const id of validIds) {
      if (!next.includes(id)) next.push(id);
    }
    await storageSet(TOOL_ORDER_KEY, next);
    return next;
  }

  async function setFavorite(toolId, favorite) {
    const ids = new Set(await getFavorites());
    if (favorite) ids.add(toolId);
    else ids.delete(toolId);
    const next = Array.from(ids).filter(id => TOOLS.some(tool => tool.id === id));
    await storageSet(FAVORITES_KEY, next);
    return next;
  }

  async function setFavoritesOrder(ids) {
    const validIds = new Set(TOOLS.map(tool => tool.id));
    const next = [];
    for (const id of Array.isArray(ids) ? ids : []) {
      if (validIds.has(id) && !next.includes(id)) next.push(id);
    }
    await storageSet(FAVORITES_KEY, next);
    const currentOrder = await getToolOrder();
    await setToolOrder([...next, ...currentOrder.filter(id => !next.includes(id))]);
    return next;
  }

  async function getRecent() {
    const value = await storageGet(RECENT_KEY, []);
    return Array.isArray(value) ? value.filter(item => item && TOOLS.some(tool => tool.id === item.id)).slice(0, RECENT_LIMIT) : [];
  }

  async function recordRecent(toolId) {
    if (!TOOLS.some(tool => tool.id === toolId)) return getRecent();
    const recent = (await getRecent()).filter(item => item.id !== toolId);
    recent.unshift({ id: toolId, usedAt: new Date().toISOString() });
    const next = recent.slice(0, RECENT_LIMIT);
    await storageSet(RECENT_KEY, next);
    return next;
  }

  async function getToolState(toolId) {
    const value = await storageGet(`${STATE_PREFIX}${toolId}`, {});
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  }

  async function setToolState(toolId, state) {
    const text = JSON.stringify(state || {});
    const safeState = text.length > STATE_MAX_CHARS ? { input: String(state?.input || '').slice(0, STATE_MAX_CHARS) } : state;
    await storageSet(`${STATE_PREFIX}${toolId}`, safeState || {});
  }

  const api = {
    FAVORITES_KEY,
    RECENT_KEY,
    STATE_PREFIX,
    TOOL_COPY,
    tr,
    getToolIconSvg,
    getTools,
    getTool,
    searchTools,
    runTool,
    formatSessionExport,
    normalizeExportTabs,
    makeQrLikeSvg,
    makeQrSvg,
    md5,
    getFavorites,
    getToolOrder,
    setFavorite,
    setFavoritesOrder,
    setToolOrder,
    getRecent,
    recordRecent,
    getToolState,
    setToolState,
  };

  global.SuperTabOutTools = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);

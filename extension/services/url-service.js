/* Super Tab Out URL service.
   Centralizes URLs that are safe to persist and restore as browser tabs. */
(function (global) {
  'use strict';

  const RESTORABLE_PROTOCOLS = new Set(['http:', 'https:', 'file:']);

  function normalizeRestorableUrl(url) {
    if (typeof url !== 'string') return '';
    const raw = url.trim();
    if (!raw) return '';
    try {
      const parsed = new URL(raw);
      return RESTORABLE_PROTOCOLS.has(parsed.protocol) ? parsed.href : '';
    } catch {
      return '';
    }
  }

  function isRestorableUrl(url) {
    return normalizeRestorableUrl(url) !== '';
  }

  const api = {
    RESTORABLE_PROTOCOLS,
    normalizeRestorableUrl,
    isRestorableUrl,
  };

  global.SuperTabOutUrls = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);

/* Super Tab Out storage service.
   Keeps chrome.storage.local access behind one schema-aware boundary. */
(function (global) {
  'use strict';

  const CURRENT_SCHEMA_VERSION = 2;
  const STORAGE_SCHEMA_KEY = 'storageSchemaVersion';
  const STORAGE_LAST_MIGRATED_KEY = 'storageLastMigratedAt';
  const DEFERRED_KEY = 'deferred';
  const SAVED_SESSIONS_KEY = 'savedSessions';
  const ACTIVITY_STATS_KEY = 'activityStats';
  const ACHIEVEMENTS_KEY = 'achievements';
  const VIEW_MODE_KEY = 'viewMode';
  const PRIVACY_MODE_KEY = 'privacyMode';
  const PRIVACY_SETTINGS_KEY = 'privacySettings';

  const PRIVACY_DEFAULTS = {
    clock: true,
    date: true,
    motto: true,
    mottoText: '',
    externalFavicons: true,
  };

  const storageErrorListeners = [];

  function getStorageArea() {
    return global.chrome?.storage?.local || null;
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function isPlainObject(value) {
    return value != null && typeof value === 'object' && !Array.isArray(value);
  }

  function isQuotaError(error) {
    const message = String(error?.message || error || '').toLowerCase();
    return message.includes('quota') || message.includes('bytes') || message.includes('maximum');
  }

  function normalizeRestorableUrl(url) {
    if (global.SuperTabOutUrls?.normalizeRestorableUrl) {
      return global.SuperTabOutUrls.normalizeRestorableUrl(url);
    }
    return '';
  }

  function normalizeStorageError(error, operation) {
    return {
      operation,
      quota: isQuotaError(error),
      message: error?.message || String(error || 'Storage operation failed'),
    };
  }

  function notifyStorageError(error, operation) {
    const detail = normalizeStorageError(error, operation);
    for (const listener of storageErrorListeners) {
      try { listener(detail); } catch {}
    }
    return detail;
  }

  function onStorageError(listener) {
    if (typeof listener !== 'function') return () => {};
    storageErrorListeners.push(listener);
    return () => {
      const index = storageErrorListeners.indexOf(listener);
      if (index !== -1) storageErrorListeners.splice(index, 1);
    };
  }

  async function get(keys) {
    const area = getStorageArea();
    if (!area) return {};
    try {
      return await area.get(keys);
    } catch (error) {
      notifyStorageError(error, 'get');
      throw error;
    }
  }

  async function set(values) {
    const area = getStorageArea();
    if (!area) return;
    try {
      await area.set(values);
    } catch (error) {
      notifyStorageError(error, 'set');
      throw error;
    }
  }

  async function getBytesInUse(keys = null) {
    const area = getStorageArea();
    if (!area || typeof area.getBytesInUse !== 'function') return null;
    try {
      return await area.getBytesInUse(keys);
    } catch (error) {
      notifyStorageError(error, 'getBytesInUse');
      return null;
    }
  }

  function normalizeDeferredItem(item, index) {
    const source = isPlainObject(item) ? item : {};
    const url = normalizeRestorableUrl(source.url);
    if (!url) return null;
    const title = typeof source.title === 'string' ? source.title : url;
    const savedAt = typeof source.savedAt === 'string' ? source.savedAt : nowIso();
    const id = typeof source.id === 'string' && source.id
      ? source.id
      : `${Date.now()}-${index}`;

    return {
      id,
      url,
      title,
      savedAt,
      completed: source.completed === true,
      dismissed: source.dismissed === true,
      ...(typeof source.completedAt === 'string' ? { completedAt: source.completedAt } : {}),
    };
  }

  function normalizeDeferred(value) {
    if (!Array.isArray(value)) return [];
    return value
      .filter(item => isPlainObject(item))
      .map(normalizeDeferredItem)
      .filter(Boolean);
  }

  function normalizeSavedSession(session, index) {
    const source = isPlainObject(session) ? session : {};
    const sessionGroupColor = typeof source.groupColor === 'string' ? source.groupColor : '';
    const tabs = Array.isArray(source.tabs)
      ? source.tabs
          .filter(tab => isPlainObject(tab))
          .map(tab => {
            const url = normalizeRestorableUrl(tab.url);
            if (!url) return null;
            return {
              url,
              title: typeof tab.title === 'string' ? tab.title : url,
              pinned: tab.pinned === true,
              ...(Number.isFinite(Number(tab.windowId)) ? { windowId: Number(tab.windowId) } : {}),
              ...(Number.isFinite(Number(tab.index)) ? { index: Number(tab.index) } : {}),
              groupTitle: typeof tab.groupTitle === 'string' ? tab.groupTitle : '',
              groupColor: typeof tab.groupColor === 'string' ? tab.groupColor : sessionGroupColor,
            };
          })
          .filter(Boolean)
      : [];
    const urls = Array.isArray(source.urls)
      ? source.urls.map(normalizeRestorableUrl).filter(Boolean)
      : tabs.map(tab => tab.url);

    return {
      id: typeof source.id === 'string' && source.id ? source.id : `${Date.now()}-session-${index}`,
      name: typeof source.name === 'string' ? source.name : '',
      title: typeof source.title === 'string' ? source.title : '',
      savedAt: typeof source.savedAt === 'string' ? source.savedAt : nowIso(),
      group: typeof source.group === 'string' ? source.group : '',
      groupColor: sessionGroupColor,
      tabs,
      urls,
    };
  }

  function normalizeSavedSessions(value) {
    if (!Array.isArray(value)) return [];
    return value
      .filter(item => isPlainObject(item))
      .map(normalizeSavedSession)
      .filter(session => session.urls.length > 0 || session.tabs.length > 0);
  }

  function weekKey(date = new Date()) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
  }

  function normalizeActivityStats(value) {
    const source = isPlainObject(value) ? value : {};
    return {
      closedTotal: Number(source.closedTotal) || 0,
      savedTotal: Number(source.savedTotal) || 0,
      duplicateClosedTotal: Number(source.duplicateClosedTotal) || 0,
      sessionsSavedTotal: Number(source.sessionsSavedTotal) || 0,
      weekly: isPlainObject(source.weekly) ? source.weekly : {},
      domains: isPlainObject(source.domains) ? source.domains : {},
    };
  }

  function normalizeAchievements(value) {
    return Array.isArray(value) ? value.filter(Boolean) : [];
  }

  function normalizeViewMode(value) {
    return value === 'domain' ? 'domain' : 'group';
  }

  function normalizePrivacySettings(value) {
    const source = isPlainObject(value) ? value : {};
    return {
      clock: source.clock !== false,
      date: source.date !== false,
      motto: source.motto !== false,
      mottoText: typeof source.mottoText === 'string' ? source.mottoText : '',
      externalFavicons: source.externalFavicons !== false,
    };
  }

  async function migrateStorage() {
    const area = getStorageArea();
    if (!area) return { from: 0, to: CURRENT_SCHEMA_VERSION, changed: false };

    const data = await get(null);
    const rawVersion = Number(data[STORAGE_SCHEMA_KEY] || 0);
    const from = Number.isFinite(rawVersion) ? rawVersion : 0;
    if (from > CURRENT_SCHEMA_VERSION) {
      return { from, to: CURRENT_SCHEMA_VERSION, changed: false, forwardVersion: true };
    }

    const updates = {};

    if (from < 1) {
      updates[DEFERRED_KEY] = normalizeDeferred(data[DEFERRED_KEY]);
      updates[VIEW_MODE_KEY] = normalizeViewMode(data[VIEW_MODE_KEY]);
      updates[PRIVACY_MODE_KEY] = data[PRIVACY_MODE_KEY] === true;
      updates[PRIVACY_SETTINGS_KEY] = normalizePrivacySettings(data[PRIVACY_SETTINGS_KEY]);
    }

    if (from < 2) {
      updates[SAVED_SESSIONS_KEY] = normalizeSavedSessions(data[SAVED_SESSIONS_KEY]);
      updates[ACTIVITY_STATS_KEY] = normalizeActivityStats(data[ACTIVITY_STATS_KEY]);
      updates[ACHIEVEMENTS_KEY] = normalizeAchievements(data[ACHIEVEMENTS_KEY]);
    }

    if (from !== CURRENT_SCHEMA_VERSION) {
      updates[STORAGE_SCHEMA_KEY] = CURRENT_SCHEMA_VERSION;
      updates[STORAGE_LAST_MIGRATED_KEY] = nowIso();
    }

    if (Object.keys(updates).length > 0) {
      await set(updates);
      return { from, to: CURRENT_SCHEMA_VERSION, changed: true };
    }

    return { from, to: CURRENT_SCHEMA_VERSION, changed: false };
  }

  async function getDeferred() {
    const data = await get(DEFERRED_KEY);
    return normalizeDeferred(data[DEFERRED_KEY]);
  }

  async function setDeferred(deferred) {
    await set({ [DEFERRED_KEY]: normalizeDeferred(deferred) });
  }

  async function getSavedSessions() {
    const data = await get(SAVED_SESSIONS_KEY);
    return normalizeSavedSessions(data[SAVED_SESSIONS_KEY]);
  }

  async function setSavedSessions(sessions) {
    await set({ [SAVED_SESSIONS_KEY]: normalizeSavedSessions(sessions) });
  }

  async function addSavedSession(session) {
    const sessions = await getSavedSessions();
    const normalized = normalizeSavedSession(session, sessions.length);
    if (normalized.urls.length === 0 && normalized.tabs.length === 0) return false;
    sessions.unshift(normalized);
    await setSavedSessions(sessions);
    return true;
  }

  async function removeSavedSession(id) {
    const sessions = await getSavedSessions();
    const nextSessions = sessions.filter(session => session.id !== id);
    if (nextSessions.length === sessions.length) return false;
    await setSavedSessions(nextSessions);
    return true;
  }

  async function getActivityStats() {
    const data = await get(ACTIVITY_STATS_KEY);
    return normalizeActivityStats(data[ACTIVITY_STATS_KEY]);
  }

  async function recordActivity(event) {
    const stats = await getActivityStats();
    const currentWeek = weekKey();
    if (!stats.weekly[currentWeek]) {
      stats.weekly[currentWeek] = { closed: 0, saved: 0, duplicateClosed: 0, sessionsSaved: 0 };
    }
    const count = Math.max(1, Number(event?.count) || 1);
    const domain = typeof event?.domain === 'string' ? event.domain : '';

    if (event?.type === 'closed') {
      stats.closedTotal += count;
      stats.weekly[currentWeek].closed += count;
    } else if (event?.type === 'saved') {
      stats.savedTotal += count;
      stats.weekly[currentWeek].saved += count;
    } else if (event?.type === 'duplicateClosed') {
      stats.duplicateClosedTotal += count;
      stats.weekly[currentWeek].duplicateClosed += count;
    } else if (event?.type === 'sessionSaved') {
      stats.sessionsSavedTotal += count;
      stats.weekly[currentWeek].sessionsSaved += count;
    }

    if (domain) stats.domains[domain] = (Number(stats.domains[domain]) || 0) + count;
    await set({ [ACTIVITY_STATS_KEY]: stats });
    return stats;
  }

  async function getAchievements() {
    const data = await get(ACHIEVEMENTS_KEY);
    return normalizeAchievements(data[ACHIEVEMENTS_KEY]);
  }

  async function unlockAchievements(ids) {
    const current = new Set(await getAchievements());
    for (const id of ids || []) current.add(id);
    const achievements = Array.from(current);
    await set({ [ACHIEVEMENTS_KEY]: achievements });
    return achievements;
  }

  async function addDeferredTab(tab) {
    const url = normalizeRestorableUrl(tab?.url);
    if (!url) return false;
    const deferred = await getDeferred();
    deferred.push({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      url,
      title: tab.title || url,
      savedAt: nowIso(),
      completed: false,
      dismissed: false,
    });
    await setDeferred(deferred);
    return true;
  }

  async function updateDeferredTab(id, patch) {
    const deferred = await getDeferred();
    const item = deferred.find(tab => tab.id === id);
    if (!item) return false;
    Object.assign(item, patch);
    await setDeferred(deferred);
    return true;
  }

  async function clearArchivedDeferredTabs() {
    const deferred = await getDeferred();
    const nextDeferred = deferred.filter(tab => !tab.completed);
    const removed = deferred.length - nextDeferred.length;
    if (removed > 0) await setDeferred(nextDeferred);
    return removed;
  }

  async function getSavedTabs() {
    const visible = (await getDeferred()).filter(tab => !tab.dismissed);
    return {
      active: visible.filter(tab => !tab.completed),
      archived: visible.filter(tab => tab.completed),
    };
  }

  async function getViewMode() {
    const data = await get(VIEW_MODE_KEY);
    return normalizeViewMode(data[VIEW_MODE_KEY]);
  }

  async function setViewMode(mode) {
    await set({ [VIEW_MODE_KEY]: normalizeViewMode(mode) });
  }

  async function getPrivacyMode() {
    const data = await get(PRIVACY_MODE_KEY);
    return data[PRIVACY_MODE_KEY] === true;
  }

  async function setPrivacyMode(enabled) {
    await set({ [PRIVACY_MODE_KEY]: enabled === true });
  }

  async function getPrivacySettings() {
    const data = await get(PRIVACY_SETTINGS_KEY);
    return normalizePrivacySettings(data[PRIVACY_SETTINGS_KEY]);
  }

  async function setPrivacySettings(settings) {
    await set({ [PRIVACY_SETTINGS_KEY]: normalizePrivacySettings(settings) });
  }

  const api = {
    CURRENT_SCHEMA_VERSION,
    STORAGE_SCHEMA_KEY,
    SAVED_SESSIONS_KEY,
    ACTIVITY_STATS_KEY,
    ACHIEVEMENTS_KEY,
    PRIVACY_DEFAULTS,
    get,
    set,
    getBytesInUse,
    onStorageError,
    isQuotaError,
    normalizeDeferred,
    normalizeSavedSessions,
    normalizeActivityStats,
    normalizeViewMode,
    normalizePrivacySettings,
    migrateStorage,
    getDeferred,
    setDeferred,
    getSavedSessions,
    setSavedSessions,
    addSavedSession,
    removeSavedSession,
    getActivityStats,
    recordActivity,
    getAchievements,
    unlockAchievements,
    addDeferredTab,
    updateDeferredTab,
    clearArchivedDeferredTabs,
    getSavedTabs,
    getViewMode,
    setViewMode,
    getPrivacyMode,
    setPrivacyMode,
    getPrivacySettings,
    setPrivacySettings,
  };

  global.SuperTabOutStorage = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);

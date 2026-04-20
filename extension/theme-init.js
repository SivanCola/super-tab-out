/* Runs synchronously in <head> so the stored theme is applied before
   the body paints — avoids a flash of the default palette on reload. */
(function () {
  try {
    var t = localStorage.getItem('tab-out-theme');
    if (t) document.documentElement.dataset.theme = t;
  } catch (e) { /* localStorage unavailable — fall back to default */ }

  try {
    var lang = localStorage.getItem('tab-out-language');
    if (lang === 'zh' || lang === 'en') {
      document.documentElement.dataset.lang = lang;
      document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
    }
  } catch (e) { /* localStorage unavailable — fall back to default */ }
})();

/** Apply saved light/dark theme before paint — include synchronously in <head> on every page. */
(function (global) {
  var KEY = 'theme';

  function isDark() {
    try {
      return localStorage.getItem(KEY) === 'dark';
    } catch (e) {
      return false;
    }
  }

  function apply() {
    var dark = isDark();
    var root = document.documentElement;
    root.classList.toggle('dark', dark);
    root.classList.toggle('light', !dark);
  }

  apply();

  global.AcctSuiteTheme = {
    key: KEY,
    isDark: isDark,
    apply: apply,
    set: function (mode) {
      try {
        localStorage.setItem(KEY, mode === 'dark' ? 'dark' : 'light');
      } catch (e) {}
      apply();
    },
    toggle: function () {
      global.AcctSuiteTheme.set(isDark() ? 'light' : 'dark');
      return isDark();
    },
  };
})(window);

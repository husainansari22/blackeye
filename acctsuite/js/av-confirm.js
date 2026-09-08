/**
 * AcctSuite branded confirm dialog — replaces native window.confirm()
 * everywhere (dashboard logout, cart, refunds, owner/admin actions).
 */
(function (global) {
  'use strict';

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function nl2br(s) {
    return escapeHtml(s).replace(/\n/g, '<br>');
  }

  function ensureShell() {
    var root = document.getElementById('avConfirmModal');
    if (root) return root;

    root = document.createElement('div');
    root.id = 'avConfirmModal';
    root.className = 'fixed inset-0 z-[200] hidden items-center justify-center p-4 bg-black/60';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.innerHTML =
      '<div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 w-full max-w-sm rounded-2xl p-6 shadow-2xl">' +
        '<div id="avConfirmBody"></div>' +
      '</div>';
    document.body.appendChild(root);
    return root;
  }

  function closeShell() {
    var root = document.getElementById('avConfirmModal');
    if (!root) return;
    root.classList.add('hidden');
    root.classList.remove('flex');
    document.getElementById('avConfirmBody').innerHTML = '';
  }

  /**
   * @param {string|object} optsOrMessage
   * @returns {Promise<boolean>}
   */
  function confirm(optsOrMessage) {
    var opts =
      typeof optsOrMessage === 'string'
        ? { message: optsOrMessage }
        : optsOrMessage || {};
    var message = opts.message || 'Are you sure?';
    var title = opts.title || 'Confirm';
    var okText = opts.okText || opts.confirmText || 'OK';
    var cancelText = opts.cancelText || 'Cancel';
    var icon = opts.icon || 'fa-circle-question';
    var danger = !!opts.danger;
    var subtitle = opts.subtitle || 'AcctSuite';

    return new Promise(function (resolve) {
      var root = ensureShell();
      var body = document.getElementById('avConfirmBody');
      if (!body) {
        resolve(!!global.confirm(message));
        return;
      }

      var iconBg = danger ? 'bg-red-500/15 text-red-500' : 'bg-brandPrimary/15 text-brandPrimary';
      var okClass = danger
        ? 'bg-red-500 hover:bg-red-600 text-white'
        : 'bg-brandPrimary hover:bg-brandHover text-white';

      body.innerHTML =
        '<div class="text-left py-1">' +
          '<div class="flex items-center gap-3 mb-4">' +
            '<div class="w-11 h-11 rounded-xl ' +
            iconBg +
            ' flex items-center justify-center text-lg shrink-0"><i class="fa-solid ' +
            escapeHtml(icon) +
            '"></i></div>' +
            '<div class="min-w-0">' +
              '<h3 class="font-extrabold text-base tracking-tight text-slate-900 dark:text-white">' +
              escapeHtml(title) +
              '</h3>' +
              (subtitle
                ? '<p class="text-[11px] text-slate-500 mt-0.5">' + escapeHtml(subtitle) + '</p>'
                : '') +
            '</div>' +
          '</div>' +
          '<p class="text-sm text-slate-600 dark:text-slate-300 leading-relaxed mb-5">' +
          nl2br(message) +
          '</p>' +
          '<div class="flex gap-2">' +
            '<button type="button" id="avConfirmCancel" class="flex-1 py-3 rounded-xl text-sm font-bold border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800">' +
            escapeHtml(cancelText) +
            '</button>' +
            '<button type="button" id="avConfirmOk" class="flex-1 py-3 rounded-xl text-sm font-bold shadow-sm ' +
            okClass +
            '">' +
            escapeHtml(okText) +
            '</button>' +
          '</div>' +
        '</div>';

      root.classList.remove('hidden');
      root.classList.add('flex');

      function done(val) {
        closeShell();
        resolve(!!val);
      }

      document.getElementById('avConfirmCancel').onclick = function () {
        done(false);
      };
      document.getElementById('avConfirmOk').onclick = function () {
        done(true);
      };

      root.onclick = function (ev) {
        if (ev.target === root) done(false);
      };
    });
  }

  function confirmSubmit(ev, message, opts) {
    if (ev && typeof ev.preventDefault === 'function') ev.preventDefault();
    var form = ev && ev.target;
    confirm(
      Object.assign(
        {
          message: message || 'Are you sure?',
        },
        opts || {}
      )
    ).then(function (ok) {
      if (ok && form && typeof form.submit === 'function') form.submit();
    });
    return false;
  }

  global.AcctSuiteConfirm = confirm;
  global.avConfirmSubmit = confirmSubmit;
})(window);

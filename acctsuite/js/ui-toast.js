/**
 * Top action toasts (acctbazaar-style): bold message, icon, timer bar, auto-dismiss.
 * Patches window.alert on pages that load this script.
 */
(function (global) {
  var DEFAULT_MS = 4000;
  var MAX_VISIBLE = 2;
  var host = null;
  var queue = [];

  function ensureHost() {
    if (host && document.body && document.body.contains(host)) return host;
    host = document.getElementById('avToastHost');
    if (!host) {
      host = document.createElement('div');
      host.id = 'avToastHost';
      host.setAttribute('aria-live', 'polite');
      host.setAttribute('aria-relevant', 'additions');
    }
    if (document.body) {
      if (!document.getElementById('avToastHost')) document.body.appendChild(host);
    } else if (!ensureHost._waiting) {
      ensureHost._waiting = true;
      document.addEventListener('DOMContentLoaded', function () {
        ensureHost._waiting = false;
        if (!document.getElementById('avToastHost')) document.body.appendChild(host);
        flushQueue();
      });
    }
    return host;
  }

  function inferType(message) {
    var m = String(message || '').toLowerCase();
    if (/fail|error|invalid|required|denied|blocked|could not|couldn't|unable|missing|don't have|do not have|insufficient|not enough/.test(m)) {
      return 'error';
    }
    if (/warn|pending|review|owe|owing|locked|unavailable|no wallet|not set|not available|moment/.test(m)) {
      return 'warn';
    }
    if (/success|copied|credited|updated|submitted|sent|approved|completed|refunded|thanks|saved/.test(m)) {
      return 'success';
    }
    return 'info';
  }

  function iconFor(type) {
    if (type === 'success') return '✓';
    if (type === 'info') return 'i';
    return '!';
  }

  function dismiss(el) {
    if (!el || el._avLeaving) return;
    el._avLeaving = true;
    el.classList.remove('is-in');
    el.classList.add('is-out');
    clearTimeout(el._avTimer);
    setTimeout(function () {
      if (el.parentNode) el.parentNode.removeChild(el);
      flushQueue();
    }, 260);
  }

  function flushQueue() {
    ensureHost();
    if (!document.body || !host || !document.body.contains(host)) return;
    while (queue.length && host.querySelectorAll('.av-toast').length < MAX_VISIBLE) {
      mount(queue.shift());
    }
  }

  function mount(item) {
    ensureHost();
    var el = document.createElement('div');
    el.className = 'av-toast av-toast--' + item.type;
    el.setAttribute('role', 'status');
    el.innerHTML =
      '<div class="av-toast__icon" aria-hidden="true">' +
      iconFor(item.type) +
      '</div>' +
      '<p class="av-toast__msg"></p>' +
      '<button type="button" class="av-toast__close" aria-label="Close">×</button>' +
      '<div class="av-toast__bar"></div>';
    el.querySelector('.av-toast__msg').textContent = item.message || '';
    var bar = el.querySelector('.av-toast__bar');
    bar.style.animationDuration = item.duration + 'ms';
    el.querySelector('.av-toast__close').addEventListener('click', function () {
      dismiss(el);
    });
    host.appendChild(el);
    requestAnimationFrame(function () {
      el.classList.add('is-in');
    });
    el._avTimer = setTimeout(function () {
      dismiss(el);
    }, item.duration);
  }

  function show(message, opts) {
    opts = opts || {};
    var text = String(message == null ? '' : message).trim();
    if (!text) return null;
    var type = opts.type || inferType(text);
    var item = {
      message: text,
      type: type,
      duration: Math.max(1800, Number(opts.duration) || DEFAULT_MS),
    };
    ensureHost();
    if (!document.body || !host || !document.body.contains(host)) {
      queue.push(item);
      return item;
    }
    if (host.querySelectorAll('.av-toast').length >= MAX_VISIBLE) {
      queue.push(item);
      return item;
    }
    mount(item);
    return item;
  }

  function success(message, opts) {
    opts = opts || {};
    opts.type = 'success';
    return show(message, opts);
  }
  function error(message, opts) {
    opts = opts || {};
    opts.type = 'error';
    return show(message, opts);
  }
  function warn(message, opts) {
    opts = opts || {};
    opts.type = 'warn';
    return show(message, opts);
  }
  function info(message, opts) {
    opts = opts || {};
    opts.type = 'info';
    return show(message, opts);
  }

  var nativeAlert = global.alert ? global.alert.bind(global) : function (m) {
    console.log(m);
  };

  function toastAlert(message) {
    try {
      show(message);
    } catch (e) {
      nativeAlert(message);
    }
  }

  function patchAlert(enable) {
    if (enable === false) {
      global.alert = nativeAlert;
      return;
    }
    global.alert = toastAlert;
  }

  patchAlert(true);

  global.AcctSuiteToast = {
    show: show,
    success: success,
    error: error,
    warn: warn,
    info: info,
    patchAlert: patchAlert,
    nativeAlert: nativeAlert,
    DEFAULT_MS: DEFAULT_MS,
  };
})(window);

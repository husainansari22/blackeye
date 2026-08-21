/**
 * Site-wide Acctventa action toasts — branded, auto-dismiss (default 4s).
 * Also upgrades native alert() so existing calls match the app design.
 */
(function (global) {
  var DEFAULT_MS = 4000;
  var MAX_VISIBLE = 3;
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

  function show(message, opts) {
    opts = opts || {};
    var text = String(message == null ? '' : message).trim();
    if (!text) return null;
    var type = opts.type || inferType(text);
    var item = {
      message: text,
      title: opts.title || '',
      type: type,
      duration: Math.max(1800, Number(opts.duration) || DEFAULT_MS),
    };
    ensureHost();
    if (!document.body || (host && host.querySelectorAll && host.querySelectorAll('.av-toast').length >= MAX_VISIBLE)) {
      queue.push(item);
      return item;
    }
    if (!document.body.contains(host)) {
      queue.push(item);
      return item;
    }
    mount(item);
    return item;
  }

  function inferType(message) {
    var m = String(message || '').toLowerCase();
    if (/fail|error|invalid|required|denied|blocked|could not|couldn't|unable|missing/.test(m)) return 'error';
    if (/warn|pending|review|owe|owing|locked|unavailable|no wallet|not set|not available/.test(m)) return 'warn';
    if (/success|copied|credited|updated|submitted|sent|approved|completed|refunded|thanks|saved/.test(m)) return 'success';
    return 'info';
  }

  function iconFor(type) {
    if (type === 'success') return '✓';
    if (type === 'warn') return '!';
    if (type === 'error') return '×';
    return 'i';
  }

  function titleFor(type) {
    if (type === 'success') return 'Done';
    if (type === 'warn') return 'Notice';
    if (type === 'error') return 'Something went wrong';
    return 'Acctventa';
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
      '<div class="av-toast__body">' +
      '<p class="av-toast__title"></p>' +
      '<p class="av-toast__msg"></p>' +
      '</div>' +
      '<button type="button" class="av-toast__close" aria-label="Close">×</button>' +
      '<div class="av-toast__bar"></div>';
    el.querySelector('.av-toast__title').textContent = item.title || titleFor(item.type);
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
      title: opts.title || '',
      type: type,
      duration: Math.max(1800, Number(opts.duration) || DEFAULT_MS),
    };
    ensureHost();
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

  var nativeAlert = global.alert ? global.alert.bind(global) : function (m) { console.log(m); };

  function toastAlert(message) {
    try {
      show(message);
    } catch (e) {
      nativeAlert(message);
    }
  }

  /** Patch window.alert so legacy calls use branded toasts. */
  function patchAlert(enable) {
    if (enable === false) {
      global.alert = nativeAlert;
      return;
    }
    global.alert = toastAlert;
  }

  // Auto-patch once DOM is ready enough
  patchAlert(true);

  global.AcctventaToast = {
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

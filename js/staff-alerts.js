/**
 * Staff/owner chat alerts — works on mobile even when Notification API is missing (iPhone Safari).
 * Falls back to in-page toast + title flash + optional vibrate/beep.
 */
(function (global) {
  const KEY = 'acctventa_staff_inapp_alerts';
  let titleTimer = null;
  let originalTitle = '';

  function canUseSystemNotifications() {
    try {
      return (
        (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1') &&
        typeof Notification !== 'undefined' &&
        typeof Notification.requestPermission === 'function'
      );
    } catch (e) {
      return false;
    }
  }

  function isIos() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }

  function inAppEnabled() {
    try {
      return localStorage.getItem(KEY) !== '0';
    } catch (e) {
      return true;
    }
  }

  function setInAppEnabled(on) {
    try {
      localStorage.setItem(KEY, on ? '1' : '0');
    } catch (e) {}
  }

  function ensureToastStyles() {
    if (document.getElementById('acctventaStaffAlertStyles')) return;
    const style = document.createElement('style');
    style.id = 'acctventaStaffAlertStyles';
    style.textContent =
      '#acctventaStaffToast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%) translateY(120%);z-index:99999;max-width:min(92vw,380px);background:#0f172a;color:#fff;border:1px solid #0ea5e9;border-radius:14px;padding:12px 14px;box-shadow:0 12px 40px rgba(0,0,0,.35);transition:transform .25s ease;font-family:system-ui,sans-serif}' +
      '#acctventaStaffToast.show{transform:translateX(-50%) translateY(0)}' +
      '#acctventaStaffToast .t{font-weight:700;font-size:13px;margin:0 0 4px}' +
      '#acctventaStaffToast .b{font-size:12px;opacity:.9;margin:0;line-height:1.35}' +
      '#acctventaStaffNotifStatus{font-size:11px;opacity:.8}';
    document.head.appendChild(style);
  }

  function showToast(title, body) {
    if (global.AcctventaToast && typeof global.AcctventaToast.show === 'function') {
      var msg = [title, body].filter(function (p) { return String(p || '').trim(); }).join(' — ');
      global.AcctventaToast.show(msg || 'New message', {
        type: 'info',
        duration: 4500,
      });
      return;
    }
    ensureToastStyles();
    let el = document.getElementById('acctventaStaffToast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'acctventaStaffToast';
      el.innerHTML = '<p class="t"></p><p class="b"></p>';
      document.body.appendChild(el);
    }
    el.querySelector('.t').textContent = title || 'New message';
    el.querySelector('.b').textContent = String(body || '').slice(0, 160);
    el.classList.add('show');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(function () {
      el.classList.remove('show');
    }, 4500);
  }

  function flashTitle(title) {
    if (!originalTitle) originalTitle = document.title;
    let n = 0;
    clearInterval(titleTimer);
    titleTimer = setInterval(function () {
      document.title = n % 2 === 0 ? '💬 ' + (title || 'New chat') : originalTitle;
      n += 1;
      if (n > 8) {
        clearInterval(titleTimer);
        document.title = originalTitle;
      }
    }, 700);
  }

  function tryBeep() {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = 880;
      g.gain.value = 0.04;
      o.connect(g);
      g.connect(ctx.destination);
      o.start();
      setTimeout(function () {
        o.stop();
        ctx.close();
      }, 160);
    } catch (e) {}
  }

  function statusText() {
    if (!inAppEnabled()) return 'Alerts off';
    if (canUseSystemNotifications() && Notification.permission === 'granted') return 'Alerts on (system + in-app)';
    if (canUseSystemNotifications() && Notification.permission === 'denied') return 'In-app alerts on (system blocked)';
    if (!canUseSystemNotifications()) return 'In-app alerts on (phone browser)';
    return 'In-app alerts on';
  }

  function updateButton(btnId) {
    const btn = document.getElementById(btnId || 'staffNotifBtn');
    if (btn) btn.textContent = inAppEnabled() ? 'Alerts on' : 'Enable alerts';
    const st = document.getElementById('staffNotifStatus');
    if (st) st.textContent = statusText();
  }

  /**
   * @param {{silent?: boolean, buttonId?: string}} opts
   */
  function enable(opts) {
    opts = opts || {};
    const silent = !!opts.silent;
    setInAppEnabled(true);
    updateButton(opts.buttonId);

    if (!canUseSystemNotifications()) {
      if (!silent) {
        const tip = isIos()
          ? 'iPhone Safari usually blocks website push notifications. In-app alerts are ON — keep this Support tab open to see toasts and title flashes for new chats.\n\nFor system banners, open the site in Chrome/Desktop, or add Acctventa to your Home Screen on newer iOS.'
          : 'This browser does not support system notifications here. In-app alerts are ON — keep this Support tab open to see new chat alerts.';
        alert(tip);
      }
      return;
    }

    Promise.resolve(Notification.requestPermission())
      .then(function (p) {
        if (!silent) {
          if (p === 'granted') {
            alert('System notifications enabled. You will also get in-app toasts while this tab is open.');
          } else if (p === 'denied') {
            alert('System notifications are blocked in browser settings. In-app alerts stay ON — keep this Support tab open.');
          } else {
            alert('Notification permission: ' + p + '. In-app alerts are ON.');
          }
        }
        updateButton(opts.buttonId);
      })
      .catch(function () {
        if (!silent) alert('Could not request system permission. In-app alerts are ON while this tab is open.');
        updateButton(opts.buttonId);
      });
  }

  function notify(title, body) {
    if (!inAppEnabled()) return;
    showToast(title, body);
    flashTitle(title);
    tryBeep();
    try {
      if (navigator.vibrate) navigator.vibrate(140);
    } catch (e) {}
    if (
      canUseSystemNotifications() &&
      Notification.permission === 'granted' &&
      document.visibilityState !== 'visible'
    ) {
      try {
        new Notification(title || 'New message', {
          body: String(body || '').slice(0, 120),
          icon: '/img/logo.png',
        });
      } catch (e) {}
    }
  }

  // Auto-enable in-app alerts (no popup) so chat polling can notify without a click.
  if (inAppEnabled() === false) {
    /* respect explicit off */
  } else {
    setInAppEnabled(true);
  }

  global.AcctventaStaffAlerts = {
    enable: enable,
    notify: notify,
    updateButton: updateButton,
    statusText: statusText,
    canUseSystemNotifications: canUseSystemNotifications,
  };
})(window);

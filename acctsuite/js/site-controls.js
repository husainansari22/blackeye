/**
 * Owner-controlled site banners + contact hydration (homepage + app).
 * Banner sits in normal document flow under the fixed header — never overlays nav controls.
 */
(function (global) {
  function cfgFromLocal() {
    try {
      const A = global.AcctSuite;
      if (A && A.CONFIG) return A.CONFIG;
      const raw = localStorage.getItem('acctsuite_settings');
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return (parsed && parsed.config) || {};
    } catch (e) {
      return {};
    }
  }

  function ensureBannerHost() {
    let el = document.getElementById('asOwnerBanner');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'asOwnerBanner';
    el.setAttribute('role', 'status');
    el.style.cssText =
      'display:none;position:relative;z-index:1;margin:0;padding:0.55rem 0.85rem;font-size:12px;font-weight:600;line-height:1.35;text-align:center;pointer-events:none;';

    // Place BELOW the fixed app header spacer so logo / menu stay clickable.
    const spacer =
      document.querySelector('header.fixed + div.h-14') ||
      document.querySelector('header.fixed + .h-14') ||
      document.querySelector('body > header + div');
    const header = document.querySelector('header');
    if (spacer && spacer.parentNode) {
      spacer.parentNode.insertBefore(el, spacer.nextSibling);
    } else if (header && header.parentNode) {
      header.parentNode.insertBefore(el, header.nextSibling);
    } else {
      document.body.insertBefore(el, document.body.firstChild);
    }
    return el;
  }

  function removeBannerHost() {
    const el = document.getElementById('asOwnerBanner');
    if (el && el.parentNode) el.parentNode.removeChild(el);
  }

  function applyAcctSuiteSiteControls(config) {
    const c = config || cfgFromLocal() || {};
    let text = '';
    let bg = '#7c3aed';
    let color = '#fff';
    if (c.maintenanceMode) {
      text = c.maintenanceMessage || 'We are doing a short maintenance. Please try again soon.';
      bg = '#b45309';
    } else if (c.announcementEnabled && c.announcementText) {
      text = String(c.announcementText || '').trim();
      bg = '#7c3aed';
    }

    if (!text) {
      removeBannerHost();
    } else {
      const banner = ensureBannerHost();
      banner.textContent = text;
      banner.style.display = 'block';
      banner.style.background = bg;
      banner.style.color = color;
    }

    document.querySelectorAll('[data-as-support-telegram]').forEach((a) => {
      if (c.supportTelegram) a.setAttribute('href', c.supportTelegram);
    });
    document.querySelectorAll('[data-as-group-telegram]').forEach((a) => {
      if (c.groupTelegram) a.setAttribute('href', c.groupTelegram);
    });
    document.querySelectorAll('[data-as-support-email]').forEach((a) => {
      if (c.supportEmail) a.setAttribute('href', 'mailto:' + c.supportEmail);
    });
    document.querySelectorAll('[data-as-support-whatsapp]').forEach((a) => {
      if (c.supportWhatsapp) {
        a.setAttribute('href', c.supportWhatsapp);
        a.classList.remove('hidden');
        a.style.display = '';
      } else {
        a.classList.add('hidden');
      }
    });
    if (c.siteName) {
      document.querySelectorAll('[data-as-site-name]').forEach((n) => {
        n.textContent = c.siteName;
      });
    }
  }

  async function bootFromApi() {
    try {
      const res = await fetch('/api/index.php?action=config.public', { credentials: 'same-origin' });
      const data = await res.json();
      if (data && data.ok && data.config) applyAcctSuiteSiteControls(data.config);
      else applyAcctSuiteSiteControls();
    } catch (e) {
      applyAcctSuiteSiteControls();
    }
  }

  global.applyAcctSuiteSiteControls = applyAcctSuiteSiteControls;
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootFromApi);
  } else {
    bootFromApi();
  }
})(window);

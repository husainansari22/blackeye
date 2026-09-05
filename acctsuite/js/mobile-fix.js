/**
 * Block leftover pinch-zoom on iOS Safari.
 * Pair with /css/mobile-fix.css and a locked viewport meta.
 * Keep this light — aggressive preventDefault on every gesture hurts taps.
 */
(function () {
  'use strict';

  function lockViewportMeta() {
    var content =
      'width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover';
    var meta = document.querySelector('meta[name="viewport"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.setAttribute('name', 'viewport');
      document.head.appendChild(meta);
    }
    meta.setAttribute('content', content);
  }

  // Only block multi-touch pinch; do not blanket-cancel all gestures
  document.addEventListener(
    'touchmove',
    function (e) {
      if (e.touches && e.touches.length > 1) e.preventDefault();
    },
    { passive: false }
  );

  function resetVisualViewport() {
    try {
      lockViewportMeta();
    } catch (e) {}
  }

  /** Close any overlay that may have been left open / stuck covering taps */
  function resetStuckOverlays() {
    [
      'appModal',
      'walletFlowOverlay',
      'kycOverlay',
      'sellWizardOverlay',
      'chatOverlay',
      'filterDrawer',
    ].forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      el.classList.add('hidden');
      el.classList.remove('flex');
    });
    try {
      document.body.style.overflow = '';
    } catch (e) {}
  }

  lockViewportMeta();
  window.addEventListener('pageshow', function () {
    resetVisualViewport();
    resetStuckOverlays();
  });
  window.addEventListener('orientationchange', function () {
    setTimeout(lockViewportMeta, 50);
  });
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', resetStuckOverlays);
  } else {
    resetStuckOverlays();
  }

  window.AcctSuiteUiReset = resetStuckOverlays;
})();

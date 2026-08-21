/**
 * Block leftover gesture / double-tap zoom on iOS Safari.
 * Pair with /css/mobile-fix.css and a locked viewport meta.
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

  // Older iOS pinch gestures
  ['gesturestart', 'gesturechange', 'gestureend'].forEach(function (evt) {
    document.addEventListener(
      evt,
      function (e) {
        e.preventDefault();
      },
      { passive: false }
    );
  });

  // If the user somehow got stuck zoomed, re-assert viewport meta
  function resetVisualViewport() {
    try {
      lockViewportMeta();
    } catch (e) {}
  }

  lockViewportMeta();
  window.addEventListener('pageshow', resetVisualViewport);
  window.addEventListener('orientationchange', function () {
    setTimeout(lockViewportMeta, 50);
  });
})();

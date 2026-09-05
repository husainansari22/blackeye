/**
 * AcctSuite commerce UI — cart drawer, wishlist, disputes, social proof, and chat-safety
 * banners layered on top of dashboard-app.js. Talks to the backend through window.AcctSuiteApi
 * (see api/commerce_features.php + api/index.php for the matching server actions).
 */
(function (global) {
  function Api() {
    return global.AcctSuiteApi;
  }
  function A() {
    return global.AcctSuite;
  }

  function money(n) {
    var a = A();
    if (a && typeof a.formatMoney === 'function') return a.formatMoney(n);
    var v = Number(n) || 0;
    return (v < 0 ? '-$' + Math.abs(v).toFixed(2) : '$' + v.toFixed(2));
  }

  function toast(msg, opts) {
    if (!msg) return;
    if (global.AcctSuiteToast && typeof global.AcctSuiteToast.show === 'function') {
      global.AcctSuiteToast.show(msg, opts || {});
    } else {
      global.alert(msg);
    }
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  function escapeAttr(s) {
    return escapeHtml(s).replace(/'/g, '&#39;');
  }

  function usingApi() {
    if (global.AcctSuiteApi && global.AcctSuiteApi.hasApiSession) {
      try {
        return global.AcctSuiteApi.hasApiSession();
      } catch (e) {}
    }
    return !!(global.AcctSuiteApiSync && global.AcctSuiteApiSync.usingApi && global.AcctSuiteApiSync.usingApi());
  }

  function currentUser() {
    var a = A();
    return a && typeof a.getCurrentUser === 'function' ? a.getCurrentUser() : null;
  }

  function requireLogin(message) {
    var u = currentUser();
    if (u) return u;
    try {
      if (localStorage.getItem('isLoggedIn') === 'true') {
        return {
          email: localStorage.getItem('userEmail') || '',
          name: localStorage.getItem('userName') || 'User',
        };
      }
    } catch (e) {}
    toast(message || 'You are not logged in. Sign in first.', { type: 'warn' });
    return null;
  }

  // ---------------------------------------------------------------------
  // Generic modal helpers — reuse the dashboard's #appModal shell so we
  // don't need a brand new overlay just for simple one-off dialogs.
  // ---------------------------------------------------------------------
  function openAppModal(html) {
    var body = document.getElementById('modalBody');
    if (body) body.innerHTML = html;
    if (typeof global.openModal === 'function') {
      global.openModal();
      return;
    }
    var m = document.getElementById('appModal');
    if (m) {
      m.classList.remove('hidden');
      m.classList.add('flex');
    }
  }
  function closeAppModal() {
    if (typeof global.closeModal === 'function') {
      global.closeModal();
      return;
    }
    var m = document.getElementById('appModal');
    if (m) {
      m.classList.add('hidden');
      m.classList.remove('flex');
    }
  }

  // ---------------------------------------------------------------------
  // Insufficient funds
  // ---------------------------------------------------------------------
  function showInsufficientFundsModal() {
    openAppModal(
      '<div class="text-center py-2">' +
        '<div class="w-14 h-14 rounded-full bg-red-500/10 text-red-500 flex items-center justify-center text-2xl mx-auto mb-3"><i class="fa-solid fa-wallet"></i></div>' +
        '<h3 class="font-bold text-lg mb-2">Insufficient funds</h3>' +
        '<p class="text-sm text-slate-500 mb-5">Please deposit money into your wallet.</p>' +
        '<button type="button" onclick="window.CommerceUI.closeAndGoWallet()" class="w-full bg-brandPrimary hover:bg-brandHover text-white font-bold py-3 rounded-xl">Go to Wallet</button>' +
      '</div>'
    );
  }
  function closeAndGoWallet() {
    closeAppModal();
    if (typeof global.switchTab === 'function') global.switchTab('wallet');
  }

  /**
   * Branded plan checkout confirm — matches AcctSuite dark/light cards
   * (replaces the browser system confirm dialog).
   */
  function confirmPlanCheckout(opts) {
    opts = opts || {};
    var planName = opts.planName || 'plan';
    var price = money(opts.price || 0);
    var uploads = opts.dailyUploads != null ? opts.dailyUploads : '';
    var method = opts.method === 'wallet' ? 'wallet' : 'flutterwave';
    var title = method === 'wallet' ? 'Pay from wallet' : 'Continue to checkout';
    var body =
      method === 'wallet'
        ? 'Pay <strong class="text-brandPrimary">' +
          escapeHtml(price) +
          '</strong> from your wallet to activate <strong>' +
          escapeHtml(planName) +
          '</strong>' +
          (uploads !== '' ? ' (' + escapeHtml(String(uploads)) + ' uploads / day)' : '') +
          '?'
        : 'Continue to Flutterwave to pay <strong class="text-brandPrimary">' +
          escapeHtml(price) +
          '</strong> for <strong>' +
          escapeHtml(planName) +
          '</strong>' +
          (uploads !== '' ? ' (' + escapeHtml(String(uploads)) + ' uploads / day)' : '') +
          '?';
    var cta = method === 'wallet' ? 'Pay from wallet' : 'Continue to pay';

    return new Promise(function (resolve) {
      openAppModal(
        '<div class="text-left py-1">' +
          '<div class="flex items-center gap-3 mb-4">' +
          '<div class="w-11 h-11 rounded-xl bg-brandPrimary/15 text-brandPrimary flex items-center justify-center text-lg shrink-0"><i class="fa-solid fa-crown"></i></div>' +
          '<div class="min-w-0">' +
          '<h3 class="font-extrabold text-base tracking-tight">' +
          escapeHtml(title) +
          '</h3>' +
          '<p class="text-[11px] text-slate-500 mt-0.5">AcctSuite packages</p>' +
          '</div></div>' +
          '<p class="text-sm text-slate-600 dark:text-slate-300 leading-relaxed mb-5">' +
          body +
          '</p>' +
          '<div class="flex gap-2">' +
          '<button type="button" id="planConfirmCancel" class="flex-1 py-3 rounded-xl text-sm font-bold border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800">Cancel</button>' +
          '<button type="button" id="planConfirmOk" class="flex-1 py-3 rounded-xl text-sm font-bold bg-brandPrimary hover:bg-brandHover text-white shadow-sm">' +
          escapeHtml(cta) +
          '</button>' +
          '</div></div>'
      );
      var cancelBtn = document.getElementById('planConfirmCancel');
      var okBtn = document.getElementById('planConfirmOk');
      function done(val) {
        closeAppModal();
        resolve(!!val);
      }
      if (cancelBtn) cancelBtn.onclick = function () { done(false); };
      if (okBtn) okBtn.onclick = function () { done(true); };
    });
  }

  // ---------------------------------------------------------------------
  // Cart
  // ---------------------------------------------------------------------
  var cartCache = [];

  async function refreshCartBadge() {
    var badge = document.getElementById('cartBadge');
    if (!badge) return;
    if (!Api()) {
      badge.classList.add('hidden');
      badge.classList.remove('flex');
      return;
    }
    var loggedIn = currentUser() || (function () {
      try { return localStorage.getItem('isLoggedIn') === 'true'; } catch (e) { return false; }
    })();
    if (!loggedIn) {
      badge.classList.add('hidden');
      badge.classList.remove('flex');
      return;
    }
    try {
      var res = await Api().cartList();
      cartCache = res.items || [];
      var count = cartCache.reduce(function (sum, i) {
        return sum + (Number(i.qty) || 1);
      }, 0);
      badge.textContent = count > 99 ? '99+' : String(count);
      badge.classList.toggle('hidden', count === 0);
      badge.classList.toggle('flex', count > 0);
    } catch (e) {
      badge.classList.add('hidden');
      badge.classList.remove('flex');
    }
  }

  function cartItemRow(item) {
    var available = item.available !== false;
    var lineTotal = item.lineTotal != null ? item.lineTotal : item.price;
    return (
      '<div class="bg-lightCard dark:bg-darkCard border border-slate-200 dark:border-slate-800 rounded-xl p-3 flex gap-3 items-center">' +
        '<div class="min-w-0 flex-1">' +
          '<p class="font-bold text-sm truncate">' + escapeHtml(item.title) + '</p>' +
          '<p class="text-[11px] text-slate-500 truncate">By ' + escapeHtml(item.sellerName || 'Seller') + ' · Qty ' + (Number(item.qty) || 1) + '</p>' +
          (!available ? '<p class="text-[10px] text-red-500 mt-0.5">No longer available</p>' : '') +
        '</div>' +
        '<div class="text-right shrink-0">' +
          '<p class="font-bold text-brandPrimary text-sm mb-1">' + money(lineTotal) + '</p>' +
          '<button type="button" onclick="window.CommerceUI.removeFromCart(\'' + escapeAttr(item.listingId) + '\')" class="text-[11px] text-slate-400 hover:text-red-500 underline">Remove</button>' +
        '</div>' +
      '</div>'
    );
  }

  function cartDrawerShell(innerHtml) {
    return (
      '<div class="absolute inset-0 bg-black/60" onclick="window.CommerceUI.closeCartDrawer()"></div>' +
      '<div class="absolute right-0 top-0 h-full w-full max-w-sm bg-lightBg dark:bg-darkBg shadow-2xl flex flex-col">' +
        '<div class="flex items-center gap-3 px-4 py-3 bg-lightCard dark:bg-darkCard border-b border-slate-200 dark:border-slate-800 shrink-0">' +
          '<button type="button" onclick="window.CommerceUI.closeCartDrawer()" class="w-9 h-9 rounded-full border border-slate-300 dark:border-slate-600 flex items-center justify-center" aria-label="Close cart"><i class="fa-solid fa-arrow-left text-sm"></i></button>' +
          '<h2 class="font-bold text-base flex-1">Your Cart</h2>' +
          '<button type="button" onclick="window.CommerceUI.clearCart()" class="text-[11px] text-red-500 font-semibold">Clear</button>' +
        '</div>' +
        '<div class="flex-1 overflow-y-auto px-4 py-4 space-y-3" id="cartDrawerItems">' + innerHtml + '</div>' +
        '<div class="p-4 bg-lightCard dark:bg-darkCard border-t border-slate-200 dark:border-slate-800 shrink-0" id="cartDrawerFooter"></div>' +
      '</div>'
    );
  }

  function renderCartDrawer() {
    var wrap = document.getElementById('cartDrawer');
    if (!wrap) return;
    var items = cartCache || [];
    var total = items.reduce(function (sum, i) {
      return sum + (Number(i.lineTotal != null ? i.lineTotal : i.price) || 0);
    }, 0);
    var buyable = items.some(function (i) {
      return i.available !== false;
    });
    var body = items.length
      ? items.map(cartItemRow).join('')
      : '<div class="text-center py-16 text-sm text-slate-400"><i class="fa-solid fa-cart-shopping text-3xl mb-3 block"></i>Your cart is empty.</div>';
    wrap.innerHTML = cartDrawerShell(body);
    var footer = document.getElementById('cartDrawerFooter');
    if (footer) {
      footer.innerHTML =
        '<div class="flex justify-between text-sm mb-3"><span class="text-slate-500">Total</span><span class="font-extrabold text-brandPrimary">' + money(total) + '</span></div>' +
        '<button type="button" onclick="window.CommerceUI.checkoutCart()" ' + (!buyable ? 'disabled' : '') + ' class="w-full bg-brandPrimary hover:bg-brandHover text-white font-bold py-3 rounded-xl shadow-md disabled:opacity-40 disabled:cursor-not-allowed">Checkout all</button>';
    }
  }

  async function openCartDrawer() {
    var u = requireLogin('Sign in to view your cart.');
    if (!u) return;
    var wrap = document.getElementById('cartDrawer');
    if (!wrap) return;
    wrap.classList.remove('hidden');
    wrap.innerHTML = cartDrawerShell('<p class="text-center text-xs text-slate-400 py-10">Loading cart…</p>');
    try {
      var res = await Api().cartList();
      cartCache = res.items || [];
    } catch (e) {
      cartCache = [];
    }
    renderCartDrawer();
  }

  function closeCartDrawer() {
    var wrap = document.getElementById('cartDrawer');
    if (wrap) wrap.classList.add('hidden');
  }

  async function addToCart(listingId) {
    var u = requireLogin('Sign in to add items to your cart.');
    if (!u) return;
    try {
      var res = await Api().cartAdd({ listingId: listingId });
      cartCache = res.items || cartCache;
      toast('Added to cart', { type: 'success' });
      await refreshCartBadge();
    } catch (e) {
      toast(e.message || 'Could not add to cart', { type: 'error' });
    }
  }

  async function removeFromCart(listingId) {
    try {
      var res = await Api().cartRemove({ listingId: listingId });
      cartCache = res.items || [];
      renderCartDrawer();
      await refreshCartBadge();
    } catch (e) {
      toast(e.message || 'Could not remove item', { type: 'error' });
    }
  }

  async function clearCart() {
    if (!cartCache.length) return;
    var ok = global.AcctSuiteConfirm
      ? await global.AcctSuiteConfirm({
          title: 'Clear cart',
          message: 'Remove all items from your cart?',
          okText: 'Remove all',
          icon: 'fa-cart-shopping',
        })
      : global.confirm('Remove all items from your cart?');
    if (!ok) return;
    try {
      await Api().cartClear();
      cartCache = [];
      renderCartDrawer();
      await refreshCartBadge();
    } catch (e) {
      toast(e.message || 'Could not clear cart', { type: 'error' });
    }
  }

  async function checkoutCart() {
    if (!Api()) return;
    try {
      var res = await Api().cartCheckout();
      closeCartDrawer();
      await refreshCartBadge();
      if (global.AcctSuiteApiSync) await global.AcctSuiteApiSync.hydrateFromApi();
      if (global.AcctSuiteUI) global.AcctSuiteUI.refreshAll();
      var bought = (res.orders || []).length;
      if (bought) {
        toast(bought + ' item' + (bought === 1 ? '' : 's') + ' purchased successfully.', { type: 'success' });
        if (typeof global.switchTab === 'function') global.switchTab('purchase');
      } else {
        toast('Nothing in your cart could be purchased right now.', { type: 'warn' });
      }
    } catch (e) {
      if (e && e.code === 'insufficient_funds') {
        showInsufficientFundsModal();
        return;
      }
      toast(e.message || 'Checkout failed', { type: 'error' });
    }
  }

  // ---------------------------------------------------------------------
  // Wishlist
  // ---------------------------------------------------------------------
  async function addToWishlist(listingId) {
    var u = requireLogin('Sign in to save items to your wishlist.');
    if (!u) return;
    try {
      await Api().wishlistAdd({ listingId: listingId });
      toast('Saved to wishlist', { type: 'success' });
    } catch (e) {
      toast(e.message || 'Could not save item', { type: 'error' });
    }
  }

  // ---------------------------------------------------------------------
  // Share
  // ---------------------------------------------------------------------
  function shareListing(id, slug) {
    var key = slug || id;
    var url = global.location.origin + '/listing/' + encodeURIComponent(key);
    if (global.navigator && global.navigator.clipboard && global.navigator.clipboard.writeText) {
      global.navigator.clipboard
        .writeText(url)
        .then(function () {
          toast('Link copied to clipboard', { type: 'success' });
        })
        .catch(function () {
          toast(url, { type: 'info' });
        });
    } else {
      toast(url, { type: 'info' });
    }
  }

  // ---------------------------------------------------------------------
  // Social proof (#11)
  // ---------------------------------------------------------------------
  async function loadSocialProof() {
    var el = document.getElementById('socialProofLine');
    if (!el || !Api()) return;
    try {
      var res = await Api().socialProof();
      var sales = Number(res.completedOrders24h) || 0;
      var live = Number(res.activeListings) || 0;
      if (!sales && !live) {
        el.classList.add('hidden');
        return;
      }
      el.classList.remove('hidden');
      el.innerHTML =
        '🔥 <strong>' + sales + '</strong> sale' + (sales === 1 ? '' : 's') + ' in the last 24 hours · <strong>' + live + '</strong> live listing' + (live === 1 ? '' : 's');
    } catch (e) {
      el.classList.add('hidden');
    }
  }

  // ---------------------------------------------------------------------
  // Shuffle-safe market refresh — re-fetch (market.list is ORDER BY RAND()
  // server-side) instead of re-sorting anything client-side.
  // ---------------------------------------------------------------------
  var marketRefreshInFlight = false;
  async function refreshMarketListings() {
    if (marketRefreshInFlight || !global.AcctSuiteApiSync) return;
    marketRefreshInFlight = true;
    try {
      if (usingApi()) {
        await global.AcctSuiteApiSync.hydrateFromApi();
      } else if (global.AcctSuiteApiSync.hydratePublicMarket) {
        await global.AcctSuiteApiSync.hydratePublicMarket();
      }
      if (global.AcctSuiteUI) global.AcctSuiteUI.refreshAll();
    } catch (e) {
      // ignore — keep whatever was already rendered
    } finally {
      marketRefreshInFlight = false;
    }
  }

  // ---------------------------------------------------------------------
  // Order status stepper + dispute window
  // ---------------------------------------------------------------------
  var STEP_LABELS = ['Paid', 'Delivered', 'Confirmed', 'Completed'];

  function disputeWindowOpen(order) {
    if (!order || !order.disputeDeadlineAt) return false;
    var ts = new Date(order.disputeDeadlineAt).getTime();
    return !isNaN(ts) && ts > Date.now();
  }

  function orderStepIndex(order) {
    if (order.status === 'disputed') return 3;
    if (order.status === 'completed') return disputeWindowOpen(order) ? 2 : 3;
    if (order.orderStatusStep === 'delivered') return 1;
    return 0;
  }

  function fmtCountdown(ms) {
    if (ms <= 0) return '0m';
    var mins = Math.floor(ms / 60000);
    var h = Math.floor(mins / 60);
    var m = mins % 60;
    return h > 0 ? h + 'h ' + m + 'm' : m + 'm';
  }

  /** Returns an HTML snippet (stepper + dispute countdown/CTA) to inject into the order detail modal. */
  function orderStatusExtrasHtml(order) {
    if (!order || order.status === 'cancelled') return '';
    var disputed = order.status === 'disputed';
    var idx = orderStepIndex(order);
    var steps = STEP_LABELS.map(function (label, i) {
      var state = 'pending';
      if (disputed && i === 3) state = 'disputed';
      else if (i <= idx) state = 'done';
      var dotClass =
        state === 'done'
          ? 'bg-brandPrimary text-white'
          : state === 'disputed'
            ? 'bg-red-500 text-white'
            : 'bg-slate-200 dark:bg-slate-700 text-slate-400';
      var labelText = state === 'disputed' ? 'Disputed' : label;
      return (
        '<div class="flex-1 flex flex-col items-center gap-1">' +
          '<span class="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ' + dotClass + '">' + (i + 1) + '</span>' +
          '<span class="text-[9px] text-center ' + (state === 'disputed' ? 'text-red-500 font-bold' : 'text-slate-500') + '">' + labelText + '</span>' +
        '</div>'
      );
    }).join('<div class="flex-1 h-px bg-slate-200 dark:bg-slate-700 mt-3 -mx-1"></div>');

    var extra = '';
    var isBuyer = order.role === 'buyer';
    if (disputed) {
      extra =
        '<div class="mt-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 text-red-600 dark:text-red-300 rounded-xl p-3 text-[11px]">' +
          '<i class="fa-solid fa-triangle-exclamation mr-1"></i> This order is under dispute review by our team.' +
        '</div>';
    } else if (order.disputeDeadlineAt) {
      var ts = new Date(order.disputeDeadlineAt).getTime();
      var remaining = ts - Date.now();
      if (remaining > 0) {
        extra =
          '<div class="mt-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 text-amber-700 dark:text-amber-300 rounded-xl p-3 text-[11px] flex items-center justify-between gap-2 flex-wrap">' +
            '<span><i class="fa-regular fa-clock mr-1"></i> Dispute window closes in <strong>' + fmtCountdown(remaining) + '</strong></span>' +
            (isBuyer ? '<button type="button" onclick="window.CommerceUI.openDisputeModal(\'' + escapeAttr(order.id) + '\')" class="shrink-0 bg-red-500 text-white text-[11px] font-bold px-3 py-1.5 rounded-lg">Open dispute</button>' : '') +
          '</div>';
      } else {
        extra = '<div class="mt-3 text-[11px] text-slate-400"><i class="fa-regular fa-circle-check mr-1"></i> Dispute window expired.</div>';
      }
    }
    return '<div class="mb-4"><div class="flex items-stretch">' + steps + '</div>' + extra + '</div>';
  }

  function disputeBadgeHtml(order) {
    if (!order || order.status !== 'disputed') return '';
    return '<span class="text-[9px] font-bold uppercase bg-red-500/15 text-red-500 px-1.5 py-0.5 rounded-full ml-1.5 align-middle">Disputed</span>';
  }

  // ---------------------------------------------------------------------
  // Dispute modal
  // ---------------------------------------------------------------------
  var disputeOrderId = null;

  function openDisputeModal(orderId) {
    disputeOrderId = orderId;
    var wrap = document.getElementById('disputeModal');
    if (!wrap) return;
    wrap.innerHTML =
      '<div class="absolute inset-0 bg-black/60" onclick="window.CommerceUI.closeDisputeModal()"></div>' +
      '<div class="absolute inset-0 flex items-center justify-center p-4">' +
        '<div class="bg-lightCard dark:bg-darkCard w-full max-w-sm rounded-2xl p-5 max-h-[90vh] overflow-y-auto relative shadow-2xl">' +
          '<h3 class="font-bold text-lg mb-1">Open a dispute</h3>' +
          '<p class="text-xs text-slate-500 mb-3">Tell us what went wrong with this order. Our team reviews every dispute before releasing or denying a refund.</p>' +
          '<textarea id="disputeReasonInput" rows="4" placeholder="Describe the issue with this order…" class="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 text-sm"></textarea>' +
          '<div class="grid grid-cols-2 gap-2 mt-4">' +
            '<button type="button" onclick="window.CommerceUI.closeDisputeModal()" class="border border-slate-300 dark:border-slate-600 py-2.5 rounded-xl text-sm font-bold">Cancel</button>' +
            '<button type="button" onclick="window.CommerceUI.submitDispute()" class="bg-red-500 text-white py-2.5 rounded-xl text-sm font-bold">Submit</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    wrap.classList.remove('hidden');
  }

  function closeDisputeModal() {
    var wrap = document.getElementById('disputeModal');
    if (wrap) wrap.classList.add('hidden');
    disputeOrderId = null;
  }

  async function submitDispute() {
    var input = document.getElementById('disputeReasonInput');
    var reason = ((input && input.value) || '').trim();
    if (!reason) {
      toast('Please describe the issue first.', { type: 'warn' });
      return;
    }
    if (!disputeOrderId || !Api()) return;
    try {
      await Api().openDispute({ orderId: disputeOrderId, reason: reason });
      toast('Dispute opened. Our team will review it shortly.', { type: 'success' });
      var orderId = disputeOrderId;
      closeDisputeModal();
      if (global.AcctSuiteApiSync) await global.AcctSuiteApiSync.hydrateFromApi();
      if (global.AcctSuiteUI) global.AcctSuiteUI.refreshAll();
      refreshDisputesBanner();
      if (typeof global.openOrderDetail === 'function') global.openOrderDetail(String(orderId));
    } catch (e) {
      toast(e.message || 'Could not open dispute', { type: 'error' });
    }
  }

  // ---------------------------------------------------------------------
  // Orders tab — open-disputes banner
  // ---------------------------------------------------------------------
  async function refreshDisputesBanner() {
    var el = document.getElementById('disputesBanner');
    if (!el) return;
    if (!Api() || !currentUser() || !usingApi()) {
      el.classList.add('hidden');
      el.innerHTML = '';
      return;
    }
    try {
      var res = await Api().myDisputes();
      var open = (res.disputes || []).filter(function (d) {
        return d.status === 'open' || d.status === 'under_review';
      });
      if (!open.length) {
        el.classList.add('hidden');
        el.innerHTML = '';
        return;
      }
      el.classList.remove('hidden');
      el.innerHTML =
        '<div class="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 text-red-600 dark:text-red-300 rounded-xl p-3 text-xs flex items-center justify-between gap-2">' +
          '<span><i class="fa-solid fa-triangle-exclamation mr-1"></i> You have ' + open.length + ' open dispute' + (open.length === 1 ? '' : 's') + '.</span>' +
          '<button type="button" onclick="window.CommerceUI.openFirstDispute()" class="shrink-0 font-bold underline">View</button>' +
        '</div>';
      el.dataset.firstOrderId = String(open[0].orderId);
    } catch (e) {
      el.classList.add('hidden');
    }
  }

  function openFirstDispute() {
    var el = document.getElementById('disputesBanner');
    var orderId = el && el.dataset.firstOrderId;
    if (orderId && typeof global.openOrderDetail === 'function') global.openOrderDetail(orderId);
  }

  // ---------------------------------------------------------------------
  // Listing detail extra action buttons (cart / wishlist / share)
  // ---------------------------------------------------------------------
  function listingActionButtonsHtml(item) {
    var id = escapeAttr(item.id);
    var slug = escapeAttr(item.publicSlug || '');
    return (
      '<div class="grid grid-cols-3 gap-2 mb-3">' +
        '<button type="button" onclick="window.CommerceUI.addToCart(\'' + id + '\')" class="border border-brandPrimary text-brandPrimary text-[11px] font-bold py-2.5 rounded-xl flex items-center justify-center gap-1"><i class="fa-solid fa-cart-plus"></i> Cart</button>' +
        '<button type="button" onclick="window.CommerceUI.addToWishlist(\'' + id + '\')" class="border border-slate-300 dark:border-slate-600 text-[11px] font-bold py-2.5 rounded-xl flex items-center justify-center gap-1"><i class="fa-regular fa-heart"></i> Save</button>' +
        '<button type="button" onclick="window.CommerceUI.shareListing(\'' + id + '\',\'' + slug + '\')" class="border border-slate-300 dark:border-slate-600 text-[11px] font-bold py-2.5 rounded-xl flex items-center justify-center gap-1"><i class="fa-solid fa-share-nodes"></i> Share</button>' +
      '</div>'
    );
  }

  // ---------------------------------------------------------------------
  // Chat rules banner
  // ---------------------------------------------------------------------
  function showChatRulesBanner(show) {
    var el = document.getElementById('chatRulesBanner');
    if (!el) return;
    el.classList.toggle('hidden', !show);
  }

  function handleBlockedChatMessage(reason) {
    if (global.AcctSuiteToast && typeof global.AcctSuiteToast.error === 'function') {
      global.AcctSuiteToast.error(reason || 'That message was blocked. Please keep all communication on AcctSuite.');
    } else {
      global.alert(reason || 'That message was blocked. Please keep all communication on AcctSuite.');
    }
  }

  // ---------------------------------------------------------------------
  // Wire up: cart badge / social proof / disputes banner on load, plus a
  // light monkey-patch of switchTab so home/market "refresh" simply
  // re-fetches (never re-sorts) and orders/home stay in sync.
  // ---------------------------------------------------------------------
  function wrapSwitchTab() {
    if (typeof global.switchTab !== 'function' || global.switchTab.__commercePatched) return;
    var orig = global.switchTab;
    var wrapped = function (tabId) {
      orig(tabId);
      if (tabId === 'home' || tabId === 'market') {
        refreshMarketListings();
      }
      if (tabId === 'home') {
        loadSocialProof();
      }
      if (tabId === 'orders' || tabId === 'purchase') {
        refreshDisputesBanner();
        // Re-pull purchase/sales so credentials appear after buy / email deep-link
        (async function () {
          try {
            if (global.AcctSuiteApiSync && typeof global.AcctSuiteApiSync.refreshOrdersFromApi === 'function') {
              await global.AcctSuiteApiSync.refreshOrdersFromApi();
            } else if (global.AcctSuite && typeof global.AcctSuite.refreshOrdersFromApi === 'function') {
              await global.AcctSuite.refreshOrdersFromApi();
            } else if (global.AcctSuiteApiSync && global.AcctSuiteApiSync.hydrateFromApi) {
              await global.AcctSuiteApiSync.hydrateFromApi();
            }
            if (global.AcctSuiteUI && typeof global.AcctSuiteUI.refreshAll === 'function') {
              global.AcctSuiteUI.refreshAll();
            }
          } catch (e) {}
        })();
      }
      if (tabId === 'ads') {
        (async function () {
          try {
            if (global.AcctSuiteApiSync && typeof global.AcctSuiteApiSync.refreshAdsFromApi === 'function') {
              await global.AcctSuiteApiSync.refreshAdsFromApi();
            } else if (global.AcctSuiteApiSync && global.AcctSuiteApiSync.hydrateFromApi) {
              await global.AcctSuiteApiSync.hydrateFromApi();
            }
            if (global.AcctSuiteUI && typeof global.AcctSuiteUI.onAdsUpdated === 'function') {
              global.AcctSuiteUI.onAdsUpdated();
            } else if (global.AcctSuiteUI && typeof global.AcctSuiteUI.refreshAll === 'function') {
              global.AcctSuiteUI.refreshAll();
            }
          } catch (e) {}
        })();
      }
      refreshCartBadge();
    };
    wrapped.__commercePatched = true;
    global.switchTab = wrapped;
  }

  document.addEventListener('DOMContentLoaded', function () {
    wrapSwitchTab();
    refreshCartBadge();
    loadSocialProof();
    refreshDisputesBanner();
    var cartBtn = document.getElementById('headerCartBtn');
    if (cartBtn && !cartBtn.__cartBound) {
      cartBtn.__cartBound = true;
      cartBtn.addEventListener('click', function (ev) {
        ev.preventDefault();
        openCartDrawer();
      });
    }
  });

  global.openCartDrawer = openCartDrawer;
  global.closeCartDrawer = closeCartDrawer;

  global.CommerceUI = {
    // cart
    openCartDrawer: openCartDrawer,
    closeCartDrawer: closeCartDrawer,
    addToCart: addToCart,
    removeFromCart: removeFromCart,
    clearCart: clearCart,
    checkoutCart: checkoutCart,
    refreshCartBadge: refreshCartBadge,
    // wishlist / share
    addToWishlist: addToWishlist,
    shareListing: shareListing,
    // wallet
    showInsufficientFundsModal: showInsufficientFundsModal,
    closeAndGoWallet: closeAndGoWallet,
    confirmPlanCheckout: confirmPlanCheckout,
    // discovery
    loadSocialProof: loadSocialProof,
    refreshMarketListings: refreshMarketListings,
    // orders / disputes
    orderStatusExtrasHtml: orderStatusExtrasHtml,
    disputeBadgeHtml: disputeBadgeHtml,
    openDisputeModal: openDisputeModal,
    closeDisputeModal: closeDisputeModal,
    submitDispute: submitDispute,
    refreshDisputesBanner: refreshDisputesBanner,
    openFirstDispute: openFirstDispute,
    // listing detail
    listingActionButtonsHtml: listingActionButtonsHtml,
    // chat safety
    showChatRulesBanner: showChatRulesBanner,
    handleBlockedChatMessage: handleBlockedChatMessage,
  };
})(window);

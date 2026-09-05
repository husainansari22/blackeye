/**
 * Standalone AcctBazaar-style listing detail modal for seller store, listing page, etc.
 * Opens over the current page — no redirect to dashboard home.
 */
(function (global) {
  var selectedAccount = {};
  var currentItem = null;

  function escHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  function escAttr(s) {
    return escHtml(s).replace(/'/g, '&#39;');
  }
  function money(n) {
    var v = Number(n) || 0;
    return (v < 0 ? '-$' + Math.abs(v).toFixed(2) : '$' + v.toFixed(2));
  }
  function formatTimeAgo(iso) {
    if (!iso) return 'recently';
    var t = new Date(iso).getTime();
    if (!t || isNaN(t)) return 'recently';
    var sec = Math.max(0, Math.floor((Date.now() - t) / 1000));
    if (sec < 60) return 'just now';
    var min = Math.floor(sec / 60);
    if (min < 60) return min + 'm ago';
    var hr = Math.floor(min / 60);
    if (hr < 48) return hr + 'h ago';
    var day = Math.floor(hr / 24);
    if (day < 14) return day + 'd ago';
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }
  function formatSalesLabel(n) {
    var v = Number(n) || 0;
    if (v >= 1000) {
      var k = v / 1000;
      var s = k >= 10 ? Math.round(k) + 'k' : k.toFixed(1).replace(/\.0$/, '') + 'k';
      return s + '+ Sales';
    }
    return v + ' Sales';
  }
  function verifyBadge() {
    return '<span class="av-verify-badge" title="Verified" aria-label="Verified" style="width:1rem;height:1rem;min-width:1rem"><img src="/img/brand/verified.svg" alt="" decoding="async"></span>';
  }
  function nameWithVerify(name, verified) {
    return escHtml(name || '') + (verified ? verifyBadge() : '');
  }
  function starsRow(rating, reviewCount) {
    var r = Math.max(0, Math.min(5, Number(rating) || 0));
    var full = Math.floor(r);
    var half = r - full >= 0.35 ? 1 : 0;
    var icons = '';
    for (var i = 0; i < 5; i++) {
      if (i < full) icons += '<i class="fa-solid fa-star"></i>';
      else if (i === full && half) icons += '<i class="fa-solid fa-star-half-stroke"></i>';
      else icons += '<i class="fa-regular fa-star text-slate-300 dark:text-slate-600"></i>';
    }
    var count = Number(reviewCount) || 0;
    return '<span class="av-listing-stars">' + icons + (count ? '<em>(' + count + ')</em>' : '') + '</span>';
  }
  function productLogo(item) {
    var Cat = global.AcctSuiteCatalog;
    if (!Cat) return '';
    var hit = Cat.findProduct(item.category || item.platform || item.title || '');
    if (typeof Cat.logoMarkHtml === 'function') {
      return Cat.logoMarkHtml(hit || { name: item.category || item.title || '?', domain: '' }, 'av-listing-detail__logo av-market-logo');
    }
    var src = hit ? hit.logo : Cat.logoUrl({ name: item.category || '?', domain: '' });
    return '<img src="' + escAttr(src) + '" alt="" class="av-listing-detail__logo av-market-logo" loading="lazy" onerror="this.style.opacity=.35">';
  }
  function mapListing(row) {
    var name = row.sellerName || 'Seller';
    var parts = String(name).trim().split(/\s+/).filter(Boolean);
    var initials = !parts.length ? '?' : parts.length === 1 ? parts[0].slice(0, 2).toUpperCase() : (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return {
      id: String(row.id),
      title: row.title,
      description: row.description || '',
      category: row.category || '',
      price: Number(row.price) || 0,
      previewLink: row.previewLink || row.preview_link || '',
      releaseType: row.releaseType || row.release_type || 'auto',
      sellerId: row.sellerId != null ? String(row.sellerId) : '',
      sellerName: name,
      sellerEmail: row.sellerEmail || '',
      sellerMerchantSlug: row.sellerMerchantSlug || row.seller_merchant_slug || '',
      sellerVerified: !!(row.sellerVerified || row.seller_verified),
      sellerRating: Number(row.sellerRating) || 0,
      sellerReviews: Number(row.sellerReviews) || 0,
      sellerCompletedSales: Number(row.sellerCompletedSales) || 0,
      sellerAvatar: row.sellerAvatar || row.seller_avatar || row.avatarUrl || '',
      sellerInitials: initials,
      stock: row.stock != null ? Number(row.stock) : 1,
      createdAt: row.created_at || row.createdAt || '',
    };
  }

  function ensureModal() {
    var m = document.getElementById('avListingModal');
    if (m) return m;
    var wrap = document.createElement('div');
    wrap.id = 'avListingModal';
    wrap.className = 'fixed inset-0 bg-black/60 z-[130] hidden items-center justify-center p-4 av-listing-modal';
    wrap.innerHTML =
      '<div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 w-full max-w-sm rounded-2xl p-6 relative shadow-2xl max-h-[90vh] overflow-y-auto modal-scroll">' +
        '<button type="button" id="avListingModalClose" class="absolute top-4 left-4 z-10 w-9 h-9 rounded-full border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 flex items-center justify-center text-slate-800 dark:text-white hover:border-brandPrimary hover:text-brandPrimary transition" aria-label="Close">' +
          '<i class="fa-solid fa-arrow-left text-sm"></i>' +
        '</button>' +
        '<div id="avListingModalBody" class="pt-8"></div>' +
      '</div>';
    document.body.appendChild(wrap);
    wrap.addEventListener('click', function (ev) {
      if (ev.target === wrap) close();
    });
    document.getElementById('avListingModalClose').addEventListener('click', close);
    return wrap;
  }

  function bodyEl() {
    return document.getElementById('avListingModalBody');
  }

  function buildHtml(item, opts) {
    opts = opts || {};
    var onSellerStore = !!opts.onSellerStore;
    var walletBal = walletDisplayLabel(opts.walletBalance, opts.loggedIn);
    var logo = productLogo(item);
    var stock = Math.max(1, Number(item.stock) || 1);
    var sel = selectedAccount[item.id] != null ? selectedAccount[item.id] : 0;
    selectedAccount[item.id] = sel;
    var desc = String(item.description || 'No description provided.');
    var descLong = desc.length > 160;
    var salesLabel = formatSalesLabel(item.sellerCompletedSales);
    var added = formatTimeAgo(item.createdAt);
    var isAuto = item.releaseType !== 'manual';
    var storeKey = escAttr(item.sellerMerchantSlug || item.sellerId || item.sellerEmail || '');

    var accountRows = [];
    for (var i = 0; i < stock; i++) {
      var selected = sel === i;
      var previewAttr = item.previewLink ? escAttr(item.previewLink) : '';
      accountRows.push(
        '<div class="av-listing-account-row' + (selected ? ' is-selected' : '') + '" data-select-account="' + escAttr(item.id) + '" data-account-idx="' + i + '">' +
          '<div class="av-listing-account-row__check">' + (selected ? '<i class="fa-solid fa-check"></i>' : '') + '</div>' +
          '<span class="av-listing-account-row__label">Account ' + (i + 1) + '</span>' +
          '<span class="av-listing-account-row__price">' + money(item.price) + '</span>' +
          '<button type="button" class="av-listing-eye" title="Preview link" data-preview-link="' + previewAttr + '"' + (item.previewLink ? '' : ' disabled style="opacity:.35;cursor:not-allowed"') + '><i class="fa-solid fa-eye"></i></button>' +
          '<button type="button" class="av-listing-cart-btn" data-add-cart="' + escAttr(item.id) + '">Add to cart</button>' +
        '</div>'
      );
    }

    var sellerLinkBtn = onSellerStore
      ? '<button type="button" class="av-listing-seller__link" data-close-modal="1">On this store</button>'
      : '<a class="av-listing-seller__link" href="/seller/' + encodeURIComponent(storeKey) + '">View store →</a>';

    return (
      '<div class="av-listing-detail" data-listing-id="' + escAttr(item.id) + '">' +
        '<div class="av-listing-detail__head">' +
          logo +
          '<div class="min-w-0 flex-1">' +
            '<div class="av-listing-detail__title-row">' +
              '<h3 class="av-listing-detail__title">' + escHtml(item.title) + '</h3>' +
              '<span class="av-listing-detail__price">' + money(item.price) + '</span>' +
            '</div>' +
            '<div class="av-listing-detail__meta">' +
              (item.sellerRating ? starsRow(item.sellerRating, item.sellerReviews) : '') +
              (item.sellerVerified ? verifyBadge() : '') +
              '<span>● ' + stock + ' available, added ' + escHtml(added) + '</span>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="av-listing-badge' + (isAuto ? '' : ' av-listing-badge--manual') + '">' +
          (isAuto ? '<i class="fa-solid fa-bolt"></i> Instant Delivery' : '<i class="fa-solid fa-clock"></i> Manual delivery') +
        '</div>' +
        '<div class="av-listing-seller">' +
          '<div class="av-listing-seller__avatar">' +
            (item.sellerAvatar
              ? '<img src="' + escAttr(item.sellerAvatar) + '" alt="" class="av-listing-seller__avatar-img" loading="lazy" onerror="this.remove()">'
              : escHtml(item.sellerInitials || 'S')) +
          '</div>' +
          '<div class="av-listing-seller__body">' +
            '<p class="av-listing-seller__name inline-flex items-center gap-0.5 flex-wrap">' + nameWithVerify(item.sellerName || 'Seller', item.sellerVerified) + '</p>' +
            '<p class="av-listing-seller__stats">' + escHtml(salesLabel) + '</p>' +
          '</div>' +
          sellerLinkBtn +
        '</div>' +
        '<div class="av-listing-desc">' +
          '<p id="avListingDescText" class="av-listing-desc__text' + (descLong ? ' is-clamped' : '') + '">' + escHtml(desc) + '</p>' +
          (descLong ? '<button type="button" id="avListingDescToggle" class="av-listing-desc__more">Show more &gt;</button>' : '') +
        '</div>' +
        '<div class="av-listing-accounts">' +
          '<div class="av-listing-accounts__head"><h4>Select account</h4><span class="av-listing-accounts__count">(' + (sel + 1) + ' of ' + stock + ' selected)</span></div>' +
          accountRows.join('') +
        '</div>' +
        '<div class="av-listing-checkout">' +
          '<div class="av-listing-checkout__row">' +
            '<div><p class="av-listing-checkout__total-label">Total (1 item)</p><p class="av-listing-checkout__total">' + money(item.price) + '</p></div>' +
            '<a class="av-listing-wallet" href="/dashboard.html#wallet">Wallet Balance<strong>' + walletBal + ' →</strong></a>' +
          '</div>' +
          '<button type="button" class="av-listing-pay-btn" data-buy-listing="' + escAttr(item.id) + '">Pay ' + money(item.price) + ' Securely</button>' +
          '<p class="av-listing-protect"><i class="fa-solid fa-shield-halved"></i> Your payment is protected by AcctSuite Buyer Protection.</p>' +
        '</div>' +
      '</div>'
    );
  }

  function render(opts) {
    if (!currentItem) return;
    var el = bodyEl();
    if (!el) return;
    el.innerHTML = buildHtml(currentItem, opts);
    bindBodyEvents(opts);
  }

  function bindBodyEvents(opts) {
    var el = bodyEl();
    if (!el) return;
    var toggle = document.getElementById('avListingDescToggle');
    if (toggle) {
      toggle.addEventListener('click', function () {
        var text = document.getElementById('avListingDescText');
        if (!text) return;
        var clamped = text.classList.toggle('is-clamped');
        toggle.textContent = clamped ? 'Show more >' : 'Show less';
      });
    }
    el.querySelectorAll('[data-select-account]').forEach(function (row) {
      row.addEventListener('click', function (ev) {
        if (ev.target.closest('[data-preview-link],[data-add-cart]')) return;
        selectedAccount[row.getAttribute('data-select-account')] = Number(row.getAttribute('data-account-idx')) || 0;
        render(opts);
      });
    });
    el.querySelectorAll('[data-preview-link]').forEach(function (btn) {
      btn.addEventListener('click', function (ev) {
        ev.stopPropagation();
        var url = btn.getAttribute('data-preview-link') || '';
        if (!url) { alert('No preview link for this listing.'); return; }
        global.open(url, '_blank', 'noopener,noreferrer');
      });
    });
    el.querySelectorAll('[data-add-cart]').forEach(function (btn) {
      btn.addEventListener('click', async function (ev) {
        ev.stopPropagation();
        var id = btn.getAttribute('data-add-cart');
        if (!id) return;
        // Prefer dashboard CommerceUI when present (badge + drawer).
        if (global.CommerceUI && global.CommerceUI.addToCart) {
          global.CommerceUI.addToCart(id);
          return;
        }
        // Seller storefront / standalone modal: add via API and stay on this page.
        var Api = global.AcctSuiteApi;
        if (!isProbablyLoggedIn()) {
          if (confirm('Sign in to add items to your cart?')) {
            global.location.href = '/login?next=' + encodeURIComponent(global.location.pathname + global.location.search);
          }
          return;
        }
        if (!Api || typeof Api.cartAdd !== 'function') {
          alert('Cart unavailable right now. Try again from the marketplace.');
          return;
        }
        try {
          btn.disabled = true;
          await Api.cartAdd({ listingId: Number(id) || id });
          if (global.AcctSuiteToast && global.AcctSuiteToast.success) global.AcctSuiteToast.success('Added to cart');
          else if (global.showToast) global.showToast('Added to cart', 'success');
          else alert('Added to cart');
        } catch (e) {
          var msg = (e && e.message) || 'Could not add to cart';
          if (global.AcctSuiteToast && global.AcctSuiteToast.error) global.AcctSuiteToast.error(msg);
          else if (global.showToast) global.showToast(msg, 'error');
          else alert(msg);
        } finally {
          btn.disabled = false;
        }
      });
    });
    el.querySelectorAll('[data-buy-listing]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        purchase(btn.getAttribute('data-buy-listing'));
      });
    });
    el.querySelectorAll('[data-close-modal]').forEach(function (btn) {
      btn.addEventListener('click', close);
    });
  }

  function readCachedWalletBalance() {
    try {
      if (localStorage.getItem('isLoggedIn') !== 'true') return null;
      var wb = localStorage.getItem('walletBalance');
      if (wb == null || wb === '') return null;
      var n = Number(wb);
      return isNaN(n) ? null : n;
    } catch (e) {
      return null;
    }
  }

  function isProbablyLoggedIn() {
    try {
      if (localStorage.getItem('isLoggedIn') === 'true') return true;
      if (global.AcctSuiteApi && global.AcctSuiteApi.getToken && global.AcctSuiteApi.getToken()) return true;
    } catch (e) {}
    return false;
  }

  async function fetchWalletBalance() {
    var Api = global.AcctSuiteApi;
    if (Api && Api.me) {
      try {
        var me = await Api.me();
        if (me && me.user && me.user.balance != null) {
          try {
            localStorage.setItem('walletBalance', String(me.user.balance));
            localStorage.setItem('isLoggedIn', 'true');
          } catch (e) {}
          return Number(me.user.balance);
        }
      } catch (e) {
        console.warn('wallet balance fetch failed', e);
      }
    }
    var cached = readCachedWalletBalance();
    if (cached != null) return cached;
    if (global.AcctSuite && global.AcctSuite.getCurrentUser) {
      var u = global.AcctSuite.getCurrentUser();
      if (u && u.balance != null) return Number(u.balance);
    }
    return null;
  }

  function walletDisplayLabel(balance, loggedIn) {
    if (balance != null && !isNaN(balance)) return money(balance);
    if (loggedIn) return '—';
    return 'Sign in';
  }

  async function purchase(listingId) {
    var Api = global.AcctSuiteApi;
    var loggedIn = isProbablyLoggedIn();
    if (Api && Api.me) {
      try {
        await Api.me();
        loggedIn = true;
      } catch (e) {
        if (!loggedIn) {
          if (confirm('Sign in to complete your purchase?')) {
            var next = encodeURIComponent(global.location.pathname + global.location.search);
            global.location.href = '/login?next=' + next;
          }
          return;
        }
      }
    } else if (!loggedIn) {
      if (confirm('Sign in to complete your purchase?')) {
        var next2 = encodeURIComponent(global.location.pathname + global.location.search);
        global.location.href = '/login?next=' + next2;
      }
      return;
    }
    if (!Api || !Api.createOrder) {
      alert('Checkout unavailable. Open the dashboard to buy.');
      return;
    }
    try {
      var res = await Api.createOrder({ listingId: Number(listingId) });
      if (Api.applyPurchaseResult) Api.applyPurchaseResult(res);
      if (global.AcctSuiteApiSync && global.AcctSuiteApiSync.hydrateFromApi) {
        try { await global.AcctSuiteApiSync.hydrateFromApi(); } catch (syncErr) {}
      }
      if (global.AcctSuiteUI && global.AcctSuiteUI.refreshAll) {
        try { global.AcctSuiteUI.refreshAll(); } catch (uiErr) {}
      }
      close();
      var orderId = res && (res.orderId || res.id);
      var msg = 'Purchase successful!';
      if (orderId) {
        msg += ' View your order in Purchase.';
        if (confirm(msg + '\n\nOpen Purchase now?')) {
          global.location.href = '/dashboard.html#purchase' + (orderId ? '?txid=' + encodeURIComponent(String(orderId)) : '');
        }
      } else {
        alert(msg);
      }
    } catch (e) {
      var err = e.message || 'Purchase failed';
      if (e.code === 'insufficient_funds' || /balance/i.test(err)) {
        if (confirm(err + '\n\nGo to Wallet to deposit?')) {
          global.location.href = '/dashboard.html#wallet';
        }
      } else {
        alert(err);
      }
    }
  }

  function openModalShell() {
    var m = ensureModal();
    m.classList.remove('hidden');
    m.classList.add('flex');
    document.body.style.overflow = 'hidden';
  }

  function close() {
    var m = document.getElementById('avListingModal');
    if (!m) return;
    m.classList.add('hidden');
    m.classList.remove('flex');
    document.body.style.overflow = '';
  }

  async function open(listingId, opts) {
    opts = opts || {};
    var onSellerStore = opts.onSellerStore != null
      ? opts.onSellerStore
      : /\/seller\//i.test(global.location.pathname);

    openModalShell();
    var el = bodyEl();
    if (el) el.innerHTML = '<p class="text-sm text-slate-500 py-8 text-center">Loading listing…</p>';

    var item = null;
    var Api = global.AcctSuiteApi;
    try {
      if (Api && Api.marketGet) {
        var res = await Api.marketGet({ id: Number(listingId) || listingId });
        if (res && res.ok && res.listing) item = mapListing(res.listing);
      } else {
        var r = await fetch('/api/index.php?action=market.get&id=' + encodeURIComponent(listingId)).then(function (x) { return x.json(); });
        if (r && r.ok && r.listing) item = mapListing(r.listing);
      }
    } catch (e) {
      console.warn('listing modal fetch failed', e);
    }

    if (!item) {
      if (el) el.innerHTML = '<p class="text-sm text-red-500 py-8 text-center">Listing not available.</p>';
      return;
    }

    currentItem = item;
    var loggedIn = isProbablyLoggedIn();
    var walletBal = await fetchWalletBalance();
    render({ onSellerStore: onSellerStore, walletBalance: walletBal, loggedIn: loggedIn || walletBal != null });
  }

  global.AcctSuiteListingModal = {
    open: open,
    close: close,
  };

  /** Buy from a seller storefront without leaving the page. */
  global.openStoreBuy = function (listingId) {
    open(listingId, { onSellerStore: true });
  };
  // Back-compat aliases used by older seller.html handlers
  global.openListingModal = global.openStoreBuy;
  global.openListingDetail = function (listingId) {
    open(listingId, { onSellerStore: /\/seller\//i.test(global.location.pathname) });
  };
})(window);

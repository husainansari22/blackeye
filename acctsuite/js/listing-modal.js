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
    return '<span class="av-verify-badge av-verify-badge--sm" title="Verified" aria-label="Verified"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path fill="#1D9BF0" d="M12.0000 1.0000 L12.2695 1.0233 L12.5358 1.0926 L12.7962 1.2060 L13.0479 1.3600 L13.2888 1.5504 L13.5172 1.7717 L13.7321 2.0176 L13.9332 2.2812 L14.1210 2.5550 L14.2967 2.8312 L14.4624 3.1022 L14.6209 3.3601 L14.7758 3.5974 L14.9317 3.8064 L15.0941 3.9788 L15.2719 4.1008 L15.4840 4.1403 L15.7207 4.1333 L15.9787 4.0957 L16.2561 4.0375 L16.5505 3.9672 L16.8593 3.8927 L17.1789 3.8216 L17.5053 3.7608 L17.8338 3.7166 L18.1597 3.6947 L18.4776 3.6997 L18.7826 3.7354 L19.0695 3.8044 L19.3338 3.9084 L19.5711 4.0478 L19.7782 4.2218 L19.9522 4.4289 L20.0916 4.6662 L20.1956 4.9305 L20.2646 5.2174 L20.3003 5.5224 L20.3053 5.8403 L20.2834 6.1662 L20.2392 6.4947 L20.1784 6.8211 L20.1073 7.1407 L20.0328 7.4495 L19.9625 7.7439 L19.9043 8.0213 L19.8667 8.2793 L19.8597 8.5160 L19.8992 8.7281 L20.0212 8.9059 L20.1936 9.0683 L20.4026 9.2242 L20.6399 9.3791 L20.8978 9.5376 L21.1688 9.7033 L21.4450 9.8790 L21.7188 10.0668 L21.9824 10.2679 L22.2283 10.4828 L22.4496 10.7112 L22.6400 10.9521 L22.7940 11.2038 L22.9074 11.4642 L22.9767 11.7305 L23.0000 12.0000 L22.9767 12.2695 L22.9074 12.5358 L22.7940 12.7962 L22.6400 13.0479 L22.4496 13.2888 L22.2283 13.5172 L21.9824 13.7321 L21.7188 13.9332 L21.4450 14.1210 L21.1688 14.2967 L20.8978 14.4624 L20.6399 14.6209 L20.4026 14.7758 L20.1936 14.9317 L20.0212 15.0941 L19.8992 15.2719 L19.8597 15.4840 L19.8667 15.7207 L19.9043 15.9787 L19.9625 16.2561 L20.0328 16.5505 L20.1073 16.8593 L20.1784 17.1789 L20.2392 17.5053 L20.2834 17.8338 L20.3053 18.1597 L20.3003 18.4776 L20.2646 18.7826 L20.1956 19.0695 L20.0916 19.3338 L19.9522 19.5711 L19.7782 19.7782 L19.5711 19.9522 L19.3338 20.0916 L19.0695 20.1956 L18.7826 20.2646 L18.4776 20.3003 L18.1597 20.3053 L17.8338 20.2834 L17.5053 20.2392 L17.1789 20.1784 L16.8593 20.1073 L16.5505 20.0328 L16.2561 19.9625 L15.9787 19.9043 L15.7207 19.8667 L15.4840 19.8597 L15.2719 19.8992 L15.0941 20.0212 L14.9317 20.1936 L14.7758 20.4026 L14.6209 20.6399 L14.4624 20.8978 L14.2967 21.1688 L14.1210 21.4450 L13.9332 21.7188 L13.7321 21.9824 L13.5172 22.2283 L13.2888 22.4496 L13.0479 22.6400 L12.7962 22.7940 L12.5358 22.9074 L12.2695 22.9767 L12.0000 23.0000 L11.7305 22.9767 L11.4642 22.9074 L11.2038 22.7940 L10.9521 22.6400 L10.7112 22.4496 L10.4828 22.2283 L10.2679 21.9824 L10.0668 21.7188 L9.8790 21.4450 L9.7033 21.1688 L9.5376 20.8978 L9.3791 20.6399 L9.2242 20.4026 L9.0683 20.1936 L8.9059 20.0212 L8.7281 19.8992 L8.5160 19.8597 L8.2793 19.8667 L8.0213 19.9043 L7.7439 19.9625 L7.4495 20.0328 L7.1407 20.1073 L6.8211 20.1784 L6.4947 20.2392 L6.1662 20.2834 L5.8403 20.3053 L5.5224 20.3003 L5.2174 20.2646 L4.9305 20.1956 L4.6662 20.0916 L4.4289 19.9522 L4.2218 19.7782 L4.0478 19.5711 L3.9084 19.3338 L3.8044 19.0695 L3.7354 18.7826 L3.6997 18.4776 L3.6947 18.1597 L3.7166 17.8338 L3.7608 17.5053 L3.8216 17.1789 L3.8927 16.8593 L3.9672 16.5505 L4.0375 16.2561 L4.0957 15.9787 L4.1333 15.7207 L4.1403 15.4840 L4.1008 15.2719 L3.9788 15.0941 L3.8064 14.9317 L3.5974 14.7758 L3.3601 14.6209 L3.1022 14.4624 L2.8312 14.2967 L2.5550 14.1210 L2.2812 13.9332 L2.0176 13.7321 L1.7717 13.5172 L1.5504 13.2888 L1.3600 13.0479 L1.2060 12.7962 L1.0926 12.5358 L1.0233 12.2695 L1.0000 12.0000 L1.0233 11.7305 L1.0926 11.4642 L1.2060 11.2038 L1.3600 10.9521 L1.5504 10.7112 L1.7717 10.4828 L2.0176 10.2679 L2.2812 10.0668 L2.5550 9.8790 L2.8312 9.7033 L3.1022 9.5376 L3.3601 9.3791 L3.5974 9.2242 L3.8064 9.0683 L3.9788 8.9059 L4.1008 8.7281 L4.1403 8.5160 L4.1333 8.2793 L4.0957 8.0213 L4.0375 7.7439 L3.9672 7.4495 L3.8927 7.1407 L3.8216 6.8211 L3.7608 6.4947 L3.7166 6.1662 L3.6947 5.8403 L3.6997 5.5224 L3.7354 5.2174 L3.8044 4.9305 L3.9084 4.6662 L4.0478 4.4289 L4.2218 4.2218 L4.4289 4.0478 L4.6662 3.9084 L4.9305 3.8044 L5.2174 3.7354 L5.5224 3.6997 L5.8403 3.6947 L6.1662 3.7166 L6.4947 3.7608 L6.8211 3.8216 L7.1407 3.8927 L7.4495 3.9672 L7.7439 4.0375 L8.0213 4.0957 L8.2793 4.1333 L8.5160 4.1403 L8.7281 4.1008 L8.9059 3.9788 L9.0683 3.8064 L9.2242 3.5974 L9.3791 3.3601 L9.5376 3.1022 L9.7033 2.8312 L9.8790 2.5550 L10.0668 2.2812 L10.2679 2.0176 L10.4828 1.7717 L10.7112 1.5504 L10.9521 1.3600 L11.2038 1.2060 L11.4642 1.0926 L11.7305 1.0233 L12.0000 1.0000 Z"/><path d="M7.15 12.05 L10.55 15.45 L16.85 8.55" stroke="#fff" stroke-width="2.35" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg></span>';
  }
  function nameWithVerify(name, verified) {
    var label = '<span class="av-verify-name truncate">' + escHtml(name || '') + '</span>';
    if (!verified) return label;
    return '<span class="av-verify-inline">' + label + verifyBadge() + '</span>';
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
    var hit = Cat.findProduct(item.category || item.title || '');
    return Cat.logoUrl(hit || { name: '', domain: '' });
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
        '<button type="button" id="avListingModalClose" class="absolute top-4 left-4 z-10 w-9 h-9 rounded-full border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 flex items-center justify-center text-slate-800 dark:text-white hover:border-sky-500 hover:text-sky-500 transition" aria-label="Close">' +
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

    var Cat = global.AcctSuiteCatalog;
    var title = item.title || '';
    var hit = Cat && Cat.findProduct ? Cat.findProduct(item.category || title || '') : null;
    var logoMark = (Cat && Cat.logoMarkHtml)
      ? Cat.logoMarkHtml(hit || { name: title, domain: '' }, 'av-listing-detail__logo')
      : ('<img src="' + escAttr(logo) + '" alt="" class="av-listing-detail__logo" loading="lazy" onerror="this.style.opacity=.35">');

    return (
      '<div class="av-listing-detail" data-listing-id="' + escAttr(item.id) + '">' +
        '<div class="av-listing-detail__head">' +
          logoMark +
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
            '<p class="av-listing-seller__name">' + nameWithVerify(item.sellerName || 'Seller', item.sellerVerified) + '</p>' +
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
      btn.addEventListener('click', function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        var id = btn.getAttribute('data-add-cart');
        addListingToCart(id, btn);
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

  function withTimeout(promise, ms, label) {
    return new Promise(function (resolve, reject) {
      var done = false;
      var timer = setTimeout(function () {
        if (done) return;
        done = true;
        reject(new Error((label || 'request') + ' timeout'));
      }, ms);
      Promise.resolve(promise).then(
        function (v) {
          if (done) return;
          done = true;
          clearTimeout(timer);
          resolve(v);
        },
        function (err) {
          if (done) return;
          done = true;
          clearTimeout(timer);
          reject(err);
        }
      );
    });
  }

  async function fetchWalletBalance() {
    var Api = global.AcctSuiteApi;
    if (Api && Api.me) {
      try {
        // Never block the listing modal on a slow/hung auth.me
        var me = await withTimeout(Api.me(), 4000, 'auth.me');
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

  async function addListingToCart(listingId, btn) {
    if (!listingId) return;
    if (global.CommerceUI && global.CommerceUI.addToCart) {
      global.CommerceUI.addToCart(listingId);
      return;
    }
    var Api = global.AcctSuiteApi;
    if (!isProbablyLoggedIn()) {
      if (confirm('Sign in to add items to your cart?')) {
        var next = encodeURIComponent(global.location.pathname + global.location.search + global.location.hash);
        global.location.href = '/login?next=' + next;
      }
      return;
    }
    if (!Api || !Api.cartAdd) {
      alert('Cart is unavailable right now. Please try again.');
      return;
    }
    var original = btn ? btn.textContent : '';
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Adding…';
    }
    try {
      await Api.cartAdd({ listingId: Number(listingId) || listingId });
      if (btn) btn.textContent = 'Added ✓';
      setTimeout(function () {
        if (btn) {
          btn.textContent = original || 'Add to cart';
          btn.disabled = false;
        }
      }, 1200);
    } catch (e) {
      var msg = (e && e.message) || 'Could not add to cart';
      if (/login|auth|sign in/i.test(msg)) {
        if (confirm('Sign in to add items to your cart?')) {
          var next2 = encodeURIComponent(global.location.pathname + global.location.search + global.location.hash);
          global.location.href = '/login?next=' + next2;
        }
      } else {
        alert(msg);
      }
      if (btn) {
        btn.textContent = original || 'Add to cart';
        btn.disabled = false;
      }
    }
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
    var listingIdOpen = String(item.id);
    // Show listing immediately — do not wait on wallet/auth (that was sticking on "Loading listing…")
    render({
      onSellerStore: onSellerStore,
      walletBalance: readCachedWalletBalance(),
      loggedIn: loggedIn,
    });
    fetchWalletBalance()
      .then(function (walletBal) {
        if (!currentItem || String(currentItem.id) !== listingIdOpen) return;
        render({
          onSellerStore: onSellerStore,
          walletBalance: walletBal,
          loggedIn: loggedIn || walletBal != null,
        });
      })
      .catch(function () {});
  }

  global.AcctSuiteListingModal = {
    open: open,
    close: close,
  };

  global.openStoreBuy = function (listingId) {
    open(listingId, { onSellerStore: true });
  };
})(window);

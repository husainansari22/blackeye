/**
 * Dashboard UI bindings for AcctSuite (uses window.AcctSuite).
 */
(function () {
  const A = () => window.AcctSuite;
  let currentUser = null;
  let sellDraft = {};
  let sellStep = 1;
  let adsFilter = 'all';
  let adsSearch = '';
  let ordersFilter = 'all';
  let purchaseFilter = 'all';
  let ordersSearch = '';
  let purchaseSearch = '';
  let activeOrderId = null;

  function money(n) {
    return A().formatMoney(n);
  }

  /** Instagram/Telegram scalloped verified badge — scales with name text (em). */
  function verifyBadgeHtml(size) {
    // sm: market/meta lines (tiny type) — slightly larger than 1em so scallops stay clear
    // lg: profile/hero headings — slightly under 1em so it sits like Telegram next to big names
    const sizeClass = size === 'lg' ? ' av-verify-badge--lg' : size === 'sm' ? ' av-verify-badge--sm' : '';
    return `<span class="av-verify-badge${sizeClass}" title="Verified" aria-label="Verified"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path fill="#1D9BF0" d="M12.0000 1.0000 L12.2695 1.0233 L12.5358 1.0926 L12.7962 1.2060 L13.0479 1.3600 L13.2888 1.5504 L13.5172 1.7717 L13.7321 2.0176 L13.9332 2.2812 L14.1210 2.5550 L14.2967 2.8312 L14.4624 3.1022 L14.6209 3.3601 L14.7758 3.5974 L14.9317 3.8064 L15.0941 3.9788 L15.2719 4.1008 L15.4840 4.1403 L15.7207 4.1333 L15.9787 4.0957 L16.2561 4.0375 L16.5505 3.9672 L16.8593 3.8927 L17.1789 3.8216 L17.5053 3.7608 L17.8338 3.7166 L18.1597 3.6947 L18.4776 3.6997 L18.7826 3.7354 L19.0695 3.8044 L19.3338 3.9084 L19.5711 4.0478 L19.7782 4.2218 L19.9522 4.4289 L20.0916 4.6662 L20.1956 4.9305 L20.2646 5.2174 L20.3003 5.5224 L20.3053 5.8403 L20.2834 6.1662 L20.2392 6.4947 L20.1784 6.8211 L20.1073 7.1407 L20.0328 7.4495 L19.9625 7.7439 L19.9043 8.0213 L19.8667 8.2793 L19.8597 8.5160 L19.8992 8.7281 L20.0212 8.9059 L20.1936 9.0683 L20.4026 9.2242 L20.6399 9.3791 L20.8978 9.5376 L21.1688 9.7033 L21.4450 9.8790 L21.7188 10.0668 L21.9824 10.2679 L22.2283 10.4828 L22.4496 10.7112 L22.6400 10.9521 L22.7940 11.2038 L22.9074 11.4642 L22.9767 11.7305 L23.0000 12.0000 L22.9767 12.2695 L22.9074 12.5358 L22.7940 12.7962 L22.6400 13.0479 L22.4496 13.2888 L22.2283 13.5172 L21.9824 13.7321 L21.7188 13.9332 L21.4450 14.1210 L21.1688 14.2967 L20.8978 14.4624 L20.6399 14.6209 L20.4026 14.7758 L20.1936 14.9317 L20.0212 15.0941 L19.8992 15.2719 L19.8597 15.4840 L19.8667 15.7207 L19.9043 15.9787 L19.9625 16.2561 L20.0328 16.5505 L20.1073 16.8593 L20.1784 17.1789 L20.2392 17.5053 L20.2834 17.8338 L20.3053 18.1597 L20.3003 18.4776 L20.2646 18.7826 L20.1956 19.0695 L20.0916 19.3338 L19.9522 19.5711 L19.7782 19.7782 L19.5711 19.9522 L19.3338 20.0916 L19.0695 20.1956 L18.7826 20.2646 L18.4776 20.3003 L18.1597 20.3053 L17.8338 20.2834 L17.5053 20.2392 L17.1789 20.1784 L16.8593 20.1073 L16.5505 20.0328 L16.2561 19.9625 L15.9787 19.9043 L15.7207 19.8667 L15.4840 19.8597 L15.2719 19.8992 L15.0941 20.0212 L14.9317 20.1936 L14.7758 20.4026 L14.6209 20.6399 L14.4624 20.8978 L14.2967 21.1688 L14.1210 21.4450 L13.9332 21.7188 L13.7321 21.9824 L13.5172 22.2283 L13.2888 22.4496 L13.0479 22.6400 L12.7962 22.7940 L12.5358 22.9074 L12.2695 22.9767 L12.0000 23.0000 L11.7305 22.9767 L11.4642 22.9074 L11.2038 22.7940 L10.9521 22.6400 L10.7112 22.4496 L10.4828 22.2283 L10.2679 21.9824 L10.0668 21.7188 L9.8790 21.4450 L9.7033 21.1688 L9.5376 20.8978 L9.3791 20.6399 L9.2242 20.4026 L9.0683 20.1936 L8.9059 20.0212 L8.7281 19.8992 L8.5160 19.8597 L8.2793 19.8667 L8.0213 19.9043 L7.7439 19.9625 L7.4495 20.0328 L7.1407 20.1073 L6.8211 20.1784 L6.4947 20.2392 L6.1662 20.2834 L5.8403 20.3053 L5.5224 20.3003 L5.2174 20.2646 L4.9305 20.1956 L4.6662 20.0916 L4.4289 19.9522 L4.2218 19.7782 L4.0478 19.5711 L3.9084 19.3338 L3.8044 19.0695 L3.7354 18.7826 L3.6997 18.4776 L3.6947 18.1597 L3.7166 17.8338 L3.7608 17.5053 L3.8216 17.1789 L3.8927 16.8593 L3.9672 16.5505 L4.0375 16.2561 L4.0957 15.9787 L4.1333 15.7207 L4.1403 15.4840 L4.1008 15.2719 L3.9788 15.0941 L3.8064 14.9317 L3.5974 14.7758 L3.3601 14.6209 L3.1022 14.4624 L2.8312 14.2967 L2.5550 14.1210 L2.2812 13.9332 L2.0176 13.7321 L1.7717 13.5172 L1.5504 13.2888 L1.3600 13.0479 L1.2060 12.7962 L1.0926 12.5358 L1.0233 12.2695 L1.0000 12.0000 L1.0233 11.7305 L1.0926 11.4642 L1.2060 11.2038 L1.3600 10.9521 L1.5504 10.7112 L1.7717 10.4828 L2.0176 10.2679 L2.2812 10.0668 L2.5550 9.8790 L2.8312 9.7033 L3.1022 9.5376 L3.3601 9.3791 L3.5974 9.2242 L3.8064 9.0683 L3.9788 8.9059 L4.1008 8.7281 L4.1403 8.5160 L4.1333 8.2793 L4.0957 8.0213 L4.0375 7.7439 L3.9672 7.4495 L3.8927 7.1407 L3.8216 6.8211 L3.7608 6.4947 L3.7166 6.1662 L3.6947 5.8403 L3.6997 5.5224 L3.7354 5.2174 L3.8044 4.9305 L3.9084 4.6662 L4.0478 4.4289 L4.2218 4.2218 L4.4289 4.0478 L4.6662 3.9084 L4.9305 3.8044 L5.2174 3.7354 L5.5224 3.6997 L5.8403 3.6947 L6.1662 3.7166 L6.4947 3.7608 L6.8211 3.8216 L7.1407 3.8927 L7.4495 3.9672 L7.7439 4.0375 L8.0213 4.0957 L8.2793 4.1333 L8.5160 4.1403 L8.7281 4.1008 L8.9059 3.9788 L9.0683 3.8064 L9.2242 3.5974 L9.3791 3.3601 L9.5376 3.1022 L9.7033 2.8312 L9.8790 2.5550 L10.0668 2.2812 L10.2679 2.0176 L10.4828 1.7717 L10.7112 1.5504 L10.9521 1.3600 L11.2038 1.2060 L11.4642 1.0926 L11.7305 1.0233 L12.0000 1.0000 Z"/><path d="M7.15 12.05 L10.55 15.45 L16.85 8.55" stroke="#fff" stroke-width="2.35" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg></span>`;
  }

  function nameWithVerify(name, isVerified, size) {
    // Inline name + badge like Telegram: "Name ✓" with tight gap, vertically centered.
    const label = `<span class="av-verify-name truncate">${escapeHtml(name || '')}</span>`;
    if (!isVerified) return label;
    return `<span class="av-verify-inline">${label}${verifyBadgeHtml(size)}</span>`;
  }


  function marketLoadingSkeleton(compact) {
    if (compact) {
      return Array.from({ length: 3 })
        .map(
          () =>
            `<div class="product-item bg-lightCard dark:bg-darkCard border border-slate-200 dark:border-slate-800 rounded-xl p-2.5 w-40 shrink-0 animate-pulse" aria-hidden="true">
          <div class="flex items-center gap-1.5 mb-1.5"><div class="w-5 h-5 rounded bg-slate-200 dark:bg-slate-700"></div><div class="h-2 w-14 rounded bg-slate-200 dark:bg-slate-700"></div></div>
          <div class="h-3 w-full rounded bg-slate-200 dark:bg-slate-700 mb-1"></div>
          <div class="h-3 w-3/4 rounded bg-slate-200 dark:bg-slate-700 mb-2"></div>
          <div class="h-2 w-20 rounded bg-slate-200 dark:bg-slate-700 mb-2"></div>
          <div class="flex justify-between items-center mt-2"><div class="h-4 w-10 rounded bg-slate-200 dark:bg-slate-700"></div><div class="h-5 w-12 rounded-full bg-slate-200 dark:bg-slate-700"></div></div>
        </div>`
        )
        .join('');
    }
    return Array.from({ length: 4 })
      .map(
        () =>
          `<div class="product-item bg-lightCard dark:bg-darkCard border border-slate-200 dark:border-slate-800 rounded-xl p-2.5 flex gap-2.5 items-center animate-pulse" aria-hidden="true">
        <div class="w-9 h-9 rounded-lg bg-slate-200 dark:bg-slate-700 shrink-0"></div>
        <div class="min-w-0 flex-1 space-y-1.5"><div class="h-3 w-2/3 rounded bg-slate-200 dark:bg-slate-700"></div><div class="h-2 w-1/2 rounded bg-slate-200 dark:bg-slate-700"></div></div>
        <div class="shrink-0 space-y-1.5"><div class="h-3 w-10 rounded bg-slate-200 dark:bg-slate-700 ml-auto"></div><div class="h-5 w-12 rounded-full bg-slate-200 dark:bg-slate-700"></div></div>
      </div>`
      )
      .join('');
  }

  function isMarketReady() {
    return !!window.__acctsuiteMarketReady;
  }

  function refreshUser() {
    currentUser = A().getCurrentUser();
    return currentUser;
  }

  function requireAuth(opts) {
    const u = refreshUser();
    if (!u) {
      if (opts && opts.redirect) {
        window.location.href = '/login';
        return null;
      }
      promptSignIn((opts && opts.message) || 'You are not logged in');
      return null;
    }
    // ensure plan defaults
    if (!u.plan) {
      u.plan = 'free';
      A().persistUser(u);
    }
    return u;
  }

  function promptSignIn(message) {
    const msg = message || 'You are not logged in';
    if (window.AcctSuiteToast) window.AcctSuiteToast.error(msg);
    else alert(msg);
  }

  function syncGuestMenu(isLoggedIn) {
    document.querySelectorAll('[data-auth-only]').forEach((el) => {
      el.classList.toggle('hidden', !isLoggedIn);
      const needsFlex =
        el.id === 'headerAuthIcons' ||
        (el.tagName === 'A' && el.classList.contains('items-center'));
      if (needsFlex) el.classList.toggle('flex', !!isLoggedIn);
    });
    const authMenuBtn = document.getElementById('headerAuthMenuBtn');
    if (authMenuBtn) authMenuBtn.classList.toggle('hidden', !isLoggedIn);
    document.querySelectorAll('[data-guest-only]').forEach((el) => {
      el.classList.toggle('hidden', !!isLoggedIn);
      if (el.id === 'headerGuestRight') el.classList.toggle('flex', !isLoggedIn);
    });
    const guestAuth = document.getElementById('leftGuestAuth');
    if (guestAuth) guestAuth.classList.toggle('hidden', !!isLoggedIn);
    const body = document.getElementById('dashBody') || document.body;
    if (body) {
      body.classList.toggle('pb-28', !!isLoggedIn);
      body.classList.toggle('pb-4', !isLoggedIn);
    }
  }

  function paintAvatar(id, u) {
    const el = document.getElementById(id);
    if (!el) return;
    const url = (u && (u.avatarUrl || u.avatar)) || '';
    const initials = A().getInitials((u && u.name) || '');
    if (url) {
      el.innerHTML = '<img alt="" src="' + String(url).replace(/"/g, '&quot;') + '">';
      el.classList.add('has-photo');
    } else {
      el.textContent = initials;
      el.classList.remove('has-photo');
    }
  }

  /** AcctBazaar header uses a fixed blue “?” tile (not the user photo). */
  function paintHeaderQuestionMark() {
    const el = document.getElementById('headerProfileAvatar');
    if (!el) return;
    el.className = 'as-header-q';
    el.classList.remove('has-photo');
    el.innerHTML = '?';
  }

  function paintCover(coverUrl) {
    const el = document.getElementById('rightProfileCover');
    if (!el) return;
    const url = String(coverUrl || '').trim();
    if (url) {
      el.style.backgroundImage = 'url(' + JSON.stringify(url).slice(1, -1) + ')';
      el.classList.add('has-photo');
    } else {
      el.style.backgroundImage = '';
      el.classList.remove('has-photo');
    }
  }

  function applyProfileChrome(u) {
    const set = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };
    if (!u) {
      paintHeaderQuestionMark();
      paintAvatar('leftProfileAvatar', { name: 'Guest' });
      paintAvatar('rightProfileAvatar', { name: 'Guest' });
      paintCover('');
      set('leftProfileName', 'GUEST');
      set('leftProfileEmail', 'Browse freely · sign in to buy');
      set('rightProfileName', 'Guest');
      set('rightProfileEmail', 'Not signed in');
      const mailEl = document.getElementById('rightProfileEmail');
      if (mailEl && mailEl.tagName === 'A') mailEl.href = '/login';
      set('rightProfilePhone', '—');
      set('rightProfileBalance', money(0));
      set('rightProfileRefCode', '—');
      set('rightProfileJoined', '—');
      ['leftProfileVerified', 'rightProfileVerified'].forEach((id) => {
        const badge = document.getElementById(id);
        if (badge) badge.classList.add('hidden');
      });
      const notifBadge = document.getElementById('notifBadge');
      const homeNotifBadge = document.getElementById('homeNotifBadge');
      [notifBadge, homeNotifBadge].forEach((badge) => {
        if (!badge) return;
        badge.classList.add('hidden');
        badge.classList.remove('flex');
      });
      syncGuestMenu(false);
      setSellerProfileMode(false);
      const heading = document.getElementById('rightProfileHeading');
      if (heading) heading.textContent = 'My Profile';
      syncAdsHoldToggle(null);
      return;
    }
    syncGuestMenu(true);
    paintHeaderQuestionMark();
    paintAvatar('leftProfileAvatar', u);
    paintAvatar('rightProfileAvatar', u);
    paintCover(u.coverUrl || u.cover_url || '');
    set('leftProfileName', (u.name || '').toUpperCase());
    set('leftProfileEmail', u.email);
    set('rightProfileName', u.name);
    set('rightProfileEmail', u.email);
    const mailEl = document.getElementById('rightProfileEmail');
    if (mailEl && mailEl.tagName === 'A') {
      mailEl.href = u.email ? 'mailto:' + u.email : '#';
    }
    const showVerified = !!(u.isVerified || u.kycStatus === 'verified');
    ['leftProfileVerified', 'rightProfileVerified'].forEach((id) => {
      const badge = document.getElementById(id);
      if (!badge) return;
      if (showVerified) badge.classList.remove('hidden');
      else badge.classList.add('hidden');
    });
    try {
      if (window.AcctSuiteKyc && typeof window.AcctSuiteKyc.syncFromUser === 'function') {
        window.AcctSuiteKyc.syncFromUser(u);
      }
    } catch (e) {}
    set('rightProfilePhone', u.phone || 'No phone added');
    set('rightProfileBalance', money(u.balance));
    set('rightProfileRefCode', u.referralCode || '—');
    try {
      set(
        'rightProfileJoined',
        u.createdAt
          ? new Date(u.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
          : '—'
      );
    } catch (e) {
      set('rightProfileJoined', '—');
    }

    const plan = A().getPlan(u);
    set('walletBalanceDisplay', money(u.balance));
    set('dashBalanceDisplay', money(u.balance));
    set('walletWithdrawableDisplay', money(u.withdrawableBalance != null ? u.withdrawableBalance : 0));
    set('walletEscrowDisplay', money(u.escrowBalance));
    set('walletDepositsDisplay', money(u.totalDeposits));
    set('walletWithdrawalsDisplay', money(u.totalWithdrawals));
    set('currentPlanLabel', plan.name);
    set('uploadLimitBannerText', `You are on ${plan.name}. Uploads left today: ${A().getRemainingUploads(u)} of ${plan.dailyUploads}.`);

    // Seller debt / owing banner
    let owingEl = document.getElementById('sellerOwingBanner');
    if (!owingEl) {
      const walletTab = document.getElementById('tab_wallet');
      if (walletTab) {
        owingEl = document.createElement('div');
        owingEl.id = 'sellerOwingBanner';
        owingEl.className = 'hidden text-xs rounded-xl px-3 py-2 border';
        walletTab.insertBefore(owingEl, walletTab.firstChild);
      }
    }
    if (owingEl) {
      const owing = Number(u.owing) || (Number(u.balance) < 0 ? Math.abs(Number(u.balance)) : 0);
      if (owing > 0) {
        owingEl.classList.remove('hidden');
        owingEl.className = 'text-xs rounded-xl px-3 py-2 border border-red-300 bg-red-50 text-red-700 dark:bg-red-950/40 dark:border-red-800 dark:text-red-300';
        owingEl.textContent = 'Balance owing: -$' + owing.toFixed(2) + ' — future sales repay this automatically.';
      } else {
        owingEl.classList.add('hidden');
        owingEl.textContent = '';
      }
    }

    const refLink = 'acctsuite.com/auth/sign-up?ref=' + encodeURIComponent(u.referralCode || 'user');
    const refEl = document.getElementById('referralLinkText');
    if (refEl) {
      refEl.textContent = refLink;
      refEl.dataset.full = 'https://' + refLink;
    }

    const notifBadge = document.getElementById('notifBadge');
    const homeNotifBadge = document.getElementById('homeNotifBadge');
    const unread = (u.notifications || []).filter((n) => !n.read).length;
    [notifBadge, homeNotifBadge].forEach((badge) => {
      if (!badge) return;
      if (unread > 0) {
        badge.textContent = String(unread > 99 ? '99+' : unread);
        badge.classList.remove('hidden');
        badge.classList.add('flex');
      } else {
        badge.classList.add('hidden');
        badge.classList.remove('flex');
      }
    });

    // account dashboard stats
    const ads = u.ads || [];
    set('dashActiveAds', String(ads.filter((a) => a.status === 'active').length));
    set('dashTotalAccounts', String(ads.length));
    set('dashAccountsSold', String((u.orders || []).filter((o) => o.role === 'seller' && o.status === 'completed').length));
    set('dashAccountsApproved', String(ads.filter((a) => a.status === 'active').length));

    const heading = document.getElementById('rightProfileHeading');
    const isSeller = (ads && ads.length > 0) || !!(u.merchantSlug || u.merchantLink);
    if (heading) heading.textContent = isSeller ? 'Seller Profile' : 'My Profile';
    setSellerProfileMode(isSeller);

    if (isSeller) {
      const countryEl = document.getElementById('rightProfileCountry');
      if (countryEl) countryEl.textContent = countryLabel(u.countryCode || '');
      try {
        set(
          'rightProfileJoinedInline',
          u.createdAt
            ? new Date(u.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'numeric', day: 'numeric' })
            : '—'
        );
      } catch (e) {
        set('rightProfileJoinedInline', '—');
      }

      const bioText = String(u.bio || '').trim();
      const bioDisplay = document.getElementById('profileBioDisplay');
      if (bioDisplay) {
        bioDisplay.textContent = bioText || 'Tell buyers about your store…';
        bioDisplay.classList.toggle('opacity-60', !bioText);
      }
      const bioEl = document.getElementById('profileBio');
      if (bioEl && document.activeElement !== bioEl) bioEl.value = u.bio || '';
      toggleProfileBioEdit(false);

      const merchantBox = document.getElementById('profileMerchantLink');
      const merchantUrlEl = document.getElementById('profileMerchantUrl');
      if (merchantBox && merchantUrlEl) {
        const mlink = u.merchantLink || '';
        if (mlink) {
          merchantBox.classList.remove('hidden');
          merchantUrlEl.textContent = mlink.replace(/^https?:\/\//, '');
          merchantUrlEl.dataset.full = mlink;
        } else {
          merchantBox.classList.add('hidden');
          merchantUrlEl.textContent = '';
          merchantUrlEl.dataset.full = '';
        }
      }

      const sold = (u.orders || []).filter((o) => o.role === 'seller' && (o.status === 'completed' || o.status === 'released')).length;
      const activeCount = ads.filter((a) => a.status === 'active' && Number(a.stock) > 0).length;
      const cancelled = (u.orders || []).filter((o) => o.role === 'seller' && (o.status === 'refunded' || o.status === 'cancelled')).length;
      const reviews = Number(u.sellerReviews || u.reviewCount || 0);
      set('profileStatReviews', String(reviews));
      set('profileStatSold', String(sold));
      set('profileStatActive', String(activeCount));
      set('profileStatCancelled', String(cancelled));

      renderProfileStoreAds(u);
      setProfileStoreTab('ads');
      loadProfileStoreReviews(u);
    }

    syncAdsHoldToggle(u);
  }

  function countryLabel(code) {
    const c = String(code || '').trim().toLowerCase();
    if (!c) return 'Worldwide';
    try {
      if (typeof Intl !== 'undefined' && Intl.DisplayNames) {
        const n = new Intl.DisplayNames(['en'], { type: 'region' }).of(c.toUpperCase());
        if (n) return n;
      }
    } catch (e) {}
    return c.toUpperCase();
  }

  function setSellerProfileMode(isSeller) {
    const buyerMeta = document.getElementById('rightProfileBuyerMeta');
    const sellerMeta = document.getElementById('rightProfileSellerMeta');
    const buyerStats = document.getElementById('profileBuyerStats');
    const buyerNav = document.getElementById('profileBuyerNav');
    const sellerStore = document.getElementById('profileSellerStore');
    const hint = document.getElementById('profileHintBuyer');
    if (buyerMeta) buyerMeta.classList.toggle('hidden', !!isSeller);
    if (sellerMeta) sellerMeta.classList.toggle('hidden', !isSeller);
    if (buyerStats) buyerStats.classList.toggle('hidden', !!isSeller);
    if (buyerNav) buyerNav.classList.toggle('hidden', !!isSeller);
    if (sellerStore) sellerStore.classList.toggle('hidden', !isSeller);
    if (hint) hint.classList.toggle('hidden', !!isSeller);
  }

  function toggleProfileBioEdit(show) {
    const viewBtn = document.getElementById('profileBioEditBtn');
    const wrap = document.getElementById('profileBioEditWrap');
    const display = document.getElementById('profileBioDisplay');
    if (wrap) wrap.classList.toggle('hidden', !show);
    if (viewBtn) viewBtn.classList.toggle('hidden', !!show);
    if (display) display.classList.toggle('hidden', !!show);
    if (show) {
      const ta = document.getElementById('profileBio');
      if (ta) {
        const u = refreshUser();
        ta.value = String((u && u.bio) || '');
        ta.focus();
      }
    }
  }
  window.toggleProfileBioEdit = toggleProfileBioEdit;

  function setProfileStoreTab(tab) {
    const adsOn = tab !== 'reviews';
    document.querySelectorAll('[data-profile-store-tab]').forEach((btn) => {
      const on = (btn.getAttribute('data-profile-store-tab') === 'ads') === adsOn;
      btn.classList.toggle('is-active', on);
    });
    const adsPane = document.getElementById('profileStoreAds');
    const revPane = document.getElementById('profileStoreReviews');
    if (adsPane) adsPane.classList.toggle('hidden', !adsOn);
    if (revPane) revPane.classList.toggle('hidden', adsOn);
  }
  window.setProfileStoreTab = setProfileStoreTab;

  function renderProfileStoreAds(u) {
    const host = document.getElementById('profileStoreAds');
    if (!host) return;
    const held = !!(u && (u.adsHeld || u.ads_held));
    const ads = ((u && u.ads) || []).filter((a) => {
      const st = String(a.status || '').toLowerCase();
      return st === 'active' && Number(a.stock) > 0 && !held;
    });
    if (!ads.length) {
      host.innerHTML = '<div class="text-center py-6 text-sm text-slate-500">No live ads yet. Create one from Sell.</div>';
      return;
    }
    host.innerHTML = ads
      .slice(0, 40)
      .map((ad) => {
        const title = escapeHtml(String(ad.title || 'Listing'));
        const desc = String(ad.description || '').trim();
        const snippet = desc ? escapeHtml(desc.length > 72 ? desc.slice(0, 72) + '…' : desc) : '';
        const stock = Math.max(1, Number(ad.stock || 1));
        const logo = productLogoMarkFor(ad, 'av-storefront-ad__logo');
        return `<article class="av-storefront-ad">
          ${logo || '<div class="av-storefront-ad__logo"></div>'}
          <div class="av-storefront-ad__body">
            <p class="av-storefront-ad__title">${title}</p>
            ${snippet ? `<p class="av-storefront-ad__desc">${snippet}</p>` : ''}
            <p class="text-[10px] text-slate-400 mt-0.5">${escapeHtml(ad.category || 'Account')} · ${stock} available</p>
          </div>
          <div class="av-storefront-ad__side">
            <p class="av-storefront-ad__price">${money(ad.price)}</p>
            <button type="button" class="av-storefront-ad__buy" onclick="switchTab('ads'); toggleRightMenu();">Manage</button>
          </div>
        </article>`;
      })
      .join('');
  }

  async function loadProfileStoreReviews(u) {
    const host = document.getElementById('profileStoreReviews');
    if (!host) return;
    const sellerId = u && (u.id != null ? u.id : u.userId);
    if (!sellerId || !window.AcctSuiteApi || !window.AcctSuiteApi.sellerReviews) {
      host.innerHTML = '<div class="text-sm text-slate-500">No reviews yet.</div>';
      return;
    }
    try {
      const res = await window.AcctSuiteApi.sellerReviews({ sellerId: sellerId });
      const list = (res && (res.reviews || res.items)) || [];
      if (!list.length) {
        host.innerHTML = '<div class="text-sm text-slate-500">No reviews yet.</div>';
        return;
      }
      host.innerHTML = list
        .slice(0, 20)
        .map((r) => {
          const pos = Number(r.rating || r.stars || 0) >= 3 || r.sentiment === 'positive' || r.is_positive;
          const name = escapeHtml(r.buyer_name || r.buyerName || 'Buyer');
          const comment = escapeHtml(r.comment || '');
          return `<div class="av-storefront-review" data-sentiment="${pos ? 'pos' : 'neg'}">
            <div class="av-storefront-review__head">
              <div class="av-storefront-review__avatar">${name.slice(0, 1)}</div>
              <div>
                <p class="av-storefront-review__name">${name}</p>
              </div>
              <span class="av-storefront-review__badge ${pos ? 'is-pos' : 'is-neg'}"><i class="fa-solid fa-thumbs-${pos ? 'up' : 'down'} mr-1"></i>${pos ? 'Positive' : 'Negative'}</span>
            </div>
            ${comment ? `<p class="av-storefront-review__body">${comment}</p>` : ''}
          </div>`;
        })
        .join('');
    } catch (e) {
      host.innerHTML = '<div class="text-sm text-slate-500">No reviews yet.</div>';
    }
  }

  function syncAdsHoldToggle(u) {
    const toggle = document.getElementById('adsHoldToggle');
    const knob = document.getElementById('adsHoldKnob');
    const label = document.getElementById('adsHoldLabel');
    if (!toggle) return;
    const held = !!(u && (u.adsHeld || u.ads_held));
    // ON = live (not held)
    const on = !held;
    toggle.setAttribute('aria-checked', on ? 'true' : 'false');
    toggle.classList.add('ads-hold-switch');
    toggle.classList.toggle('is-on', on);
    if (knob) {
      knob.className = 'ads-hold-switch__knob';
      knob.style.left = '';
      knob.style.top = '';
      knob.style.transform = '';
    }
    if (label) {
      if (held) {
        label.textContent = 'Held';
        label.className = 'text-[10px] font-semibold text-amber-600 dark:text-amber-400';
      } else {
        label.textContent = 'Live';
        label.className = 'text-[10px] font-semibold text-emerald-600 dark:text-emerald-400';
      }
    }
  }

  function productLogoFor(item) {
    const Cat = window.AcctSuiteCatalog;
    if (!Cat) return '';
    const hit = Cat.findProduct(item.platform || item.category || item.title) || {
      name: item.platform || item.category || item.title || '',
      domain: item.domain || '',
    };
    return Cat.logoUrl(hit);
  }

  function productLogoMarkFor(item, className) {
    const Cat = window.AcctSuiteCatalog;
    if (!Cat) return '';
    const hit = Cat.findProduct(item.platform || item.category || item.title) || {
      name: item.platform || item.category || item.title || '',
      domain: item.domain || '',
    };
    if (typeof Cat.logoMarkHtml === 'function') return Cat.logoMarkHtml(hit, className || 'av-prod-logo');
    return `<img src="${escapeAttr(Cat.logoUrl(hit))}" alt="" class="${className || 'av-prod-logo'}" loading="lazy" onerror="this.style.opacity=.3">`;
  }

  function productGroupFor(item) {
    const Cat = window.AcctSuiteCatalog;
    if (!Cat) return '';
    const hit = Cat.findProduct(item.platform || item.category || '');
    return hit ? hit.groupId : '';
  }

  function sellerAvatarFaceHtml(avatarUrl, initials, imgClass) {
    const rawIni = String(initials || '').trim() || '?';
    const ini = escapeHtml(rawIni);
    const url = String(avatarUrl || '').trim();
    if (url) {
      // Eager load for Top Merchants (above the fold). onerror falls back to initials.
      return `<img src="${escapeAttr(url)}" alt="${ini}" class="${imgClass || 'w-full h-full object-cover rounded-full'}" loading="eager" decoding="async" onerror="this.onerror=null;this.removeAttribute('src');this.alt='';this.style.display='none';if(this.parentNode){this.parentNode.textContent='${ini}';}">`;
    }
    return ini;
  }

  function listingCard(item, compact) {
    const logo = productLogoFor(item);
    const group = productGroupFor(item);
    const cat = item.platform || item.category || '';
    const stock = Math.max(1, Number(item.stock) || 1);
    const previewBtn = item.previewLink
      ? `<a href="${escapeAttr(item.previewLink)}" target="_blank" rel="noopener" onclick="event.stopPropagation()" class="text-[10px] text-brandPrimary underline">Preview</a>`
      : `<span class="text-[10px] text-slate-400">No preview</span>`;
    const bolt =
      item.releaseType !== 'manual'
        ? ' <i class="fa-solid fa-bolt text-emerald-500 text-[9px]" title="Instant delivery"></i>'
        : '';
    if (compact) {
      return `<div class="product-item home-trend-card" data-category="${escapeAttr(cat)}" data-group="${escapeAttr(group)}" data-price="${Number(item.price) || 0}">
        <button type="button" class="home-trend-card__heart" onclick="event.stopPropagation(); toggleWishlist(this.querySelector('i')||this)" aria-label="Save"><i class="fa-regular fa-heart"></i></button>
        ${productLogoMarkFor(item, 'home-trend-card__logo')}
        <h4 class="home-trend-card__title">${escapeHtml(item.title)}</h4>
        <div class="mb-0.5">${starsRowHtml(item.sellerRating || 0, item.sellerReviews || 0)}</div>
        <p class="text-[10px] home-by flex items-center gap-0.5 min-w-0 overflow-visible">By <span class="inline-flex items-center min-w-0 max-w-full overflow-visible">${nameWithVerify(item.sellerName || 'Seller', item.sellerVerified, 'sm')}</span>${bolt}</p>
        <p class="text-[10px] text-emerald-500 mt-0.5"><span class="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1"></span>${stock} available</p>
        <div class="flex justify-between items-center mt-2 gap-1.5">
          <span class="home-trend-card__price">${money(item.price)}</span>
          <button type="button" onclick="openListingDetail('${item.id}')" class="bg-brandPrimary hover:bg-brandHover text-white text-[10px] font-bold px-2.5 py-1.5 rounded-lg shrink-0">Buy now</button>
        </div>
      </div>`;
    }
    return `<div class="product-item bg-white dark:bg-darkCard border border-slate-200 dark:border-slate-800 rounded-xl p-2.5 flex gap-2.5 items-center" data-category="${escapeAttr(cat)}" data-group="${escapeAttr(group)}" data-price="${Number(item.price) || 0}">
      ${productLogoMarkFor(item, 'w-9 h-9 rounded-lg object-cover bg-slate-800 shrink-0')}
      <div class="min-w-0 flex-1">
        <h4 class="font-bold text-sm leading-snug truncate text-slate-900 dark:text-white">${escapeHtml(item.title)}</h4>
        <p class="text-[10px] text-slate-500 flex items-center gap-0.5 min-w-0 overflow-visible">By <span class="inline-flex items-center min-w-0 max-w-full overflow-visible">${nameWithVerify(item.sellerName || 'Seller', item.sellerVerified, 'sm')}</span><span class="truncate"> · ${escapeHtml(cat)}</span></p>
        <div class="mt-0.5">${previewBtn}</div>
      </div>
      <div class="text-right shrink-0">
        <div class="text-sm font-bold text-slate-900 dark:text-white mb-1">${money(item.price)}</div>
        <button onclick="openListingDetail('${item.id}')" class="bg-brandPrimary hover:bg-brandHover text-white text-[10px] font-bold px-2.5 py-1 rounded-lg">Buy</button>
      </div>
    </div>`;
  }

  /** Full-width home row — AcctBazaar “Other product” pattern */
  function homeOtherListingCard(item) {
    const group = productGroupFor(item);
    const cat = item.platform || item.category || '';
    const stock = Math.max(1, Number(item.stock) || 1);
    const bolt =
      item.releaseType !== 'manual'
        ? ' <i class="fa-solid fa-bolt text-emerald-500 text-[10px]" title="Instant delivery"></i>'
        : '';
    return `<div class="product-item bg-white dark:bg-darkCard border border-slate-200 dark:border-slate-800 rounded-xl p-3 flex gap-3 items-stretch" data-category="${escapeAttr(cat)}" data-group="${escapeAttr(group)}" data-price="${Number(item.price) || 0}">
      ${productLogoMarkFor(item, 'w-12 h-12 rounded-full object-cover bg-slate-800 shrink-0 self-center')}
      <div class="min-w-0 flex-1 flex flex-col justify-center gap-0.5">
        <h4 class="font-bold text-sm leading-snug line-clamp-2 text-slate-900 dark:text-white">${escapeHtml(item.title)}</h4>
        <div>${starsRowHtml(item.sellerRating || 0, item.sellerReviews || 0)}</div>
        <p class="text-[11px] home-other-by flex items-center gap-0.5 min-w-0 flex-wrap">By <span class="min-w-0 inline-flex max-w-full">${nameWithVerify(item.sellerName || 'Seller', item.sellerVerified, 'sm')}</span>${bolt}</p>
        <p class="text-[11px] text-emerald-500"><span class="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1 align-middle"></span>${stock} available</p>
      </div>
      <div class="shrink-0 flex flex-col items-end justify-center gap-1.5 pl-1">
        <button type="button" class="text-slate-400 mb-auto" onclick="event.stopPropagation(); toggleWishlist(this.querySelector('i')||this)" aria-label="Save"><i class="fa-regular fa-heart"></i></button>
        <span class="text-base font-extrabold text-slate-900 dark:text-white">${money(item.price)}</span>
        <button type="button" onclick="openListingDetail('${item.id}')" class="bg-brandPrimary hover:bg-brandHover text-white text-[11px] font-bold px-3.5 py-1.5 rounded-lg whitespace-nowrap">Buy now</button>
      </div>
    </div>`;
  }

  const HOME_TRENDING_MAX = 8;

  function renderMarketplace() {
    // Keep server order (newest first) — do not reshuffle on refresh.
    const list = (A().getMarketplaceListings() || []).slice();
    const home = document.getElementById('homeListings');
    const homeOther = document.getElementById('homeOtherListings');
    const homeOtherSection = document.getElementById('homeOtherSection');
    const market = document.getElementById('marketListings');
    const merchants = document.getElementById('topMerchantsRow');
    const ready = isMarketReady();

    if (home) {
      if (!ready) {
        // Avoid flashing "No live listings yet" before the API hydrate finishes.
        home.innerHTML = marketLoadingSkeleton(true);
      } else if (!list.length) {
        home.innerHTML = `<div class="text-center py-8 text-sm text-slate-500 w-full">No live listings yet. Be the first to <button class="text-brandPrimary font-semibold" onclick="openSellProductWizard()">Sell Product</button>.</div>`;
      } else {
        home.innerHTML = list.slice(0, HOME_TRENDING_MAX).map((i) => listingCard(i, true)).join('');
      }
    }
    if (homeOther) {
      if (!ready || !list.length) {
        homeOther.innerHTML = '';
      } else {
        homeOther.innerHTML = list.map((i) => homeOtherListingCard(i)).join('');
      }
    }
    if (homeOtherSection) {
      homeOtherSection.classList.toggle('hidden', !ready || !list.length);
    }
    if (market) {
      if (!ready) {
        market.innerHTML = marketLoadingSkeleton(false);
      } else if (!list.length) {
        market.innerHTML = `<div class="text-center py-12 space-y-2"><p class="font-bold text-sm text-slate-600 dark:text-slate-400">No products yet</p><p class="text-xs text-slate-400">Approved seller listings will appear here.</p></div>`;
      } else {
        market.innerHTML = list.map((i) => listingCard(i, false)).join('');
      }
      const count = document.getElementById('resultCount');
      if (count) count.innerText = list.length + ' results found';
    }
    if (merchants) {
      const map = {};
      list.forEach((i) => {
        if (!map[i.sellerEmail]) {
          const name = i.sellerName || 'Seller';
          const parts = String(name).trim().split(/\s+/).filter(Boolean);
          const fallbackIni = !parts.length
            ? '?'
            : parts.length === 1
              ? parts[0].slice(0, 2).toUpperCase()
              : (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
          map[i.sellerEmail] = {
            name,
            email: i.sellerEmail,
            merchantSlug: i.sellerMerchantSlug || '',
            initials: i.sellerInitials || fallbackIni,
            avatarUrl: i.sellerAvatar || '',
            sellerId: i.sellerId || '',
            sales: 0,
            rating: Number(i.sellerRating) || 0,
            reviews: Number(i.sellerReviews) || 0,
            completedSales: Number(i.sellerCompletedSales) || 0,
            hasStory: false,
          };
        }
        map[i.sellerEmail].sales += 1;
        if (Number(i.sellerRating) > map[i.sellerEmail].rating) map[i.sellerEmail].rating = Number(i.sellerRating) || 0;
        if (Number(i.sellerReviews) > map[i.sellerEmail].reviews) map[i.sellerEmail].reviews = Number(i.sellerReviews) || 0;
        if (Number(i.sellerCompletedSales) > map[i.sellerEmail].completedSales) {
          map[i.sellerEmail].completedSales = Number(i.sellerCompletedSales) || 0;
        }
        if (!map[i.sellerEmail].merchantSlug && i.sellerMerchantSlug) map[i.sellerEmail].merchantSlug = i.sellerMerchantSlug;
        if (!map[i.sellerEmail].avatarUrl && i.sellerAvatar) map[i.sellerEmail].avatarUrl = i.sellerAvatar;
        if (!map[i.sellerEmail].sellerId && i.sellerId) map[i.sellerEmail].sellerId = i.sellerId;
      });
      const storyFeed = window.__acctsuiteStoryFeed || [];
      storyFeed.forEach((m) => {
        const email = String(m.sellerEmail || '').toLowerCase();
        if (email && map[email]) {
          map[email].hasStory = Array.isArray(m.stories) && m.stories.length > 0;
          if (!map[email].avatarUrl && m.sellerAvatar) map[email].avatarUrl = m.sellerAvatar;
        } else if (email && Array.isArray(m.stories) && m.stories.length) {
          // Sellers with stories but no live ads still show in Top Merchants
          map[email] = {
            name: m.sellerName,
            email: m.sellerEmail,
            merchantSlug: m.sellerMerchantSlug || '',
            initials: (m.sellerName || '?').slice(0, 2).toUpperCase(),
            avatarUrl: m.sellerAvatar || '',
            sellerId: m.sellerId || '',
            sales: 0,
            hasStory: true,
          };
        }
      });
      const arr = Object.values(map)
        .sort((a, b) => Number(b.hasStory) - Number(a.hasStory) || b.sales - a.sales)
        .slice(0, 12);
      if (!arr.length) {
        merchants.innerHTML = `<p class="text-xs text-slate-400 py-2">Merchants will appear after approved sales listings go live.</p>`;
      } else {
        merchants.innerHTML = arr
          .map((m) => {
            const ring = m.hasStory ? 'av-merchant-ring has-story' : 'av-merchant-ring';
            const face = sellerAvatarFaceHtml(m.avatarUrl, m.initials, 'av-merchant-face-img');
            const action = m.hasStory
              ? `openMerchantStory('${escapeAttr(m.email)}')`
              : `goToSellerStore('${escapeAttr(m.merchantSlug || m.email)}')`;
            return `<button type="button" onclick="${action}" class="av-merchant-chip flex flex-col items-center shrink-0 text-center w-[4.5rem]">
          <span class="${ring}"><span class="av-merchant-face">${face}</span></span>
          <span class="text-xs font-bold truncate w-full mt-1 text-slate-900 dark:text-white">${escapeHtml(m.name)}</span>
          <span class="av-merchant-meta">${(Number(m.rating) || 0).toFixed(1)} <i class="fa-solid fa-star av-merchant-star"></i> ${formatSalesLabel(m.completedSales || m.sales)}</span>
        </button>`;
          })
          .join('');
      }
    }
  }

  /**
   * My Ads shows each account unit as its own row.
   * Market still uses the parent ad (one card + stock).
   */
  function expandAdsIntoUnits(ads) {
    const out = [];
    (ads || []).forEach((ad) => {
      const status = String(ad.status || '').toLowerCase();
      const stock = Number(ad.stock) || 0;
      const soldOut = status === 'active' && !(stock > 0);
      const creds = Array.isArray(ad.credentials) ? ad.credentials : [];
      const available = creds.filter((c) => String(c.status || 'available').toLowerCase() === 'available');

      if (status === 'removed' || soldOut) {
        out.push(Object.assign({}, ad, { credentialId: null, unitIndex: 0, unitCount: 1 }));
        return;
      }

      if (available.length > 1) {
        available.forEach((c, i) => {
          out.push(
            Object.assign({}, ad, {
              credentialId: c.id,
              unitIndex: i,
              unitCount: available.length,
              username: c.username,
              password: c.password,
              previewLink: c.previewLink || '',
              attachedEmail: c.attachedEmail || '',
              attachedEmailPassword: c.attachedEmailPassword || '',
              twoFA: c.twoFA || '',
              extraInfo: c.extraInfo || '',
              stock: 1,
            })
          );
        });
        return;
      }

      if (available.length === 1) {
        const c = available[0];
        out.push(
          Object.assign({}, ad, {
            credentialId: c.id,
            unitIndex: 0,
            unitCount: Math.max(1, stock || 1),
            username: c.username || ad.username,
            password: c.password || ad.password,
            previewLink: c.previewLink || ad.previewLink || '',
            attachedEmail: c.attachedEmail || ad.attachedEmail || '',
            attachedEmailPassword: c.attachedEmailPassword || ad.attachedEmailPassword || '',
            twoFA: c.twoFA || ad.twoFA || '',
            extraInfo: c.extraInfo || ad.extraInfo || '',
            stock: 1,
          })
        );
        return;
      }

      // No credential rows — synthesize one row per stock so multi-qty still shows separately
      const n = Math.max(1, stock || 1);
      if (n > 1 && (status === 'pending' || status === 'active' || status === 'denied')) {
        for (let i = 0; i < n; i++) {
          out.push(
            Object.assign({}, ad, {
              credentialId: null,
              unitIndex: i,
              unitCount: n,
              stock: 1,
              username: i === 0 ? ad.username : ad.username,
              password: i === 0 ? ad.password : ad.password,
            })
          );
        }
        return;
      }

      out.push(Object.assign({}, ad, { credentialId: null, unitIndex: 0, unitCount: 1 }));
    });
    return out;
  }

  function renderAds() {
    const u = refreshUser();
    if (!u) return;
    syncAdsHoldToggle(u);
    const box = document.getElementById('adsListContainer');
    if (!box) return;
    let ads = expandAdsIntoUnits(u.ads || []);
    if (adsFilter !== 'all') {
      if (adsFilter === 'active') {
        ads = ads.filter((a) => {
          const parent = (u.ads || []).find((p) => String(p.id) === String(a.id));
          const parentStock = parent ? Number(parent.stock) : Number(a.stock);
          return a.status === 'active' && parentStock > 0;
        });
      } else if (adsFilter === 'removed') {
        ads = ads.filter((a) => {
          const parent = (u.ads || []).find((p) => String(p.id) === String(a.id));
          const parentStock = parent ? Number(parent.stock) : Number(a.stock);
          return a.status === 'removed' || (a.status === 'active' && !(parentStock > 0));
        });
      } else {
        ads = ads.filter((a) => a.status === adsFilter);
      }
    }
    const q = String(adsSearch || '')
      .trim()
      .toLowerCase();
    if (q) {
      ads = ads.filter((a) => {
        const blob = [a.title, a.description, a.category, a.username].join(' ').toLowerCase();
        return blob.indexOf(q) !== -1;
      });
    }
    if (!ads.length) {
      const emptyTitle =
        adsFilter === 'pending'
          ? 'No pending listings'
          : adsFilter === 'active'
            ? 'No active listings'
            : adsFilter === 'denied'
              ? 'No denied listings'
              : adsFilter === 'removed'
                ? 'No removed listings'
                : q
                  ? 'No matching ads'
                  : 'No ads in this tab';
      const emptySub =
        adsFilter === 'pending'
          ? 'New uploads appear here until they are reviewed.'
          : adsFilter === 'active'
            ? 'Sold-out ads move to Removed — list a new product when you have stock.'
            : adsFilter === 'denied'
              ? 'Denied listings will show here with the reason.'
              : adsFilter === 'removed'
                ? 'Removed or sold-out listings show here.'
                : q
                  ? 'Try a different search.'
                  : 'Tap + to list a product.';
      box.innerHTML = `<div class="text-center py-10 space-y-2">
        <i class="fa-solid fa-bullhorn text-3xl text-slate-300 dark:text-slate-700"></i>
        <p class="font-bold text-sm text-slate-600 dark:text-slate-400">${emptyTitle}</p>
        <p class="text-xs text-slate-400">${emptySub}</p>
      </div>`;
      return;
    }
    box.innerHTML = ads
      .map((a) => {
        const parent = (u.ads || []).find((p) => String(p.id) === String(a.id));
        const parentStock = parent ? Number(parent.stock) : Number(a.stock);
        const soldOut = a.status === 'active' && !(parentStock > 0);
        const status = String(a.status || '').toLowerCase();
        let statusClass = 'is-removed';
        let statusLabel = (a.status || '').charAt(0).toUpperCase() + (a.status || '').slice(1);
        if (status === 'pending') {
          statusClass = 'is-pending';
          statusLabel = 'Pending';
        } else if (status === 'active' && !soldOut) {
          statusClass = 'is-active';
          statusLabel = 'Active';
        } else if (soldOut) {
          statusClass = 'is-soldout';
          statusLabel = 'Sold out';
        } else if (status === 'denied') {
          statusClass = 'is-denied';
          statusLabel = 'Denied';
        } else if (status === 'removed') {
          statusClass = 'is-removed';
          statusLabel = 'Removed';
        }
        const desc = String(a.description || '').trim();
        const snippet = desc ? escapeHtml(desc.length > 70 ? desc.slice(0, 70) + '…' : desc) : '';
        const instant =
          a.releaseType !== 'manual'
            ? `<span class="my-ads-row__instant"><i class="fa-solid fa-bolt"></i> Delivers Instantly</span>`
            : `<span class="my-ads-row__instant" style="color:#64748b;background:rgba(148,163,184,.15)"><i class="fa-solid fa-hand"></i> Manual</span>`;
        const canManage = status === 'pending' || status === 'active' || status === 'denied';
        const credArg = a.credentialId != null ? String(a.credentialId) : '';
        const actions = canManage
          ? `<div class="my-ads-row__actions">
              <button type="button" onclick="editMyAd('${escapeAttr(String(a.id))}','${escapeAttr(credArg)}')" aria-label="Edit ad"><i class="fa-solid fa-pencil"></i></button>
              <button type="button" class="is-danger" onclick="deleteMyAd('${escapeAttr(String(a.id))}','${escapeAttr(credArg)}')" aria-label="Delete ad"><i class="fa-solid fa-trash"></i></button>
            </div>`
          : '';
        const logo = productLogoMarkFor(a, 'my-ads-row__logo');
        const unitNote =
          a.unitCount > 1 && a.credentialId
            ? `<span class="text-[10px] text-slate-400">Unit ${a.unitIndex + 1} of ${a.unitCount}</span>`
            : '';
        return `<article class="my-ads-row">
          ${logo || '<div class="my-ads-row__logo" aria-hidden="true"></div>'}
          <div class="min-w-0">
            <p class="my-ads-row__title">${escapeHtml(a.title || 'Listing')}</p>
            ${snippet ? `<p class="my-ads-row__desc">${snippet}</p>` : ''}
            <div class="my-ads-row__meta">${instant}${unitNote}</div>
            <div class="my-ads-row__price-row">
              <span class="my-ads-row__price">${money(a.price)}</span>
              ${actions}
            </div>
            ${status === 'pending' ? `<p class="my-ads-row__note">Pending review before Market.</p>` : ''}
            ${soldOut ? `<p class="my-ads-row__note">This unit sold. Restock with new login details to list again.</p>` : ''}
          </div>
          <span class="my-ads-row__status ${statusClass}">${statusLabel}</span>
          ${
            status === 'denied' && a.denyReason
              ? `<div class="my-ads-row__deny"><i class="fa-solid fa-circle-info mt-0.5"></i><span><strong>Reason for denied:</strong> ${escapeHtml(a.denyReason)}</span></div>`
              : ''
          }
        </article>`;
      })
      .join('');
  }

  window.onAdsSearchInput = function (val) {
    adsSearch = String(val || '');
    renderAds();
  };

  window.toggleHoldAds = async function (on) {
    const u = refreshUser();
    if (!u) {
      if (typeof promptDashSignIn === 'function') promptDashSignIn('Sign in to manage ads.');
      return;
    }
    const held = !on;
    try {
      if (window.AcctSuiteApi && window.AcctSuiteApi.holdAds) {
        const res = await window.AcctSuiteApi.holdAds({ held: held });
        u.adsHeld = !!(res && (res.adsHeld != null ? res.adsHeld : held));
      } else {
        u.adsHeld = held;
      }
      if (window.AcctSuiteApi && window.AcctSuiteApi.updateProfile) {
        try {
          await window.AcctSuiteApi.updateProfile({ adsHeld: held });
        } catch (_) {}
      }
      A().persistUser(u);
      if (window.AcctSuiteApiSync && window.AcctSuiteApiSync.hydrateFromApi) {
        try {
          await window.AcctSuiteApiSync.hydrateFromApi();
        } catch (_) {}
      }
      const fresh = refreshUser() || u;
      fresh.adsHeld = fresh.adsHeld != null ? fresh.adsHeld : held;
      A().persistUser(fresh);
      applyProfileChrome(fresh);
      renderAds();
      if (window.AcctSuiteToast) {
        window.AcctSuiteToast.success(held ? 'Ads held — hidden from marketplace.' : 'Ads are live again.');
      }
    } catch (e) {
      syncAdsHoldToggle(u);
      alert((e && e.message) || 'Could not update hold status.');
    }
  };

  window.deleteMyAd = async function (id, credentialId) {
    const u = refreshUser();
    if (!u) return;
    const unitMsg = credentialId
      ? 'This removes this account unit from your listing. Other units stay on Market.'
      : 'This removes the ad from your store. This cannot be undone.';
    const ok = window.AcctSuiteConfirm
      ? await window.AcctSuiteConfirm({
          title: credentialId ? 'Delete this account?' : 'Delete listing?',
          message: unitMsg,
          okText: 'Delete',
          icon: 'fa-trash',
          danger: true,
        })
      : confirm(unitMsg);
    if (!ok) return;
    try {
      if (!window.AcctSuiteApi || !window.AcctSuiteApi.deleteAd) {
        alert('API unavailable.');
        return;
      }
      const payload = { id: Number(id) || id };
      if (credentialId) payload.credentialId = Number(credentialId) || credentialId;
      await window.AcctSuiteApi.deleteAd(payload);
      if (window.AcctSuiteApiSync && window.AcctSuiteApiSync.hydrateFromApi) {
        await window.AcctSuiteApiSync.hydrateFromApi();
      } else {
        u.ads = (u.ads || []).map((a) =>
          String(a.id) === String(id) ? Object.assign({}, a, { status: 'removed', stock: 0 }) : a
        );
        A().persistUser(u);
      }
      applyProfileChrome(refreshUser());
      renderAds();
      if (window.AcctSuiteToast) window.AcctSuiteToast.success(credentialId ? 'Account unit deleted.' : 'Listing deleted.');
    } catch (e) {
      alert((e && e.message) || 'Could not delete listing.');
    }
  };

  window.editMyAd = function (id, credentialId) {
    const u = refreshUser();
    if (!u) return;
    const ad = (u.ads || []).find((a) => String(a.id) === String(id));
    if (!ad) {
      alert('Listing not found.');
      return;
    }
    let unit = ad;
    if (credentialId && Array.isArray(ad.credentials)) {
      const hit = ad.credentials.find((c) => String(c.id) === String(credentialId));
      if (hit) {
        unit = Object.assign({}, ad, {
          credentialId: hit.id,
          username: hit.username,
          password: hit.password,
          previewLink: hit.previewLink || '',
          attachedEmail: hit.attachedEmail || '',
          attachedEmailPassword: hit.attachedEmailPassword || '',
          twoFA: hit.twoFA || '',
          extraInfo: hit.extraInfo || '',
        });
      }
    }
    const body = document.getElementById('modalBody');
    if (!body) return;
    const credVal = unit.credentialId != null ? String(unit.credentialId) : credentialId ? String(credentialId) : '';
    body.innerHTML = `
      <h3 class="font-bold text-lg mb-3">Edit listing</h3>
      <div class="space-y-3">
        <div>
          <label class="block text-xs text-slate-500 mb-1">Title</label>
          <input id="editAdTitle" type="text" value="${escapeAttr(ad.title || '')}" class="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 text-sm">
        </div>
        <div>
          <label class="block text-xs text-slate-500 mb-1">Description</label>
          <textarea id="editAdDesc" rows="3" class="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 text-sm">${escapeHtml(ad.description || '')}</textarea>
        </div>
        <div>
          <label class="block text-xs text-slate-500 mb-1">Price ($)</label>
          <input id="editAdPrice" type="number" step="0.01" min="0.01" value="${escapeAttr(String(ad.price != null ? ad.price : ''))}" class="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 text-sm">
        </div>
        <div class="rounded-xl border border-slate-200 dark:border-slate-800 p-3 space-y-2.5">
          <p class="text-xs font-bold text-slate-700 dark:text-slate-200">Login credentials</p>
          <div>
            <label class="block text-[11px] text-slate-500 mb-1">Username</label>
            <input id="editAdUsername" type="text" value="${escapeAttr(unit.username || '')}" class="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 text-sm" autocomplete="off">
          </div>
          <div>
            <label class="block text-[11px] text-slate-500 mb-1">Password</label>
            <input id="editAdPassword" type="text" value="${escapeAttr(unit.password || '')}" class="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 text-sm" autocomplete="off">
          </div>
          <div>
            <label class="block text-[11px] text-slate-500 mb-1">Preview link</label>
            <input id="editAdPreview" type="url" value="${escapeAttr(unit.previewLink || '')}" class="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 text-sm" placeholder="https://…">
          </div>
          <div>
            <label class="block text-[11px] text-slate-500 mb-1">Attached email</label>
            <input id="editAdEmail" type="text" value="${escapeAttr(unit.attachedEmail || '')}" class="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 text-sm">
          </div>
          <div>
            <label class="block text-[11px] text-slate-500 mb-1">Email password</label>
            <input id="editAdEmailPass" type="text" value="${escapeAttr(unit.attachedEmailPassword || '')}" class="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 text-sm" autocomplete="off">
          </div>
          <div>
            <label class="block text-[11px] text-slate-500 mb-1">2FA / recovery</label>
            <input id="editAdTwoFA" type="text" value="${escapeAttr(unit.twoFA || '')}" class="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 text-sm">
          </div>
          <div>
            <label class="block text-[11px] text-slate-500 mb-1">Extra info</label>
            <textarea id="editAdExtra" rows="2" class="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 text-sm">${escapeHtml(unit.extraInfo || '')}</textarea>
          </div>
        </div>
        <p class="text-[11px] text-amber-600">Editing a live listing sends it back for a review.</p>
        <button type="button" onclick="saveEditedAd('${escapeAttr(String(ad.id))}','${escapeAttr(credVal)}')" class="w-full bg-brandPrimary hover:bg-brandHover text-white font-bold py-3 rounded-xl text-sm">Save changes</button>
      </div>`;
    if (typeof openModal === 'function') openModal();
  };

  window.saveEditedAd = async function (id, credentialId) {
    const title = (document.getElementById('editAdTitle') || {}).value;
    const description = (document.getElementById('editAdDesc') || {}).value;
    const price = parseListingPrice((document.getElementById('editAdPrice') || {}).value);
    const username = String((document.getElementById('editAdUsername') || {}).value || '').trim();
    const password = String((document.getElementById('editAdPassword') || {}).value || '');
    const previewLink = String((document.getElementById('editAdPreview') || {}).value || '').trim();
    const attachedEmail = String((document.getElementById('editAdEmail') || {}).value || '').trim();
    const attachedEmailPassword = String((document.getElementById('editAdEmailPass') || {}).value || '');
    const twoFA = String((document.getElementById('editAdTwoFA') || {}).value || '').trim();
    const extraInfo = String((document.getElementById('editAdExtra') || {}).value || '').trim();
    if (!String(title || '').trim()) {
      alert('Title is required.');
      return;
    }
    if (!Number.isFinite(price) || price <= 0) {
      alert('Enter a valid price.');
      return;
    }
    if (!username || !password) {
      alert('Username and password are required.');
      return;
    }
    try {
      if (!window.AcctSuiteApi || !window.AcctSuiteApi.updateAd) {
        alert('API unavailable.');
        return;
      }
      const payload = {
        id: Number(id) || id,
        title: String(title).trim(),
        description: String(description || '').trim(),
        price,
        username,
        password,
        previewLink,
        attachedEmail,
        attachedEmailPassword,
        twoFA,
        extraInfo,
      };
      if (credentialId) payload.credentialId = Number(credentialId) || credentialId;
      await window.AcctSuiteApi.updateAd(payload);
      if (typeof closeModal === 'function') closeModal();
      if (window.AcctSuiteApiSync && window.AcctSuiteApiSync.hydrateFromApi) {
        await window.AcctSuiteApiSync.hydrateFromApi();
      }
      applyProfileChrome(refreshUser());
      renderAds();
      if (window.AcctSuiteToast) window.AcctSuiteToast.success('Listing updated.');
    } catch (e) {
      alert((e && e.message) || 'Could not update listing.');
    }
  };

  window.saveProfileBio = async function () {
    const u = refreshUser();
    if (!u) return;
    const bioEl = document.getElementById('profileBio');
    const bio = bioEl ? String(bioEl.value || '').trim().slice(0, 800) : '';
    try {
      if (window.AcctSuiteApi && window.AcctSuiteApi.updateProfile) {
        await window.AcctSuiteApi.updateProfile({ bio });
      }
      u.bio = bio;
      A().persistUser(u);
      if (window.AcctSuiteApiSync && window.AcctSuiteApiSync.hydrateFromApi) {
        try {
          await window.AcctSuiteApiSync.hydrateFromApi();
        } catch (_) {}
      }
      applyProfileChrome(refreshUser() || u);
      toggleProfileBioEdit(false);
      if (window.AcctSuiteToast) window.AcctSuiteToast.success('Bio saved.');
      else alert('Bio saved.');
    } catch (e) {
      alert((e && e.message) || 'Could not save bio.');
    }
  };

  function formatOrderWhen(iso) {
    try {
      const d = new Date(iso);
      if (!d.getTime()) return '';
      const day = d.getDate();
      const j = day % 10;
      const k = day % 100;
      let suf = 'th';
      if (j === 1 && k !== 11) suf = 'st';
      else if (j === 2 && k !== 12) suf = 'nd';
      else if (j === 3 && k !== 13) suf = 'rd';
      const month = d.toLocaleDateString(undefined, { month: 'short' });
      const year = d.getFullYear();
      const time = d.toLocaleTimeString(undefined, {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      });
      return day + suf + ' ' + month + ' ' + year + ', ' + time;
    } catch (e) {
      return relativeTime(iso);
    }
  }

  function orderStatusBadge(status) {
    const s = String(status || '').toLowerCase();
    let cls = 'bg-slate-500/15 text-slate-400';
    if (s === 'completed') cls = 'bg-emerald-500/15 text-emerald-500';
    else if (s === 'pending') cls = 'bg-amber-500/15 text-amber-500';
    else if (s === 'cancelled' || s === 'refunded') cls = 'bg-red-500/15 text-red-400';
    else if (s === 'disputed') cls = 'bg-orange-500/15 text-orange-400';
    return `<span class="text-[10px] font-bold px-2 py-0.5 rounded-full capitalize ${cls}">${escapeHtml(status || '—')}</span>`;
  }

  function orderCardHtml(o, side) {
    const isSeller = side === 'seller';
    const tx = o.txid || o.publicId || displayTxId({ id: o.id, reference: o.publicId });
    const when = formatOrderWhen(o.createdAt);
    const roleLabel = isSeller ? 'Sell' : 'Buy';
    const roleCls = isSeller ? 'text-red-400' : 'text-emerald-500';
    const cat = o.category || o.title || 'Order';
    let logo = '';
    try {
      const prod =
        window.AcctSuiteCatalog &&
        (window.AcctSuiteCatalog.findProduct(cat) || window.AcctSuiteCatalog.findProduct(o.title));
      if (prod && prod.logo) logo = prod.logo;
    } catch (e) {}
    const icon = logo
      ? `<img src="${escapeAttr(logo)}" alt="" class="w-5 h-5 rounded object-cover" onerror="this.style.display='none'">`
      : `<i class="fa-solid fa-box text-slate-400 text-xs"></i>`;
    return `<div class="bg-lightCard dark:bg-darkCard border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 shadow-sm space-y-2.5">
      <div class="flex items-start justify-between gap-2">
        <div class="min-w-0 flex items-center gap-2">
          <span class="text-[11px] font-bold ${roleCls}">${roleLabel}</span>
          ${icon}
          <span class="font-semibold text-sm truncate">${escapeHtml(o.title || cat)}</span>
        </div>
        ${orderStatusBadge(o.status)}${window.CommerceUI ? window.CommerceUI.disputeBadgeHtml(o) : ''}
      </div>
      <div class="flex justify-between gap-2 text-[11px] text-slate-500">
        <p class="font-mono flex items-center gap-1.5 min-w-0">
          <span class="shrink-0">Order No:</span>
          <span class="truncate">${escapeHtml(truncateTxId(tx))}</span>
          <button type="button" onclick="copyTxId('${escapeAttr(tx)}')" class="text-slate-400 hover:text-brandPrimary shrink-0" aria-label="Copy order id"><i class="fa-regular fa-copy"></i></button>
        </p>
        <span class="shrink-0 text-right">${escapeHtml(when)}</span>
      </div>
      <div class="flex items-center justify-between gap-2 pt-0.5">
        <span class="font-extrabold text-base">${money(o.price)}</span>
        <div class="flex items-center gap-3">
          <button type="button" onclick="openOrderDetail('${escapeAttr(String(o.id))}')" class="text-xs font-semibold text-brandPrimary hover:underline">View Order</button>
          <button type="button" onclick="openOrderChat('${escapeAttr(String(o.id))}')" class="w-8 h-8 rounded-full border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-500 hover:border-brandPrimary hover:text-brandPrimary" aria-label="Chat"><i class="fa-regular fa-comment-dots"></i></button>
        </div>
      </div>
    </div>`;
  }

  function filterOrdersList(orders, role, statusFilter, search) {
    let list = (orders || []).filter((o) => (role === 'seller' ? o.role === 'seller' : o.role !== 'seller'));
    if (statusFilter && statusFilter !== 'all') {
      list = list.filter((o) => String(o.status || '').toLowerCase() === statusFilter);
    }
    const q = String(search || '')
      .trim()
      .toLowerCase();
    if (q) {
      list = list.filter((o) => {
        const hay = [o.title, o.category, o.txid, o.publicId, o.status, o.sellerName, o.buyerName]
          .map((x) => String(x || '').toLowerCase())
          .join(' ');
        return hay.indexOf(q) !== -1;
      });
    }
    return list;
  }

  function renderPurchase() {
    const u = refreshUser();
    if (!u) return;
    const box = document.getElementById('purchaseListContainer');
    if (!box) return;
    const orders = filterOrdersList(u.orders, 'buyer', purchaseFilter, purchaseSearch);
    if (!orders.length) {
      box.innerHTML = `<div class="text-center py-12 space-y-2">
        <i class="fa-regular fa-clipboard text-4xl text-slate-300 dark:text-slate-700"></i>
        <p class="font-bold text-sm">No purchases</p>
        <p class="text-xs text-slate-400">Accounts you buy will show here with login details.</p>
        <button onclick="switchTab('market')" class="mt-2 text-xs border border-brandPrimary text-brandPrimary px-4 py-2 rounded-lg">Explore marketplace</button>
      </div>`;
      return;
    }
    box.innerHTML = orders.map((o) => orderCardHtml(o, 'buyer')).join('');
  }

  function renderOrders() {
    const u = refreshUser();
    if (!u) return;
    const box = document.getElementById('ordersListContainer');
    if (!box) return;
    const orders = filterOrdersList(u.orders, 'seller', ordersFilter, ordersSearch);
    if (!orders.length) {
      box.innerHTML = `<div class="text-center py-12 space-y-2">
        <i class="fa-solid fa-bag-shopping text-4xl text-slate-300 dark:text-slate-700"></i>
        <p class="font-bold text-sm">No sales yet</p>
        <p class="text-xs text-slate-400">When buyers purchase your listings, sales appear here.</p>
        <button onclick="openSellProductWizard()" class="mt-2 text-xs border border-brandPrimary text-brandPrimary px-4 py-2 rounded-lg">Sell Product</button>
      </div>`;
      return;
    }
    box.innerHTML = orders.map((o) => orderCardHtml(o, 'seller')).join('');
  }

  function extractNotifRef(n) {
    if (!n) return '';
    if (n.ref != null && String(n.ref).trim()) return String(n.ref).trim();
    if (n.refId != null && String(n.refId).trim()) return String(n.refId).trim();
    if (n.orderId != null && String(n.orderId).trim()) return String(n.orderId).trim();
    if (n.adId != null && String(n.adId).trim()) return String(n.adId).trim();
    const body = String(n.body || '');
    const tx = body.match(/TXID\s+([A-Za-z0-9_-]+)/i);
    if (tx) return tx[1];
    const hash = body.match(/#([A-Za-z0-9-]{8,})/);
    if (hash) return hash[1];
    return '';
  }

  function renderNotifications() {
    const u = refreshUser();
    const box = document.getElementById('notificationsList');
    if (!box || !u) return;
    const notes = u.notifications || [];
    if (!notes.length) {
      box.innerHTML = `<div class="text-center py-16 space-y-2"><i class="fa-regular fa-bell-slash text-3xl text-slate-300"></i><p class="text-sm text-slate-500">No notifications yet</p></div>`;
      return;
    }
    box.innerHTML = notes
      .map((n) => {
        const unread = !n.read;
        const id = escapeAttr(String(n.id));
        return `<div role="button" tabindex="0" onclick="viewNotification('${id}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();viewNotification('${id}');}" class="relative border-l ${unread ? 'border-brandPrimary' : 'border-slate-200 dark:border-slate-700'} pl-2.5 ml-0.5 py-2.5 cursor-pointer hover:bg-slate-50 dark:hover:bg-white/5 rounded-r-lg transition">
      <div class="size-2 rounded-full ${unread ? 'bg-brandPrimary' : 'bg-slate-300 dark:bg-slate-600'} absolute top-3.5 -left-1"></div>
      <div class="flex justify-between gap-2"><p class="font-medium text-sm ${unread ? 'text-slate-900 dark:text-white' : 'text-slate-700 dark:text-slate-200'}">${escapeHtml(n.title)}</p><span class="text-[10px] text-slate-400 shrink-0">${relativeTime(n.createdAt)}</span></div>
      <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">${escapeHtml(n.body)}</p>
      <span class="inline-block mt-1.5 text-xs font-bold text-orange-600 dark:text-orange-400">View</span>
    </div>`;
      })
      .join('');
  }

  window.viewNotification = function (notifId) {
    const u = refreshUser();
    if (!u) {
      if (typeof promptDashSignIn === 'function') promptDashSignIn('You are not logged in. Sign in first.');
      else alert('Sign in to view notifications.');
      return;
    }
    const notes = u.notifications || [];
    const n = notes.find((x) => String(x.id) === String(notifId));
    if (!n) return;

    n.read = true;
    A().persistUser(u);
    applyProfileChrome(u);

    const drawer = document.getElementById('notificationDrawer');
    if (drawer) drawer.classList.add('hidden');

    const type = String(n.type || 'info').toLowerCase();
    const ref = extractNotifRef(n);
    const blob = (n.title || '') + ' ' + (n.body || '');

    const goTab = (tab) => {
      if (typeof switchTab === 'function') switchTab(tab);
    };

    if (type === 'order' || type === 'sale' || type === 'refund' || type === 'dispute' || type === 'review') {
      if (ref && typeof window.openOrderDetail === 'function') {
        window.openOrderDetail(ref);
        return;
      }
      const buyerish = /order placed|purchased|refund received|order completed|dispute resolved/i.test(blob);
      goTab(buyerish ? 'purchase' : 'orders');
      return;
    }

    if (type === 'message') {
      if (ref && typeof window.openOrderChat === 'function') {
        window.openOrderChat(ref);
        return;
      }
      if (ref && typeof window.openOrderDetail === 'function') {
        window.openOrderDetail(ref);
        return;
      }
      goTab('purchase');
      return;
    }

    if (type === 'ad_review') {
      const title = String(n.title || '');
      const isApproved =
        /Product Approved/i.test(title) ||
        /approved|active|live|restocked/i.test(blob);
      const isDenied = /denied/i.test(title) || /denied/i.test(blob);
      const isPending = /under review|pending/i.test(blob) || /Under Review/i.test(title);

      if (isApproved && ref) {
        let live = null;
        try {
          live = typeof A().findListingById === 'function' ? A().findListingById(ref) : null;
        } catch (e) {}
        if (!live) {
          try {
            const list = A().getMarketplaceListings() || [];
            live = list.find((l) => String(l.id) === String(ref)) || null;
          } catch (e) {}
        }
        if (live && typeof window.openListingDetail === 'function') {
          window.openListingDetail(ref);
          return;
        }
        try {
          adsFilter = 'active';
        } catch (e) {}
        goTab('ads');
        if (typeof setAdsFilter === 'function') setAdsFilter('active');
        else renderAds();
        return;
      }

      try {
        if (isDenied) adsFilter = 'denied';
        else if (isPending) adsFilter = 'pending';
        else if (isApproved) adsFilter = 'active';
        else adsFilter = 'all';
      } catch (e) {}
      goTab('ads');
      return;
    }

    if (type === 'wallet' || type === 'deposit' || type === 'withdrawal') {
      goTab('wallet');
      return;
    }

    if (type === 'plan') {
      goTab('plans');
      return;
    }

    if (type === 'support') {
      if (typeof openSupportCenter === 'function') openSupportCenter();
      return;
    }

    if (type === 'kyc') {
      if (typeof toggleRightMenu === 'function') toggleRightMenu();
      return;
    }

    const modalBody = document.getElementById('modalBody');
    if (modalBody) {
      modalBody.innerHTML = `
        <h3 class="font-bold text-lg mb-1">${escapeHtml(n.title || 'Notification')}</h3>
        <p class="text-[10px] text-slate-400 mb-3">${escapeHtml(relativeTime(n.createdAt))}</p>
        <p class="text-sm text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">${escapeHtml(n.body || '')}</p>
        <button type="button" onclick="closeModal()" class="mt-5 w-full py-2.5 rounded-xl text-xs font-bold bg-brandPrimary text-white">Close</button>`;
      if (typeof openModal === 'function') openModal();
      else {
        const m = document.getElementById('appModal');
        if (m) {
          m.classList.remove('hidden');
          m.classList.add('flex');
        }
      }
    }
  };

  function renderPlans() {
    const u = refreshUser();
    const box = document.getElementById('plansListContainer');
    if (!box || !u) return;
    const plans = A().PLANS;
    const freePlan = plans.free || Object.values(plans).find((p) => !p.price);
    const sub = document.getElementById('plansPageSubtitle');
    if (sub && freePlan) {
      sub.textContent =
        'New accounts start on Free — ' +
        freePlan.dailyUploads +
        ' uploads per day. Paid plans unlock higher daily upload limits via Flutterwave or wallet.';
    }
    const bal = Number(u.balance) || 0;
    box.innerHTML = Object.values(plans)
      .map((p) => {
        const active = u.plan === p.id;
        const price = Number(p.price) || 0;
        const canWallet = price > 0 && bal + 0.0001 >= price;
        let actions = '';
        if (active) {
          actions =
            '<button disabled class="w-full py-2.5 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-400">Active plan</button>';
        } else if (!price) {
          actions = `<button onclick="selectPlan('${p.id}')" class="w-full py-2.5 rounded-xl text-xs font-bold bg-brandPrimary text-white hover:bg-brandHover">Use Free plan</button>`;
        } else {
          actions = `<button onclick="selectPlan('${p.id}','flutterwave')" class="w-full py-2.5 rounded-xl text-xs font-bold bg-brandPrimary text-white hover:bg-brandHover">Pay now</button>`;
          if (canWallet) {
            actions += `<button onclick="selectPlan('${p.id}','wallet')" class="w-full mt-2 py-2.5 rounded-xl text-xs font-bold border border-brandPrimary text-brandPrimary hover:bg-brandPrimary/10">Pay from wallet (${money(bal)} available)</button>`;
          } else {
            actions += `<p class="text-[10px] text-slate-400 text-center mt-2">Or deposit to wallet, then upgrade from balance.</p>`;
          }
        }
        return `<div class="bg-lightCard dark:bg-darkCard border ${active ? 'border-brandPrimary' : 'border-slate-200 dark:border-slate-800'} rounded-2xl p-4 shadow-sm space-y-3">
        <div class="flex justify-between items-center">
          <h3 class="font-bold">${escapeHtml(p.name)}</h3>
          ${active ? '<span class="text-[10px] bg-brandPrimary/15 text-brandPrimary px-2 py-0.5 rounded-full font-bold">CURRENT</span>' : ''}
        </div>
        <p class="text-2xl font-extrabold text-brandPrimary">${price ? money(price) + '<span class="text-xs text-slate-400 font-medium">/mo</span>' : 'Free'}</p>
        <ul class="text-xs text-slate-500 space-y-1">
          <li><i class="fa-solid fa-check text-emerald-500 mr-1"></i><strong class="text-slate-700 dark:text-slate-200">${p.dailyUploads} uploads / day</strong></li>
          <li><i class="fa-solid fa-check text-emerald-500 mr-1"></i>${escapeHtml(p.approval)}</li>
          <li><i class="fa-solid fa-check text-emerald-500 mr-1"></i>AI link & credential review</li>
        </ul>
        ${actions}
      </div>`;
      })
      .join('');
  }

  let walletHistTab = 'deposit';
  let walletBalanceHidden = false;
  let depositChannel = 'local'; // local | crypto
  let depositCurrency = 'NGN';
  let depositNetwork = '';
  let withdrawMethodCard = 'bank'; // bank | crypto
  let withdrawCurrency = 'NGN';
  let withdrawCryptoCoin = 'USDT';
  let withdrawNetwork = '';

  function defaultCurrencies() {
    return {
      local: [
        { code: 'NGN', name: 'Nigeria', flag: 'ng', rate: 1600, enabled: true },
        { code: 'GHS', name: 'Ghana', flag: 'gh', rate: 15, enabled: true },
        { code: 'KES', name: 'Kenya', flag: 'ke', rate: 130, enabled: true },
        { code: 'ZAR', name: 'South Africa', flag: 'za', rate: 18, enabled: true },
        { code: 'XAF', name: 'Central Africa', flag: 'cm', rate: 600, enabled: true },
        { code: 'XOF', name: 'West Africa', flag: 'sn', rate: 600, enabled: true },
      ],
      crypto: [
        { code: 'USDT', name: 'Tether', networks: ['TRC20', 'BEP20', 'ERC20'], addresses: {}, enabled: true },
        { code: 'BTC', name: 'Bitcoin', networks: ['BTC'], addresses: {}, enabled: true },
        { code: 'ETH', name: 'Ethereum', networks: ['ERC20'], addresses: {}, enabled: true },
        { code: 'USDC', name: 'USD Coin', networks: ['ERC20', 'BEP20'], addresses: {}, enabled: true },
        { code: 'BNB', name: 'BNB', networks: ['BEP20'], addresses: {}, enabled: true },
        { code: 'TRX', name: 'Tron', networks: ['TRC20'], addresses: {}, enabled: true },
        { code: 'LTC', name: 'Litecoin', networks: ['LTC'], addresses: {}, enabled: true },
        { code: 'SOL', name: 'Solana', networks: ['SOL'], addresses: {}, enabled: true },
      ],
    };
  }

  function walletCurrencies() {
    const c = (A().CONFIG && A().CONFIG.walletCurrencies) || {};
    const d = defaultCurrencies();
    return {
      local: Array.isArray(c.local) && c.local.length ? c.local : d.local,
      crypto: Array.isArray(c.crypto) && c.crypto.length ? c.crypto : d.crypto,
    };
  }

  function cryptoCoinByCode(code) {
    return walletCurrencies().crypto.find((c) => c.code === code && c.enabled !== false) || null;
  }

  function cryptoNetworksWithAddress(coin) {
    if (!coin) return [];
    const addrs = coin.addresses || {};
    const nets = Array.isArray(coin.networks) ? coin.networks : Object.keys(addrs);
    return nets
      .map((n) => String(n || '').toUpperCase())
      .filter((n) => n && String(addrs[n] || '').trim());
  }

  function cryptoAddressFor(coinCode, network) {
    const coin = cryptoCoinByCode(coinCode);
    if (!coin) return '';
    const addrs = coin.addresses || {};
    const net = String(network || '').toUpperCase();
    return String(addrs[net] || '').trim();
  }

  function flagImg(code) {
    if (!code) return '';
    return `<img src="https://flagcdn.com/w40/${escapeAttr(code)}.png" alt="" class="w-5 h-5 rounded-full object-cover inline-block">`;
  }

  function formatTxWhen(iso) {
    try {
      const d = new Date(iso);
      if (!d.getTime()) return relativeTime(iso);
      const day = d.getDate();
      const ord = (function (n) {
        const j = n % 10;
        const k = n % 100;
        if (j === 1 && k !== 11) return n + 'st';
        if (j === 2 && k !== 12) return n + 'nd';
        if (j === 3 && k !== 13) return n + 'rd';
        return n + 'th';
      })(day);
      const weekday = d.toLocaleDateString(undefined, { weekday: 'long' });
      const month = d.toLocaleDateString(undefined, { month: 'long' });
      const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
      return weekday + ', ' + month + ' ' + ord + ', ' + time;
    } catch (e) {
      return relativeTime(iso);
    }
  }

  function statusDot(status) {
    const s = String(status || '').toLowerCase();
    if (s === 'completed') {
      return '<span class="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-500"><span class="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0"></span>Completed</span>';
    }
    if (s === 'pending') {
      return '<span class="inline-flex items-center gap-1.5 text-[11px] font-semibold text-amber-500"><span class="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0"></span>Pending</span>';
    }
    if (s === 'failed') {
      return '<span class="inline-flex items-center gap-1.5 text-[11px] font-semibold text-red-500"><span class="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0"></span>Failed</span>';
    }
    if (s === 'cancelled' || s === 'canceled') {
      return '<span class="inline-flex items-center gap-1.5 text-[11px] font-semibold text-red-500"><span class="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0"></span>Cancelled</span>';
    }
    return '<span class="text-[11px] text-slate-400 capitalize">' + escapeHtml(status || '') + '</span>';
  }

  function displayTxId(t) {
    const ref = String((t && (t.txid || t.publicId || t.reference)) || '').trim();
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}$/i.test(ref)) return ref.toLowerCase();
    const seed = String((t && t.id) || ref || '0');
    let h = 0;
    for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
    const hex = (h.toString(16) + Math.abs(h * 2654435761).toString(16) + '00000000000000000000').slice(0, 20);
    return hex.slice(0, 8) + '-' + hex.slice(8, 12) + '-' + hex.slice(12, 16) + '-' + hex.slice(16, 20);
  }

  function truncateTxId(id) {
    const s = String(id || '');
    if (s.length <= 14) return s;
    return s.slice(0, 10) + '…';
  }

  function txTypeMeta(t) {
    const ty = String((t && t.type) || '').toLowerCase();
    if (ty === 'deposit') {
      const from =
        t.method === 'flutterwave'
          ? 'From Flutterwave'
          : t.method === 'crypto'
            ? 'From crypto'
            : 'From bank';
      return {
        title: 'Deposit',
        sub: from,
        icon: 'fa-arrow-down',
        iconCls: 'bg-emerald-500/15 text-emerald-500',
        amountCls: 'text-emerald-500',
        sign: '+',
      };
    }
    if (ty === 'withdrawal' || ty === 'withdraw') {
      return {
        title: 'Withdrawal',
        sub: t.method === 'crypto' ? 'To crypto' : 'To bank',
        icon: 'fa-arrow-up',
        iconCls: 'bg-rose-500/15 text-rose-400',
        amountCls: 'text-rose-400',
        sign: '-',
      };
    }
    if (ty === 'purchase') {
      return {
        title: 'Purchase',
        sub: t.note || 'Marketplace purchase',
        icon: 'fa-bag-shopping',
        iconCls: 'bg-brandPrimary/15 text-brandPrimary',
        amountCls: 'text-rose-400',
        sign: '-',
      };
    }
    if (ty === 'sale') {
      return {
        title: 'Sale',
        sub: t.note || 'Marketplace sale',
        icon: 'fa-store',
        iconCls: 'bg-emerald-500/15 text-emerald-500',
        amountCls: 'text-emerald-500',
        sign: '+',
      };
    }
    if (ty === 'refund') {
      return {
        title: 'Refund',
        sub: t.note || 'Order refund',
        icon: 'fa-rotate-left',
        iconCls: 'bg-amber-500/15 text-amber-500',
        amountCls: 'text-emerald-500',
        sign: '+',
      };
    }
    if (ty === 'commission') {
      return {
        title: 'Commission',
        sub: t.note || 'Platform fee',
        icon: 'fa-percent',
        iconCls: 'bg-slate-500/15 text-slate-400',
        amountCls: 'text-rose-400',
        sign: '-',
      };
    }
    if (ty === 'plan') {
      return {
        title: 'Plan',
        sub: t.note || 'Plan upgrade',
        icon: 'fa-crown',
        iconCls: 'bg-brandPrimary/15 text-brandPrimary',
        amountCls: 'text-rose-400',
        sign: '-',
      };
    }
    return {
      title: ty ? ty.charAt(0).toUpperCase() + ty.slice(1) : 'Transaction',
      sub: t.note || t.method || 'Wallet activity',
      icon: 'fa-receipt',
      iconCls: 'bg-slate-500/15 text-slate-400',
      amountCls: 'text-slate-200',
      sign: '',
    };
  }

  window.toggleWalletBalanceVisibility = function () {
    walletBalanceHidden = !walletBalanceHidden;
    const el = document.getElementById('walletBalanceDisplay');
    const icon = document.getElementById('walletEyeIcon');
    const u = refreshUser();
    if (!el) return;
    if (walletBalanceHidden) {
      el.textContent = '••••';
      if (icon) icon.className = 'fa-regular fa-eye-slash';
    } else {
      el.textContent = money(u ? u.balance : 0);
      if (icon) icon.className = 'fa-regular fa-eye';
    }
  };

  window.setWalletHistoryTab = function (tab) {
    const allowed = { deposit: 1, withdrawal: 1, others: 1, all: 1 };
    walletHistTab = allowed[tab] ? tab : 'deposit';
    document.querySelectorAll('.wallet-hist-tab').forEach((b) => {
      const on = b.getAttribute('data-wallet-hist') === walletHistTab;
      b.classList.toggle('text-brandPrimary', on);
      b.classList.toggle('border-b-2', on);
      b.classList.toggle('border-brandPrimary', on);
      b.classList.toggle('font-bold', on);
      b.classList.toggle('text-slate-400', !on);
      b.classList.toggle('font-semibold', !on);
    });
    renderTxHistory();
  };

  function renderTxHistory() {
    const u = refreshUser();
    const box = document.getElementById('txHistoryList');
    if (!box || !u) return;
    const tab = walletHistTab || 'deposit';
    const txs = (u.transactions || []).filter((t) => {
      const ty = String(t.type || '').toLowerCase();
      if (tab === 'all') return true;
      if (tab === 'deposit') return ty === 'deposit';
      if (tab === 'withdrawal') return ty === 'withdrawal' || ty === 'withdraw';
      return ty !== 'deposit' && ty !== 'withdrawal' && ty !== 'withdraw';
    });
    const emptyLabel =
      tab === 'deposit' ? 'deposits' : tab === 'withdrawal' ? 'withdrawals' : tab === 'others' ? 'other transactions' : 'transactions';
    if (!txs.length) {
      box.innerHTML =
        '<div class="bg-lightCard dark:bg-darkCard border border-slate-200 dark:border-slate-800 rounded-xl py-10 text-center text-xs text-slate-400">No ' +
        emptyLabel +
        ' yet.</div>';
      return;
    }
    box.innerHTML = txs
      .map((t) => {
        const meta = txTypeMeta(t);
        const txid = displayTxId(t);
        const shortId = truncateTxId(txid);
        const openId = escapeAttr(String(t.id || txid));
        const copyId = escapeAttr(txid);
        return (
          '<button type="button" onclick="openTxDetail(\'' +
          openId +
          '\')" class="w-full text-left bg-lightCard dark:bg-darkCard border border-slate-200 dark:border-slate-800 rounded-2xl p-3.5 hover:border-brandPrimary transition">' +
          '<div class="flex gap-3 items-start">' +
          '<span class="w-11 h-11 rounded-full flex items-center justify-center shrink-0 ' +
          meta.iconCls +
          '"><i class="fa-solid ' +
          meta.icon +
          '"></i></span>' +
          '<div class="min-w-0 flex-1 space-y-1">' +
          '<div class="flex justify-between gap-3 items-start">' +
          '<p class="font-bold text-[15px] text-slate-900 dark:text-white leading-tight">' +
          escapeHtml(meta.title) +
          '</p>' +
          '<p class="font-bold text-[15px] shrink-0 ' +
          meta.amountCls +
          '">' +
          meta.sign +
          money(t.amount) +
          '</p>' +
          '</div>' +
          '<div class="flex justify-between gap-3 items-center">' +
          '<p class="text-[12px] text-slate-500 dark:text-slate-400 truncate">' +
          escapeHtml(meta.sub) +
          '</p>' +
          statusDot(t.status) +
          '</div>' +
          '<div class="flex justify-between gap-3 items-center pt-0.5">' +
          '<p class="text-[11px] text-slate-400 font-mono flex items-center gap-1.5 min-w-0">' +
          '<span class="truncate">TXID: ' +
          escapeHtml(shortId) +
          '</span>' +
          '<span role="button" tabindex="0" onclick="event.stopPropagation(); copyTxId(\'' +
          copyId +
          '\')" class="shrink-0 text-slate-500 hover:text-brandPrimary"><i class="fa-regular fa-copy"></i></span>' +
          '</p>' +
          '<p class="text-[11px] text-slate-400 shrink-0 text-right">' +
          escapeHtml(formatTxWhen(t.createdAt)) +
          '</p>' +
          '</div>' +
          '</div>' +
          '</div>' +
          '</button>'
        );
      })
      .join('');
  }

  window.copyTxId = function (id) {
    const text = String(id || '');
    if (!text) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(
        function () {
          alert('TXID copied');
        },
        function () {
          prompt('Copy TXID', text);
        }
      );
    } else {
      prompt('Copy TXID', text);
    }
  };

  window.openTxDetail = function (id) {
    const u = refreshUser();
    const t = (u.transactions || []).find(
      (x) =>
        String(x.id) === String(id) ||
        String(x.reference) === String(id) ||
        String(x.publicId) === String(id) ||
        String(x.txid) === String(id)
    );
    if (!t) return;
    const meta = txTypeMeta(t);
    const txid = displayTxId(t);
    document.getElementById('modalBody').innerHTML = `
      <h3 class="font-bold text-lg mb-3">${escapeHtml(meta.title)} details</h3>
      <div class="space-y-2 text-sm mb-4">
        <div class="flex justify-between"><span class="text-slate-500">Amount</span><span class="font-bold ${meta.amountCls}">${meta.sign}${money(t.amount)}</span></div>
        <div class="flex justify-between"><span class="text-slate-500">Status</span><span>${statusDot(t.status)}</span></div>
        <div class="flex justify-between gap-3"><span class="text-slate-500 shrink-0">TXID</span>
          <span class="font-mono text-[11px] text-right break-all">${escapeHtml(txid)}
            <button type="button" onclick="copyTxId('${escapeAttr(txid)}')" class="ml-1 text-slate-500"><i class="fa-regular fa-copy"></i></button>
          </span>
        </div>
        <div class="flex justify-between"><span class="text-slate-500">Source</span><span class="text-right text-xs">${escapeHtml(meta.sub)}</span></div>
        <div class="flex justify-between"><span class="text-slate-500">When</span><span class="text-right text-xs">${escapeHtml(formatTxWhen(t.createdAt))}</span></div>
        ${t.note ? `<p class="text-xs text-slate-500 pt-2 border-t border-slate-200 dark:border-slate-800">${escapeHtml(t.note)}</p>` : ''}
      </div>
      <button onclick="closeModal()" class="w-full bg-brandPrimary text-white py-3 rounded-xl font-bold text-sm">Close</button>`;
    (function(){var m=document.getElementById('appModal'); if(!m)return; m.classList.remove('hidden'); m.classList.add('flex');})();
  };

  function currencySymbol(code) {
    const map = { NGN: '₦', GHS: 'GH₵', KES: 'KSh', ZAR: 'R', XAF: 'CFA ', XOF: 'CFA ', USD: '$', GBP: '£' };
    return map[code] || code + ' ';
  }

  function countryToCurrency(cc) {
    const map = {
      ng: 'NGN', gh: 'GHS', ke: 'KES', za: 'ZAR',
      cm: 'XAF', td: 'XAF', cg: 'XAF', ga: 'XAF',
      sn: 'XOF', ci: 'XOF', bj: 'XOF', tg: 'XOF', bf: 'XOF', ml: 'XOF',
      us: 'USD', gb: 'GBP',
    };
    return map[String(cc || '').toLowerCase()] || 'NGN';
  }

  function preferredLocalCurrency(user) {
    const cur = walletCurrencies().local.filter((c) => c.enabled !== false);
    if (user && user.payoutCurrency) {
      const hit = cur.find((c) => c.code === user.payoutCurrency);
      if (hit) return hit.code;
    }
    const fromCountry = countryToCurrency(user && user.countryCode);
    if (cur.find((c) => c.code === fromCountry)) return fromCountry;
    return (cur[0] || { code: 'NGN' }).code;
  }

  function localConvertLine(usdAmount, code) {
    const cur = walletCurrencies().local.find((c) => c.code === code);
    const rate = Number((cur && cur.rate) || (A().CONFIG && A().CONFIG.usdNgnRate) || 1600);
    const sym = currencySymbol(code);
    const usd = Number(usdAmount) || 0;
    if (usd <= 0) return '';
    return `≈ ${sym}${Math.round(usd * rate).toLocaleString()}`;
  }

  // -------- Wallet --------
  window.openWalletModal = function (type) {
    if (type === 'deposit') openDepositFlow();
    else openWithdrawFlow();
  };

  function openWalletFlow(title, subtitle, html) {
    const overlay = document.getElementById('walletFlowOverlay');
    const body = document.getElementById('walletFlowBody');
    const t = document.getElementById('walletFlowTitle');
    const s = document.getElementById('walletFlowSubtitle');
    if (!overlay || !body) return;
    if (t) t.textContent = title || 'Wallet';
    if (s) s.textContent = subtitle || 'Back to wallet';
    body.innerHTML = html;
    overlay.classList.remove('hidden');
    overlay.classList.add('flex');
    // Hide main modal if open
    const modal = document.getElementById('appModal');
    if (modal) { modal.classList.add('hidden'); modal.classList.remove('flex'); }
    try {
      body.scrollTop = 0;
    } catch (e) {}
  }

  window.closeWalletFlow = function () {
    const overlay = document.getElementById('walletFlowOverlay');
    if (!overlay) return;
    overlay.classList.add('hidden');
    overlay.classList.remove('flex');
    const body = document.getElementById('walletFlowBody');
    if (body) body.innerHTML = '';
    try {
      if (typeof switchTab === 'function') switchTab('wallet');
    } catch (e) {}
  };

  function openDepositFlow() {
    const cfg = A().CONFIG;
    const cur = walletCurrencies();
    const u = refreshUser() || {};
    depositChannel = 'local';
    depositNetwork = '';
    depositCurrency = preferredLocalCurrency(u);
    if (!cur.local.find((c) => c.code === depositCurrency && c.enabled !== false)) {
      depositCurrency = (cur.local.find((c) => c.enabled !== false) || { code: 'NGN' }).code;
    }
    openWalletFlow(
      'Add Funds',
      'Back to wallet',
      `
      <div class="space-y-4 max-w-md mx-auto">
        <div class="flex items-center gap-3">
          <span class="w-10 h-10 rounded-xl bg-brandPrimary/15 text-brandPrimary flex items-center justify-center"><i class="fa-solid fa-wallet"></i></span>
          <div>
            <h3 class="font-bold text-lg tracking-tight">Add Funds</h3>
            <p class="text-xs text-slate-500">Fund your wallet securely</p>
          </div>
        </div>
        <div class="grid grid-cols-2 gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <button type="button" id="depChLocal" onclick="setDepositChannel('local')" class="py-2.5 rounded-lg text-xs font-bold bg-slate-900 dark:bg-slate-800 text-white"><i class="fa-solid fa-building-columns mr-1"></i> Local</button>
          <button type="button" id="depChCrypto" onclick="setDepositChannel('crypto')" class="py-2.5 rounded-lg text-xs font-semibold text-slate-500"><i class="fa-brands fa-bitcoin mr-1"></i> Crypto</button>
        </div>
        <div>
          <div class="flex justify-between text-[11px] text-slate-500 mb-2"><span>Select currency</span><span>One currency per deposit</span></div>
          <div id="depositCurrencyGrid" class="grid grid-cols-3 gap-2"></div>
        </div>
        <div id="depositCryptoPanel" class="hidden space-y-3">
          <div>
            <label class="text-[11px] text-slate-500 mb-1 block">Network</label>
            <select id="depositNetworkSelect" onchange="onDepositNetworkChange()" class="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 text-sm"></select>
          </div>
          <div id="depositAddressBox" class="rounded-xl border border-brandPrimary/40 bg-brandPrimary/5 p-3 space-y-2 hidden">
            <p class="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">Send only to this address</p>
            <p id="depositAddressText" class="font-mono text-xs break-all text-slate-800 dark:text-slate-100"></p>
            <button type="button" onclick="copyDepositAddress()" class="text-[11px] font-bold text-brandPrimary"><i class="fa-regular fa-copy mr-1"></i>Copy address</button>
            <p id="depositAddressWarn" class="text-[10px] text-amber-600 hidden">No wallet is available at the moment.</p>
          </div>
          <div>
            <label class="text-[11px] text-slate-500 mb-1 block">Transaction hash (optional)</label>
            <input id="depositTxHash" type="text" placeholder="Paste txid after you send" class="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 text-sm font-mono">
          </div>
        </div>
        <div>
          <label class="text-xs font-semibold mb-1 block">Amount (USD credit)</label>
          <div class="border border-slate-200 dark:border-slate-800 rounded-2xl p-3 bg-white dark:bg-slate-900">
            <div class="relative"><span class="absolute left-0 top-1 text-slate-400 font-bold text-xl">$</span>
            <input id="walletAmountInput" type="number" min="${cfg.minDeposit}" step="0.01" placeholder="0" oninput="updateDepositRateHint()" class="w-full bg-transparent pl-6 pr-2 py-1 text-2xl font-extrabold focus:outline-none"></div>
            <p id="depositLocalConvert" class="text-sm text-slate-400 mt-1 min-h-[1.25rem]"></p>
          </div>
          <p id="depositNairaHint" class="text-xs text-brandPrimary font-semibold mt-2"></p>
          <p class="text-[11px] text-slate-400 mt-1">Min deposit ${money(cfg.minDeposit)}</p>
        </div>
        <div class="border border-brandPrimary/40 rounded-xl p-3 text-[11px] text-slate-500 flex gap-2 items-start">
          <i class="fa-solid fa-shield-halved text-brandPrimary mt-0.5"></i>
          <span id="depositTrustCopy">Secured and Trusted: Your funds are protected and processed through a licensed payment partner.</span>
        </div>
        <button id="depositSubmitBtn" onclick="submitWalletAction('deposit')" class="w-full bg-brandPrimary hover:bg-brandHover text-white py-3.5 rounded-xl font-bold text-sm shadow-md">Continue to payment</button>
        <p id="depositRedirectHint" class="text-[10px] text-center text-slate-400"><i class="fa-solid fa-lock mr-1"></i>You will be redirected to a secure service provider</p>
      </div>`
    );
    renderDepositCurrencyGrid();
    updateDepositRateHint();
    refreshDepositCryptoPanel();
  }

  window.setDepositChannel = function (ch) {
    depositChannel = ch === 'crypto' ? 'crypto' : 'local';
    const localBtn = document.getElementById('depChLocal');
    const cryptoBtn = document.getElementById('depChCrypto');
    if (localBtn && cryptoBtn) {
      const onLocal = depositChannel === 'local';
      localBtn.className = 'py-2.5 rounded-lg text-xs font-bold ' + (onLocal ? 'bg-slate-900 dark:bg-slate-800 text-white' : 'text-slate-500 font-semibold');
      cryptoBtn.className = 'py-2.5 rounded-lg text-xs font-bold ' + (!onLocal ? 'bg-slate-900 dark:bg-slate-800 text-white' : 'text-slate-500 font-semibold');
      localBtn.innerHTML = '<i class="fa-solid fa-building-columns mr-1"></i> Local';
      cryptoBtn.innerHTML = '<i class="fa-brands fa-bitcoin mr-1"></i> Crypto';
    }
    const cur = walletCurrencies();
    const u = refreshUser() || {};
    if (depositChannel === 'local') {
      depositCurrency = preferredLocalCurrency(u);
      depositNetwork = '';
    } else {
      const cryptoReady = cur.crypto.filter((c) => c.enabled !== false && cryptoNetworksWithAddress(c).length);
      depositCurrency = (cryptoReady[0] || cur.crypto.find((c) => c.enabled !== false) || { code: 'USDT' }).code;
      const nets = cryptoNetworksWithAddress(cryptoCoinByCode(depositCurrency));
      depositNetwork = nets[0] || '';
    }
    renderDepositCurrencyGrid();
    refreshDepositCryptoPanel();
    updateDepositRateHint();
  };

  function renderDepositCurrencyGrid() {
    const box = document.getElementById('depositCurrencyGrid');
    if (!box) return;
    const cur = walletCurrencies();
    if (depositChannel === 'crypto') {
      const list = cur.crypto.filter((c) => c.enabled !== false);
      box.innerHTML = list
        .map((c) => {
          const ready = cryptoNetworksWithAddress(c).length > 0;
          return `<button type="button" onclick="selectDepositCurrency('${escapeAttr(c.code)}')" class="dep-cur rounded-xl border p-3 text-center text-xs font-bold transition ${depositCurrency === c.code ? 'border-brandPrimary bg-brandPrimary/10 text-brandPrimary' : 'border-slate-200 dark:border-slate-800'} ${ready ? '' : 'opacity-50'}">
          <div class="text-lg mb-1">${c.code === 'BTC' ? '₿' : c.code === 'ETH' ? 'Ξ' : '◎'}</div>${escapeHtml(c.code)}
          ${ready ? '' : '<p class="text-[9px] font-normal text-amber-500 mt-1">Unavailable</p>'}
        </button>`;
        })
        .join('');
      return;
    }
    const list = cur.local.filter((c) => c.enabled !== false);
    box.innerHTML = list
      .map(
        (c) => `<button type="button" onclick="selectDepositCurrency('${escapeAttr(c.code)}')" class="dep-cur rounded-xl border px-2 py-3 flex items-center justify-center gap-1.5 text-xs font-bold transition ${depositCurrency === c.code ? 'border-brandPrimary bg-brandPrimary/10 text-brandPrimary' : 'border-slate-200 dark:border-slate-800'}">
        ${flagImg(c.flag)} ${escapeHtml(c.code)}
      </button>`
      )
      .join('');
  }

  function refreshDepositCryptoPanel() {
    const panel = document.getElementById('depositCryptoPanel');
    const btn = document.getElementById('depositSubmitBtn');
    const hint = document.getElementById('depositRedirectHint');
    const trust = document.getElementById('depositTrustCopy');
    const isCrypto = depositChannel === 'crypto';
    if (panel) panel.classList.toggle('hidden', !isCrypto);
    if (btn) btn.textContent = isCrypto ? "I've sent payment — submit for review" : 'Continue to payment';
    if (hint) {
      hint.innerHTML = isCrypto
        ? '<i class="fa-solid fa-clock mr-1"></i>Wallet credits after your on-chain payment is confirmed'
        : '<i class="fa-solid fa-lock mr-1"></i>You will be redirected to a secure service provider';
    }
    if (trust) {
      trust.textContent = isCrypto
        ? 'Copy the address below, send the correct coin/network, then submit. Do not send to any other address.'
        : 'Secured and Trusted: Your funds are protected and processed through a licensed payment partner.';
    }
    if (!isCrypto) return;
    const sel = document.getElementById('depositNetworkSelect');
    const coin = cryptoCoinByCode(depositCurrency);
    const nets = cryptoNetworksWithAddress(coin);
    const allNets = ((coin && coin.networks) || []).map((n) => String(n).toUpperCase());
    if (sel) {
      const options = (nets.length ? nets : allNets).map(
        (n) => `<option value="${escapeAttr(n)}" ${depositNetwork === n ? 'selected' : ''}>${escapeHtml(n)}${nets.indexOf(n) === -1 ? ' (unavailable)' : ''}</option>`
      );
      sel.innerHTML = options.length
        ? options.join('')
        : '<option value="">No networks available</option>';
      if (!depositNetwork && nets[0]) depositNetwork = nets[0];
      if (depositNetwork) sel.value = depositNetwork;
    }
    updateDepositAddressBox();
  }

  function updateDepositAddressBox() {
    const box = document.getElementById('depositAddressBox');
    const text = document.getElementById('depositAddressText');
    const warn = document.getElementById('depositAddressWarn');
    if (!box) return;
    box.classList.remove('hidden');
    const addr = cryptoAddressFor(depositCurrency, depositNetwork);
    if (text) text.textContent = addr || '—';
    if (warn) warn.classList.toggle('hidden', !!addr);
  }

  window.onDepositNetworkChange = function () {
    const sel = document.getElementById('depositNetworkSelect');
    depositNetwork = sel ? String(sel.value || '').toUpperCase() : '';
    updateDepositAddressBox();
  };

  window.copyDepositAddress = async function () {
    const addr = cryptoAddressFor(depositCurrency, depositNetwork);
    if (!addr) {
      alert('No wallet is available at the moment.');
      return;
    }
    try {
      await navigator.clipboard.writeText(addr);
      alert('Address copied');
    } catch (e) {
      prompt('Copy this address:', addr);
    }
  };

  window.selectDepositCurrency = function (code) {
    depositCurrency = code;
    if (depositChannel === 'crypto') {
      const nets = cryptoNetworksWithAddress(cryptoCoinByCode(code));
      depositNetwork = nets[0] || '';
    }
    renderDepositCurrencyGrid();
    refreshDepositCryptoPanel();
    updateDepositRateHint();
  };

  window.updateDepositRateHint = function () {
    const el = document.getElementById('depositNairaHint');
    const convertEl = document.getElementById('depositLocalConvert');
    const input = document.getElementById('walletAmountInput');
    if (!input) return;
    const usd = parseFloat(input.value) || 0;
    if (depositChannel === 'crypto') {
      const addr = cryptoAddressFor(depositCurrency, depositNetwork);
      if (el) {
        el.textContent = addr
          ? 'Send ' + depositCurrency + ' on ' + (depositNetwork || 'selected network') + ' to the address above, then submit for review. Min $' + money(A().CONFIG.minDeposit).replace('$', '')
          : 'Wallet unavailable for this coin/network right now.';
      }
      if (convertEl) convertEl.textContent = usd > 0 ? 'Requesting $' + usd.toFixed(2) + ' wallet credit' : '';
      return;
    }
    const cur = walletCurrencies().local.find((c) => c.code === depositCurrency);
    const rate = Number((cur && cur.rate) || (A().CONFIG && A().CONFIG.usdNgnRate) || 1600);
    const symbol = currencySymbol(depositCurrency);
    if (convertEl) convertEl.textContent = localConvertLine(usd, depositCurrency);
    if (el) {
      if (usd <= 0) el.textContent = `$1 ≈ ${symbol}${rate.toLocaleString()}`;
      else el.textContent = `You will pay about ${symbol}${Math.round(usd * rate).toLocaleString()} · wallet credits $${usd.toFixed(2)}`;
    }
  };

  function openWithdrawFlow() {
    const cfg = A().CONFIG;
    const u = refreshUser() || {};
    const bal = money(u.withdrawableBalance != null ? u.withdrawableBalance : 0);
    const walletBal = money(u.balance);
    const cur = walletCurrencies();
    const locked = !!u.payoutBankLocked;
    withdrawMethodCard = 'bank';
    withdrawCurrency = preferredLocalCurrency(u);
    if (!cur.local.find((c) => c.code === withdrawCurrency && c.enabled !== false)) {
      withdrawCurrency = (cur.local.find((c) => c.enabled !== false) || { code: 'NGN' }).code;
    }
    const bankFields = locked
      ? `<div id="wdFieldsBankLocked" class="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-2">
          <div class="flex items-center justify-between">
            <p class="text-xs font-bold">Bank Details</p>
            <span class="text-[10px] text-amber-500 font-semibold"><i class="fa-solid fa-lock mr-1"></i>Locked</span>
          </div>
          <div class="rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 p-3 text-sm space-y-1">
            <p><span class="text-slate-500 text-[11px]">Bank</span><br><span class="font-semibold">${escapeHtml(u.payoutBank || '—')}</span></p>
            <p><span class="text-slate-500 text-[11px]">Account number</span><br><span class="font-semibold">${escapeHtml(u.payoutAccount || '—')}</span></p>
            <p><span class="text-slate-500 text-[11px]">Account name</span><br><span class="font-semibold">${escapeHtml(u.payoutAccountName || '—')}</span></p>
          </div>
        </div>`
      : `<div id="wdFieldsBank" class="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-2">
          <p class="text-xs font-bold">Bank Details</p>
          <div class="relative">
            <label class="text-[11px] text-slate-500">Select bank <span class="text-red-500">*</span></label>
            <input type="hidden" id="withdrawBankCode" value="${escapeAttr(u.payoutBankCode || '')}">
            <input type="hidden" id="withdrawBank" value="${escapeAttr(u.payoutBank || '')}">
            <div class="mt-1 relative">
              <i class="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs pointer-events-none"></i>
              <input id="withdrawBankSearch" type="search" autocomplete="off" placeholder="Search bank…" value="${escapeAttr(u.payoutBank || '')}" class="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl pl-9 pr-3 py-3 text-sm focus:outline-none focus:border-brandPrimary">
            </div>
            <div id="withdrawBankList" class="hidden absolute z-30 left-0 right-0 mt-1 max-h-56 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg"></div>
          </div>
          <div><label class="text-[11px] text-slate-500">Account number <span class="text-red-500">*</span></label><input id="withdrawDest" type="text" inputmode="numeric" value="${escapeAttr(u.payoutAccount || '')}" placeholder="Enter account number" class="mt-1 w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 text-sm"></div>
          <div><label class="text-[11px] text-slate-500">Account name <span class="text-red-500">*</span></label><input id="withdrawName" type="text" value="${escapeAttr(u.payoutAccountName || '')}" placeholder="Account name" class="mt-1 w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 text-sm"></div>
        </div>`;

    openWalletFlow(
      'Withdraw Funds',
      'Back to wallet',
      `
      <div class="space-y-4 max-w-md mx-auto">
        <div class="flex items-center gap-3">
          <span class="w-10 h-10 rounded-xl bg-brandPrimary/15 text-brandPrimary flex items-center justify-center"><i class="fa-solid fa-wallet"></i></span>
          <div>
            <h3 class="font-bold text-lg tracking-tight">Withdraw Funds</h3>
            <p class="text-xs text-slate-500">Send funds from your wallet</p>
          </div>
        </div>
        <div>
          <p class="text-xs font-bold mb-2">Enter Amount</p>
          <div class="border border-slate-200 dark:border-slate-800 rounded-2xl p-3 bg-white dark:bg-slate-900">
            <button type="button" id="wdCurBtn" onclick="cycleWithdrawCurrency()" class="inline-flex items-center gap-2 rounded-full border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-bold mb-2 ${locked ? 'pointer-events-none opacity-80' : ''}"></button>
            <div class="relative"><span class="absolute left-0 top-1 text-slate-400 font-bold text-xl">$</span>
            <input id="walletAmountInput" type="number" min="${cfg.minWithdraw}" step="0.01" placeholder="0" oninput="updateWithdrawLocalConvert()" class="w-full bg-transparent pl-6 pr-2 py-1 text-2xl font-extrabold focus:outline-none"></div>
            <p id="withdrawLocalConvert" class="text-sm text-slate-400 mt-1 min-h-[1.25rem]"></p>
          </div>
          <div class="flex justify-between gap-2 text-[11px] mt-2"><span class="text-brandPrimary font-semibold shrink-0">Min. withdrawal is ${money(cfg.minWithdraw)}</span><span class="text-slate-400 text-right">Withdrawable balance: <span class="text-brandPrimary font-semibold">${bal}</span></span></div>
          <p class="text-[10px] text-slate-400 mt-1">Wallet total ${walletBal}. Only sales &amp; referral earnings are withdrawable — deposits are for buying. Payouts are sent after review.</p>
        </div>
        <div class="pt-1 border-t border-slate-200 dark:border-slate-800">
          <p class="text-xs font-bold mb-2 mt-3">Withdraw to</p>
          <div class="space-y-2">
            <button type="button" id="wdCardBank" onclick="setWithdrawMethodCard('bank')" class="w-full text-left rounded-2xl border-2 border-brandPrimary bg-brandPrimary/10 p-3 flex gap-3 items-center">
              <span class="w-10 h-10 rounded-full bg-brandPrimary/20 text-brandPrimary flex items-center justify-center"><i class="fa-solid fa-building-columns"></i></span>
              <div class="flex-1 min-w-0">
                <p class="font-bold text-sm">Bank Account</p>
                <p class="text-[11px] text-slate-500">1-3 business days</p>
                <p id="wdBankRate" class="text-[11px] text-brandPrimary font-semibold"></p>
              </div>
              <span class="w-6 h-6 rounded-full bg-brandPrimary text-white flex items-center justify-center text-xs"><i class="fa-solid fa-check"></i></span>
            </button>
            <button type="button" id="wdCardCrypto" onclick="setWithdrawMethodCard('crypto')" class="w-full text-left rounded-2xl border border-slate-200 dark:border-slate-800 p-3 flex gap-3 items-center">
              <span class="w-10 h-10 rounded-full bg-brandPrimary/15 text-brandPrimary flex items-center justify-center"><i class="fa-brands fa-bitcoin"></i></span>
              <div class="flex-1 min-w-0">
                <p class="font-bold text-sm">Crypto Address</p>
                <p class="text-[11px] text-slate-500">Within mins · Network fee may apply</p>
              </div>
              <span class="w-6 h-6 rounded-full border border-slate-400"></span>
            </button>
          </div>
        </div>
        ${bankFields}
        <div id="wdFieldsCrypto" class="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-2 hidden">
          <div>
            <label class="text-[11px] text-slate-500 mb-1 block">Select cryptocurrency</label>
            <div id="wdCryptoGrid" class="grid grid-cols-4 gap-2"></div>
          </div>
          <div><label class="text-[11px] text-slate-500">Select Network</label>
            <select id="withdrawNetwork" class="mt-1 w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 text-sm"></select>
          </div>
          <div><label class="text-[11px] text-slate-500">Wallet address <span class="text-red-500">*</span></label><input id="withdrawCryptoDest" type="text" placeholder="Enter wallet address" class="mt-1 w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 text-sm"></div>
        </div>
        <div class="border border-brandPrimary/40 rounded-xl p-3 text-[11px] text-slate-500 flex gap-2 items-start">
          <i class="fa-solid fa-shield-halved text-brandPrimary mt-0.5"></i>
          <span>Secured and Trusted: Withdrawals are securely processed and reviewed to protect your account.</span>
        </div>
        <button onclick="submitWalletAction('withdraw')" class="w-full bg-brandPrimary hover:bg-brandHover text-white py-3.5 rounded-xl font-bold text-sm shadow-md">Continue to withdraw</button>
      </div>`
    );
    window.__payoutBankLocked = locked;
    refreshWithdrawCurrencyBtn();
    refreshWithdrawBankRate();
    updateWithdrawLocalConvert();
    const firstCrypto = (cur.crypto.find((c) => c.enabled !== false) || { code: 'USDT' }).code;
    withdrawCryptoCoin = firstCrypto;
    renderWithdrawCryptoGrid();
    fillWithdrawNetworks();
    if (!locked) loadWithdrawBanks(u);
  }

  let withdrawBanksCache = [];

  async function loadWithdrawBanks(u) {
    const search = document.getElementById('withdrawBankSearch');
    const list = document.getElementById('withdrawBankList');
    const codeEl = document.getElementById('withdrawBankCode');
    const nameEl = document.getElementById('withdrawBank');
    if (!search || !list) return;
    const savedCode = (u && (u.payoutBankCode || u.payout_bank_code)) || '';
    const savedName = (u && (u.payoutBank || '')) || '';
    search.placeholder = 'Loading banks…';
    search.disabled = true;
    try {
      let banks = [];
      if (window.AcctSuiteApi && typeof window.AcctSuiteApi.banksList === 'function') {
        const res = await window.AcctSuiteApi.banksList({ country: 'NG' });
        banks = res.banks || [];
      }
      withdrawBanksCache = banks
        .map((b) => ({ code: String(b.code || ''), name: String(b.name || '') }))
        .filter((b) => b.code && b.name)
        .sort((a, b) => a.name.localeCompare(b.name));
      search.disabled = false;
      search.placeholder = 'Search bank…';
      if (savedCode || savedName) {
        const hit =
          withdrawBanksCache.find((b) => b.code === savedCode) ||
          withdrawBanksCache.find((b) => b.name.toLowerCase() === savedName.toLowerCase());
        if (hit) {
          if (codeEl) codeEl.value = hit.code;
          if (nameEl) nameEl.value = hit.name;
          search.value = hit.name;
        } else if (savedName) {
          search.value = savedName;
          if (nameEl) nameEl.value = savedName;
          if (codeEl && savedCode) codeEl.value = savedCode;
        }
      }
      function renderBankList(q) {
        const query = String(q || '').trim().toLowerCase();
        const filtered = !query
          ? withdrawBanksCache.slice(0, 80)
          : withdrawBanksCache.filter((b) => b.name.toLowerCase().includes(query)).slice(0, 80);
        if (!filtered.length) {
          list.innerHTML = '<p class="px-3 py-2.5 text-xs text-slate-500">No banks match</p>';
          list.classList.remove('hidden');
          return;
        }
        list.innerHTML = filtered
          .map(
            (b) =>
              `<button type="button" class="w-full text-left px-3 py-2.5 text-sm hover:bg-brandPrimary/10 border-b border-slate-100 dark:border-slate-800 last:border-0" data-code="${escapeAttr(b.code)}" data-name="${escapeAttr(b.name)}">${escapeHtml(b.name)}</button>`
          )
          .join('');
        list.classList.remove('hidden');
        list.querySelectorAll('[data-code]').forEach((btn) => {
          btn.addEventListener('click', () => {
            if (codeEl) codeEl.value = btn.getAttribute('data-code') || '';
            if (nameEl) nameEl.value = btn.getAttribute('data-name') || '';
            search.value = btn.getAttribute('data-name') || '';
            list.classList.add('hidden');
          });
        });
      }
      search.onfocus = function () {
        renderBankList(search.value);
      };
      search.oninput = function () {
        // Typing clears previous selection until they pick again
        if (codeEl) codeEl.value = '';
        if (nameEl) nameEl.value = '';
        renderBankList(search.value);
      };
      search.onkeydown = function (ev) {
        if (ev.key === 'Escape') list.classList.add('hidden');
      };
      document.addEventListener(
        'click',
        function hideBankList(ev) {
          if (!list.contains(ev.target) && ev.target !== search) list.classList.add('hidden');
        },
        true
      );
    } catch (e) {
      search.disabled = false;
      search.placeholder = 'Search bank…';
      list.innerHTML = '<p class="px-3 py-2.5 text-xs text-red-500">Could not load banks</p>';
    }
  }

  function renderWithdrawCryptoGrid() {
    const box = document.getElementById('wdCryptoGrid');
    if (!box) return;
    const list = walletCurrencies().crypto.filter((c) => c.enabled !== false);
    box.innerHTML = list
      .map(
        (c) => `<button type="button" onclick="selectWithdrawCrypto('${escapeAttr(c.code)}')" class="rounded-xl border p-2 text-center text-[10px] font-bold transition ${withdrawCryptoCoin === c.code ? 'border-brandPrimary bg-brandPrimary/10 text-brandPrimary' : 'border-slate-200 dark:border-slate-800'}">${escapeHtml(c.code)}</button>`
      )
      .join('');
  }

  window.selectWithdrawCrypto = function (code) {
    withdrawCryptoCoin = code;
    renderWithdrawCryptoGrid();
    fillWithdrawNetworks();
    const dest = document.getElementById('withdrawCryptoDest');
    if (dest) dest.placeholder = 'Enter ' + code + ' address';
  };

  function refreshWithdrawCurrencyBtn() {
    const btn = document.getElementById('wdCurBtn');
    if (!btn) return;
    const cur = walletCurrencies().local.find((c) => c.code === withdrawCurrency) || { code: withdrawCurrency, flag: 'ng' };
    btn.innerHTML = `${flagImg(cur.flag)} ${escapeHtml(cur.code)} <i class="fa-solid fa-chevron-down text-[10px] opacity-60"></i>`;
  }

  function refreshWithdrawBankRate() {
    const el = document.getElementById('wdBankRate');
    if (!el) return;
    const cur = walletCurrencies().local.find((c) => c.code === withdrawCurrency);
    const rate = Number((cur && cur.rate) || (A().CONFIG && A().CONFIG.usdNgnRate) || 1600);
    const sym = currencySymbol(withdrawCurrency);
    el.textContent = `$1 ≈ ${sym}${rate.toLocaleString()}`;
  }

  window.updateWithdrawLocalConvert = function () {
    const el = document.getElementById('withdrawLocalConvert');
    const input = document.getElementById('walletAmountInput');
    if (!el || !input) return;
    el.textContent = localConvertLine(parseFloat(input.value) || 0, withdrawCurrency);
  };

  window.cycleWithdrawCurrency = function () {
    if (window.__payoutBankLocked) return;
    const list = walletCurrencies().local.filter((c) => c.enabled !== false);
    if (!list.length) return;
    const i = list.findIndex((c) => c.code === withdrawCurrency);
    withdrawCurrency = list[(i + 1) % list.length].code;
    refreshWithdrawCurrencyBtn();
    refreshWithdrawBankRate();
    updateWithdrawLocalConvert();
  };

  window.setWithdrawMethodCard = function (m) {
    withdrawMethodCard = m === 'crypto' ? 'crypto' : 'bank';
    const bank = document.getElementById('wdCardBank');
    const crypto = document.getElementById('wdCardCrypto');
    const fb = document.getElementById('wdFieldsBank');
    const fc = document.getElementById('wdFieldsCrypto');
    if (bank && crypto) {
      const onBank = withdrawMethodCard === 'bank';
      bank.className = 'w-full text-left rounded-2xl p-3 flex gap-3 items-center ' + (onBank ? 'border-2 border-brandPrimary bg-brandPrimary/10' : 'border border-slate-200 dark:border-slate-800');
      crypto.className = 'w-full text-left rounded-2xl p-3 flex gap-3 items-center ' + (!onBank ? 'border-2 border-brandPrimary bg-brandPrimary/10' : 'border border-slate-200 dark:border-slate-800');
      bank.querySelector('span:last-child').outerHTML = onBank
        ? '<span class="w-6 h-6 rounded-full bg-brandPrimary text-white flex items-center justify-center text-xs"><i class="fa-solid fa-check"></i></span>'
        : '<span class="w-6 h-6 rounded-full border border-slate-400"></span>';
      crypto.querySelector('span:last-child').outerHTML = !onBank
        ? '<span class="w-6 h-6 rounded-full bg-brandPrimary text-white flex items-center justify-center text-xs"><i class="fa-solid fa-check"></i></span>'
        : '<span class="w-6 h-6 rounded-full border border-slate-400"></span>';
    }
    // When bank is locked, bank fields are always shown (read-only block) — hide only when crypto
    const lockedBlock = document.getElementById('wdFieldsBankLocked');
    if (fb) fb.classList.toggle('hidden', withdrawMethodCard !== 'bank');
    if (lockedBlock) lockedBlock.classList.toggle('hidden', withdrawMethodCard !== 'bank');
    if (fc) fc.classList.toggle('hidden', withdrawMethodCard !== 'crypto');
    fillWithdrawNetworks();
  };

  function fillWithdrawNetworks() {
    const sel = document.getElementById('withdrawNetwork');
    if (!sel) return;
    const coin =
      walletCurrencies().crypto.find((c) => c.code === withdrawCryptoCoin && c.enabled !== false) ||
      walletCurrencies().crypto.find((c) => c.enabled !== false) ||
      { networks: ['TRC20', 'BEP20'] };
    const nets = coin.networks || ['TRC20'];
    sel.innerHTML = nets.map((n) => `<option value="${escapeAttr(n)}">${escapeHtml(n)}</option>`).join('');
  }

  window.submitWalletAction = async function (type) {
    const u = refreshUser();
    const amount = parseFloat(document.getElementById('walletAmountInput').value);
    if (!amount || Number.isNaN(amount)) {
      alert('Enter a valid amount');
      return;
    }
    let res;
    if (type === 'deposit') {
      try {
        if (window.AcctSuiteApi && (await window.AcctSuiteApi.isAvailable())) {
          if (depositChannel === 'crypto') {
            const addr = cryptoAddressFor(depositCurrency, depositNetwork);
            if (!addr) {
              alert('No wallet is available at the moment.');
              return;
            }
            const cryptoOk = window.AcctSuiteConfirm
              ? await window.AcctSuiteConfirm({
                  title: 'Crypto deposit',
                  message:
                    'Confirm you will send (or already sent) $' +
                    amount.toFixed(2) +
                    ' in ' +
                    depositCurrency +
                    ' on ' +
                    depositNetwork +
                    ' to:\n\n' +
                    addr +
                    '\n\nYour wallet will NOT credit until payment is confirmed.',
                  okText: 'I understand',
                  icon: 'fa-wallet',
                })
              : confirm(
                  'Confirm you will send (or already sent) $' +
                    amount.toFixed(2) +
                    ' in ' +
                    depositCurrency +
                    ' on ' +
                    depositNetwork +
                    ' to:\n\n' +
                    addr +
                    '\n\nYour wallet will NOT credit until payment is confirmed.'
                );
            if (!cryptoOk) return;
          }
          const payload = {
            amount: Number(amount),
            currency: depositCurrency,
            channel: depositChannel,
          };
          if (depositChannel === 'crypto') {
            payload.network = depositNetwork;
            const txEl = document.getElementById('depositTxHash');
            if (txEl && txEl.value.trim()) payload.txHash = txEl.value.trim();
          }
          const apiRes = await window.AcctSuiteApi.deposit(payload);
          if (apiRes.paymentLink) {
            window.location.href = apiRes.paymentLink;
            return;
          }
          if (window.AcctSuiteApiSync) await window.AcctSuiteApiSync.hydrateFromApi();
          closeWalletFlow();
          applyProfileChrome(refreshUser());
          setWalletHistoryTab('deposit');
          renderTxHistory();
          if (apiRes.pending && depositChannel === 'crypto') {
            alert(
              (apiRes.message || 'Crypto deposit submitted for review.') +
                (apiRes.address ? '\n\nAddress: ' + apiRes.address : '') +
                (apiRes.reference ? '\nRef: ' + apiRes.reference : '')
            );
          } else {
            alert(apiRes.message || (apiRes.credited != null ? 'Deposit credited: ' + money(apiRes.credited) : 'Deposit submitted.'));
          }
          return;
        }
      } catch (e) {
        alert(e.message || 'Deposit failed. Please try again in a moment.');
        return;
      }
      alert('Live backend not connected. Log out, log in again, then retry deposit.');
      return;
    }

    const isCrypto = withdrawMethodCard === 'crypto';
    const locked = !!(u && u.payoutBankLocked) || !!window.__payoutBankLocked;
    let dest = '';
    let accountName = '';
    let bankName = '';
    let bankCode = '';
    if (isCrypto) {
      dest = ((document.getElementById('withdrawCryptoDest') || {}).value || '').trim();
    } else if (locked) {
      dest = (u.payoutAccount || '').trim();
      accountName = (u.payoutAccountName || '').trim();
      bankName = (u.payoutBank || '').trim();
      bankCode = (u.payoutBankCode || '').trim();
    } else {
      dest = ((document.getElementById('withdrawDest') || {}).value || '').trim();
      accountName = ((document.getElementById('withdrawName') || {}).value || '').trim();
      bankCode = ((document.getElementById('withdrawBankCode') || {}).value || '').trim();
      bankName = ((document.getElementById('withdrawBank') || {}).value || '').trim();
      if (!bankName) {
        bankName = ((document.getElementById('withdrawBankSearch') || {}).value || '').trim();
      }
    }
    const network = ((document.getElementById('withdrawNetwork') || {}).value || '').trim();
    if (!dest) {
      alert(isCrypto ? 'Enter wallet address' : 'Enter account number');
      return;
    }
    if (!isCrypto && !locked && !bankCode && !bankName) {
      alert('Select your bank');
      return;
    }
    if (!isCrypto && !accountName) {
      alert('Enter account name');
      return;
    }
    res = await Promise.resolve(
      A().withdraw(u, amount, isCrypto ? 'crypto' : 'bank', {
        destination: dest,
        accountName: isCrypto ? withdrawCryptoCoin + ' · ' + network : accountName,
        bankName: isCrypto ? withdrawCryptoCoin + (network ? ' / ' + network : '') : bankName || withdrawCurrency,
        bankCode: isCrypto ? '' : bankCode,
        currency: withdrawCurrency,
      })
    );
    if (!res.ok) {
      alert(res.error);
      return;
    }
    closeWalletFlow();
    applyProfileChrome(refreshUser());
    setWalletHistoryTab('withdrawal');
    alert(res.message || 'Withdrawal requested. Pending approval.');
  };

  window.openSellProductWizard = async function () {
    const u0 = requireAuth({ message: 'You are not logged in. Sign in first to sell.' });
    if (!u0) return;
    // Always sync server limits / ads before Sell (never trust stale localStorage alone)
    try {
      if (window.AcctSuiteApiSync) {
        if (typeof window.AcctSuiteApiSync.patchAcctSuiteForApi === 'function') {
          window.AcctSuiteApiSync.patchAcctSuiteForApi();
        }
        const Api = window.AcctSuiteApi;
        if (Api && window.AcctSuiteApiSync.ensureApiSession) {
          await window.AcctSuiteApiSync.ensureApiSession(Api);
        }
        if (window.AcctSuiteApiSync.hydrateFromApi) {
          await window.AcctSuiteApiSync.hydrateFromApi();
        }
      }
    } catch (_) {}
    const u = refreshUser() || u0;
    if (!A().canUploadToday(u)) {
      alert('Daily upload limit reached (' + A().getPlan(u).dailyUploads + '). Upgrade your plan to upload more today.');
      switchTab('plans');
      return;
    }
    sellDraft = { releaseType: 'auto', accounts: [] };
    sellStep = 1;
    showSellStep(1);
    const cat = document.getElementById('wizardCat');
    const search = document.getElementById('wizardCatSearch');
    const selected = document.getElementById('wizardCatSelected');
    const picker = document.getElementById('wizardCatPicker');
    if (cat) cat.value = '';
    if (search) search.value = '';
    if (selected) { selected.classList.add('hidden'); selected.innerHTML = ''; }
    if (picker) picker.classList.add('hidden');
    ['wizardTitle', 'wizardDesc', 'wizardPrice'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    renderWizardAccounts(1);
    document.getElementById('sellWizardOverlay').classList.remove('hidden');
    document.getElementById('sellWizardOverlay').classList.add('flex');
    const banner = document.getElementById('uploadLimitBannerText');
    if (banner) banner.textContent = `You are on ${A().getPlan(u).name}. Uploads left today: ${A().getRemainingUploads(u)} of ${A().getPlan(u).dailyUploads}.`;
  };

  window.closeSellProductWizard = function () {
    if (sellStep > 1) {
      sellStep -= 1;
      showSellStep(sellStep);
      return;
    }
    document.getElementById('sellWizardOverlay').classList.remove('flex');
    document.getElementById('sellWizardOverlay').classList.add('hidden');
  };

  function previewLinkOptionalForDraft() {
    const cat = (sellDraft && (sellDraft.category || sellDraft.platform)) || '';
    try {
      if (window.AcctSuiteCatalog && typeof window.AcctSuiteCatalog.categoryRequiresPreviewLink === 'function') {
        return !window.AcctSuiteCatalog.categoryRequiresPreviewLink(cat);
      }
      if (window.AcctSuite && typeof window.AcctSuite.categoryRequiresPreviewLink === 'function') {
        return !window.AcctSuite.categoryRequiresPreviewLink(cat);
      }
    } catch (e) {}
    return /whatsapp|signal|textnow|textplus|google voice|wechat|line|viber|imo|kik|skype/i.test(String(cat));
  }

  function syncWizardPreviewHints() {
    const optional = previewLinkOptionalForDraft();
    const hint = document.getElementById('wizardPreviewHint');
    const help = document.getElementById('wizardPreviewHelp');
    if (hint) hint.classList.toggle('hidden', !optional);
    if (help) {
      help.textContent = optional
        ? 'Optional for this account type — WhatsApp / phone messaging passes do not need a preview link.'
        : 'Required for social profiles (Facebook, Instagram, etc.). Optional for WhatsApp and phone/messaging passes.';
    }
    document.querySelectorAll('#wizardAccountsList [data-preview-label]').forEach((el) => {
      el.innerHTML = optional
        ? 'Preview link <span class="font-normal text-slate-400">(optional)</span>'
        : 'Preview link <span class="font-normal text-slate-400">(required for social)</span>';
    });
  }

  function emptyWizardAccount() {
    return {
      username: '',
      password: '',
      previewLink: '',
      attachedEmail: '',
      attachedEmailPassword: '',
      twoFA: '',
      extraInfo: '',
    };
  }

  function collectWizardAccountRows() {
    return Array.from(document.querySelectorAll('#wizardAccountsList .wizard-account-card')).map((card) => ({
      username: (card.querySelector('[data-field="username"]') || {}).value
        ? String(card.querySelector('[data-field="username"]').value).trim()
        : '',
      password: (card.querySelector('[data-field="password"]') || {}).value
        ? String(card.querySelector('[data-field="password"]').value).trim()
        : '',
      previewLink: (card.querySelector('[data-field="previewLink"]') || {}).value
        ? String(card.querySelector('[data-field="previewLink"]').value).trim()
        : '',
      attachedEmail: (card.querySelector('[data-field="attachedEmail"]') || {}).value
        ? String(card.querySelector('[data-field="attachedEmail"]').value).trim()
        : '',
      attachedEmailPassword: (card.querySelector('[data-field="attachedEmailPassword"]') || {}).value
        ? String(card.querySelector('[data-field="attachedEmailPassword"]').value).trim()
        : '',
      twoFA: (card.querySelector('[data-field="twoFA"]') || {}).value
        ? String(card.querySelector('[data-field="twoFA"]').value).trim()
        : '',
      extraInfo: (card.querySelector('[data-field="extraInfo"]') || {}).value
        ? String(card.querySelector('[data-field="extraInfo"]').value).trim()
        : '',
    }));
  }

  function wizardAccountCardHtml(acc, index, total) {
    const a = acc || emptyWizardAccount();
    const removeBtn =
      total > 1
        ? `<button type="button" onclick="removeWizardAccount(${index})" class="text-[11px] text-red-500 font-semibold" aria-label="Remove account"><i class="fa-solid fa-trash mr-0.5"></i>Remove</button>`
        : '';
    return `<div class="wizard-account-card bg-lightCard dark:bg-darkCard border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 space-y-3" data-account-index="${index}">
      <div class="flex justify-between items-center">
        <h4 class="text-sm font-bold">Account ${index + 1}</h4>
        ${removeBtn}
      </div>
      <div>
        <label class="block mb-1 text-xs font-medium text-slate-500">Username *</label>
        <input type="text" data-field="username" value="${escapeAttr(a.username || '')}" placeholder="Account username" class="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 text-sm">
      </div>
      <div>
        <label class="block mb-1 text-xs font-medium text-slate-500">Account Password *</label>
        <input type="text" data-field="password" value="${escapeAttr(a.password || '')}" placeholder="Account password" class="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 text-sm">
      </div>
      <div>
        <label class="block mb-1 text-xs font-medium text-slate-500" data-preview-label>Preview link</label>
        <input type="url" data-field="previewLink" value="${escapeAttr(a.previewLink || '')}" placeholder="https://…" class="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 text-sm">
      </div>
      <p class="text-[11px] font-bold text-slate-500 pt-1 border-t border-slate-100 dark:border-slate-800">Optional extras</p>
      <div class="grid grid-cols-1 gap-2.5">
        <input type="email" data-field="attachedEmail" value="${escapeAttr(a.attachedEmail || '')}" placeholder="Email attached to account" class="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 text-sm">
        <input type="text" data-field="attachedEmailPassword" value="${escapeAttr(a.attachedEmailPassword || '')}" placeholder="Email password" class="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 text-sm">
        <input type="text" data-field="twoFA" value="${escapeAttr(a.twoFA || '')}" placeholder="2FA code" class="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 text-sm">
        <textarea data-field="extraInfo" rows="2" placeholder="Extra notes for the buyer…" class="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 text-sm">${escapeHtml(a.extraInfo || '')}</textarea>
      </div>
    </div>`;
  }

  function renderWizardAccounts(countOrAccounts) {
    const box = document.getElementById('wizardAccountsList');
    if (!box) return;
    let accounts;
    if (typeof countOrAccounts === 'number') {
      accounts = Array.from({ length: Math.max(1, countOrAccounts) }, () => emptyWizardAccount());
    } else if (Array.isArray(countOrAccounts) && countOrAccounts.length) {
      accounts = countOrAccounts;
    } else {
      accounts = [emptyWizardAccount()];
    }
    box.innerHTML = accounts.map((a, i) => wizardAccountCardHtml(a, i, accounts.length)).join('');
    syncWizardPreviewHints();
  }

  window.addWizardAccount = function () {
    const rows = collectWizardAccountRows();
    if (rows.length >= 50) {
      alert('You can upload at most 50 accounts in one listing.');
      return;
    }
    rows.push(emptyWizardAccount());
    renderWizardAccounts(rows);
  };

  window.removeWizardAccount = function (index) {
    const rows = collectWizardAccountRows();
    if (rows.length <= 1) return;
    rows.splice(index, 1);
    renderWizardAccounts(rows);
  };

  function showSellStep(step) {
    sellStep = step;
    ['sellStep1', 'sellStep2', 'sellStep3'].forEach((id, i) => {
      const el = document.getElementById(id);
      if (el) el.classList.toggle('hidden', i !== step - 1);
    });
    const labels = ['Add account', 'Credentials', 'Review'];
    const st = document.getElementById('sellWizardStepText');
    if (st) st.textContent = `Step ${step} of 3 — ${labels[step - 1]}`;
    const btn = document.getElementById('sellWizardBtn');
    if (btn) btn.textContent = step === 3 ? 'Submit listing' : 'Continue';
    document.querySelectorAll('.sell-step-label').forEach((el, i) => {
      el.classList.toggle('text-brandPrimary', i === step - 1);
      el.classList.toggle('font-bold', i === step - 1);
    });
    if (step === 2) syncWizardPreviewHints();
    if (step === 3) fillSellReview();
  }

  window.selectWizardRelease = function (type) {
    sellDraft.releaseType = type;
    const autoCard = document.getElementById('wizardCardAuto');
    const manualCard = document.getElementById('wizardCardManual');
    if (!autoCard || !manualCard) return;
    if (type === 'auto') {
      autoCard.className = 'flex items-start gap-3 p-3.5 rounded-xl border border-brandPrimary bg-brandPrimary/10 cursor-pointer transition';
      manualCard.className = 'flex items-start gap-3 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 cursor-pointer transition';
    } else {
      manualCard.className = 'flex items-start gap-3 p-3.5 rounded-xl border border-brandPrimary bg-brandPrimary/10 cursor-pointer transition';
      autoCard.className = 'flex items-start gap-3 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 cursor-pointer transition';
    }
  };

  function parseListingPrice(raw) {
    if (raw == null || raw === '') return NaN;
    const s = String(raw).trim().replace(/,/g, '.').replace(/[^\d.]/g, '');
    const n = parseFloat(s);
    return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN;
  }

  window.handleSellWizardNext = async function () {
    if (sellStep === 1) {
      const category = document.getElementById('wizardCat').value;
      const title = document.getElementById('wizardTitle').value.trim();
      const description = document.getElementById('wizardDesc').value.trim();
      const price = parseListingPrice(document.getElementById('wizardPrice').value);
      if (!category || !title) {
        alert('Please fill category and name.');
        return;
      }
      if (!Number.isFinite(price) || price <= 0) {
        alert('Enter a valid price (e.g. 8.00).');
        return;
      }
      if (price > 99999) {
        alert('Price is too high. Enter a realistic listing price.');
        return;
      }
      sellDraft = { ...sellDraft, category, platform: category, title, description, price };
      const uploadOk = window.AcctSuiteConfirm
        ? await window.AcctSuiteConfirm({
            title: 'Upload policy',
            message:
              'Warning: Uploading bad, fake, or non-working accounts can get you banned. After 3 verified bad uploads, your account may be permanently banned. Continue?',
            okText: 'Continue',
            icon: 'fa-triangle-exclamation',
            danger: true,
          })
        : confirm(
            'Warning: Uploading bad, fake, or non-working accounts can get you banned. After 3 verified bad uploads, your account may be permanently banned. Continue?'
          );
      if (!uploadOk) return;
      showSellStep(2);
      return;
    }
    if (sellStep === 2) {
      const accounts = collectWizardAccountRows().filter((a) => a.username || a.password);
      const valid = accounts.filter((a) => a.username && a.password);
      if (!valid.length) {
        alert('Add at least one account with username and password.');
        return;
      }
      if (accounts.length !== valid.length) {
        alert('Each account needs both username and password (or remove incomplete rows).');
        return;
      }
      const first = valid[0];
      sellDraft = {
        ...sellDraft,
        accounts: valid,
        username: first.username,
        password: first.password,
        previewLink: first.previewLink || '',
        attachedEmail: first.attachedEmail || '',
        attachedEmailPassword: first.attachedEmailPassword || '',
        twoFA: first.twoFA || '',
        extraInfo: first.extraInfo || '',
      };
      showSellStep(3);
      return;
    }
    // submit — must hit MySQL when logged into API (never localStorage-only)
    const u = refreshUser();
    if (window.AcctSuiteApiSync) {
      if (typeof window.AcctSuiteApiSync.patchAcctSuiteForApi === 'function') {
        window.AcctSuiteApiSync.patchAcctSuiteForApi();
      }
      if (window.AcctSuiteApiSync.ensureApiSession && window.AcctSuiteApi) {
        try {
          await window.AcctSuiteApiSync.ensureApiSession(window.AcctSuiteApi);
        } catch (_) {}
      }
    }
    // Re-read price from review step so it always matches what the seller entered
    const finalPrice = parseListingPrice(sellDraft.price != null ? sellDraft.price : document.getElementById('wizardPrice')?.value);
    if (!Number.isFinite(finalPrice) || finalPrice <= 0) {
      alert('Price is missing or invalid. Go back and enter your listing price (e.g. 8.00).');
      return;
    }
    sellDraft = { ...sellDraft, price: finalPrice };
    const btn = document.getElementById('sellWizardBtn');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Submitting…';
    }
    let res;
    try {
      res = await Promise.resolve(A().createAd(u, sellDraft));
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Submit listing';
      }
    }
    if (!res.ok) {
      alert(res.error || 'Could not create listing.');
      return;
    }
    try {
      if (window.AcctSuiteApiSync && window.AcctSuiteApiSync.refreshAdsFromApi) {
        await window.AcctSuiteApiSync.refreshAdsFromApi();
      } else if (window.AcctSuiteApiSync && window.AcctSuiteApiSync.hydrateFromApi) {
        await window.AcctSuiteApiSync.hydrateFromApi();
      }
    } catch (_) {}
    const status = String(res.status || res.ad?.status || 'pending').toLowerCase();
    document.getElementById('sellWizardOverlay').classList.remove('flex');
    document.getElementById('sellWizardOverlay').classList.add('hidden');
    ['wizardTitle', 'wizardDesc', 'wizardPrice'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    renderWizardAccounts(1);
    applyProfileChrome(refreshUser());
    switchTab('ads');
    const filter =
      status === 'denied' ? 'denied' : status === 'active' ? 'active' : 'pending';
    setAdsFilter(filter);
    renderAds();
    const acctCount = (sellDraft.accounts && sellDraft.accounts.length) || 1;
    const msg =
      status === 'denied'
        ? res.message || 'Listing denied by AI review. Open My Ads → Denied.'
        : status === 'active'
          ? 'Listing is live. Open My Ads → Active.'
          : res.message ||
            'Listing submitted. Open My Ads → Pending — it will appear on Market/Home after review.';
    if (window.AcctSuiteToast) {
      window.AcctSuiteToast[status === 'denied' ? 'error' : 'success'](
        acctCount > 1 ? msg + ' (' + acctCount + ' accounts)' : msg
      );
    } else {
      alert(msg);
    }
  };

  function fillSellReview() {
    const box = document.getElementById('sellReviewSummary');
    if (!box) return;
    const acctCount = (sellDraft.accounts && sellDraft.accounts.length) || (sellDraft.username ? 1 : 0);
    box.innerHTML = `
      <div class="space-y-2 text-sm">
        <div class="flex justify-between"><span class="text-slate-500">Title</span><span class="font-medium text-right ml-4">${escapeHtml(sellDraft.title || '')}</span></div>
        <div class="flex justify-between"><span class="text-slate-500">Category</span><span class="font-medium">${escapeHtml(sellDraft.category || '')}</span></div>
        <div class="flex justify-between"><span class="text-slate-500">Price</span><span class="font-bold text-brandPrimary">${money(sellDraft.price)}</span></div>
        <div class="flex justify-between"><span class="text-slate-500">Release</span><span class="font-medium">${sellDraft.releaseType === 'manual' ? 'Manual' : 'Auto confirm'}</span></div>
        <div class="flex justify-between"><span class="text-slate-500">Accounts</span><span class="font-bold text-brandPrimary">${acctCount} units · separate in My Ads · one Market listing</span></div>
        <div class="flex justify-between"><span class="text-slate-500">First username</span><span class="font-mono text-xs">${escapeHtml(sellDraft.username || '')}</span></div>
        <div class="flex justify-between gap-2"><span class="text-slate-500 shrink-0">Preview link</span><span class="font-mono text-[10px] text-right break-all">${escapeHtml(sellDraft.previewLink || '—')}</span></div>
        <div class="flex justify-between"><span class="text-slate-500">2FA</span><span class="font-medium">${escapeHtml(sellDraft.twoFA || '—')}</span></div>
      </div>
      <p class="text-[11px] text-amber-600 mt-3">After submit, your listing is checked and stays <strong>Pending</strong> until it is approved for Market.</p>`;
  }

  // -------- Listing detail / buy (AcctBazaar-style) --------
  let listingSelectedAccount = {};

  function formatTimeAgo(iso) {
    if (!iso) return 'recently';
    const t = new Date(iso).getTime();
    if (!t || Number.isNaN(t)) return 'recently';
    const sec = Math.max(0, Math.floor((Date.now() - t) / 1000));
    if (sec < 60) return 'just now';
    const min = Math.floor(sec / 60);
    if (min < 60) return min + 'm ago';
    const hr = Math.floor(min / 60);
    if (hr < 48) return hr + 'h ago';
    const day = Math.floor(hr / 24);
    if (day < 14) return day + 'd ago';
    const wk = Math.floor(day / 7);
    if (wk < 8) return wk + 'w ago';
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  function formatSalesLabel(n) {
    const v = Number(n) || 0;
    if (v >= 1000) {
      const k = v / 1000;
      const s = k >= 10 ? Math.round(k) + 'k' : k.toFixed(1).replace(/\.0$/, '') + 'k';
      return s + ' sales';
    }
    return v + ' sales';
  }

  function starsRowHtml(rating, reviewCount) {
    const r = Math.max(0, Math.min(5, Number(rating) || 0));
    const full = Math.floor(r);
    const half = r - full >= 0.35 ? 1 : 0;
    let icons = '';
    for (let i = 0; i < 5; i++) {
      if (i < full) icons += '<i class="fa-solid fa-star" aria-hidden="true"></i>';
      else if (i === full && half) icons += '<i class="fa-solid fa-star-half-stroke" aria-hidden="true"></i>';
      else icons += '<i class="fa-solid fa-star av-star-empty" aria-hidden="true"></i>';
    }
    const count = Number(reviewCount) || 0;
    return `<span class="av-listing-stars" title="${r.toFixed(1)} stars">${icons}${count ? `<em>(${count})</em>` : ''}</span>`;
  }

  function buildListingDetailHtml(item) {
    const logo = productLogoFor(item);
    const stock = Math.max(1, Number(item.stock) || 1);
    const sel = listingSelectedAccount[item.id] != null ? listingSelectedAccount[item.id] : 0;
    listingSelectedAccount[item.id] = sel;
    const desc = String(item.description || 'No description provided.');
    const descLong = desc.length > 160;
    const u = refreshUser();
    const walletBal = money(u ? u.balance : 0);
    const salesLabel = formatSalesLabel(item.sellerCompletedSales);
    const added = formatTimeAgo(item.createdAt);
    const isAuto = item.releaseType !== 'manual';
    const storeKey = escapeAttr(item.sellerMerchantSlug || item.sellerSlug || item.merchantSlug || (item.sellerId != null ? String(item.sellerId) : '') || item.sellerEmail || '');

    const accountRows = [];
    for (let i = 0; i < stock; i++) {
      const selected = sel === i;
      const previewAttr = item.previewLink ? escapeAttr(item.previewLink) : '';
      accountRows.push(`
        <div class="av-listing-account-row${selected ? ' is-selected' : ''}" onclick="selectListingAccount('${escapeAttr(item.id)}', ${i})">
          <div class="av-listing-account-row__check">${selected ? '<i class="fa-solid fa-check"></i>' : ''}</div>
          <span class="av-listing-account-row__label">Account ${i + 1}</span>
          <span class="av-listing-account-row__price">${money(item.price)}</span>
          <button type="button" class="av-listing-eye" title="Preview link" onclick="event.stopPropagation(); previewListingLink('${previewAttr}')" ${item.previewLink ? '' : 'disabled style="opacity:.35;cursor:not-allowed"'}><i class="fa-solid fa-eye"></i></button>
          <button type="button" class="av-listing-cart-btn" onclick="event.stopPropagation(); window.CommerceUI && window.CommerceUI.addToCart('${escapeAttr(item.id)}')">Add to cart</button>
        </div>`);
    }

    const shareRow = window.CommerceUI ? window.CommerceUI.listingActionButtonsHtml(item) : '';

    return `
      <div class="av-listing-detail" data-listing-id="${escapeAttr(item.id)}">
        <div class="av-listing-detail__head">
          ${productLogoMarkFor(item, 'av-listing-detail__logo')}
          <div class="min-w-0 flex-1">
            <div class="av-listing-detail__title-row">
              <h3 class="av-listing-detail__title">${escapeHtml(item.title)}</h3>
              <span class="av-listing-detail__price">${money(item.price)}</span>
            </div>
            <div class="av-listing-detail__meta">
              ${starsRowHtml(item.sellerRating || 0, item.sellerReviews || 0)}
              ${item.sellerVerified ? verifyBadgeHtml('sm') : ''}
              <span>● ${stock} available, added ${escapeHtml(added)}</span>
            </div>
          </div>
        </div>
        <div class="av-listing-badge${isAuto ? '' : ' av-listing-badge--manual'}">${isAuto ? '<i class="fa-solid fa-bolt"></i> Instant Delivery' : '<i class="fa-solid fa-clock"></i> Manual delivery'}</div>
        <div class="av-listing-seller">
          <div class="av-listing-seller__avatar">${sellerAvatarFaceHtml(item.sellerAvatar, item.sellerInitials || 'S', 'av-listing-seller__avatar-img')}</div>
          <div class="av-listing-seller__body">
            <p class="av-listing-seller__name">${nameWithVerify(item.sellerName || 'Seller', item.sellerVerified, 'sm')}</p>
            <p class="av-listing-seller__stats">${escapeHtml(salesLabel)}</p>
          </div>
          <button type="button" class="av-listing-seller__link" onclick="goToSellerStore('${storeKey}')">View store →</button>
        </div>
        <div class="av-listing-desc">
          <p id="listingDescText" class="av-listing-desc__text${descLong ? ' is-clamped' : ''}">${escapeHtml(desc)}</p>
          ${descLong ? `<button type="button" id="listingDescToggle" class="av-listing-desc__more" onclick="toggleListingDesc()">Show more &gt;</button>` : ''}
        </div>
        <div class="av-listing-accounts">
          <div class="av-listing-accounts__head">
            <h4>Select account</h4>
            <span class="av-listing-accounts__count">(${sel + 1} of ${stock} selected)</span>
          </div>
          ${accountRows.join('')}
        </div>
        ${shareRow}
        <div class="av-listing-checkout">
          <div class="av-listing-checkout__row">
            <div>
              <p class="av-listing-checkout__total-label">Total (1 item)</p>
              <p class="av-listing-checkout__total">${money(item.price)}</p>
            </div>
            <button type="button" class="av-listing-wallet" onclick="closeModal(); switchTab('wallet');">Wallet Balance<strong>${walletBal} →</strong></button>
          </div>
          <button type="button" class="av-listing-pay-btn" onclick="buyListing('${escapeAttr(item.id)}')">Pay ${money(item.price)} Securely</button>
          <p class="av-listing-protect"><i class="fa-solid fa-shield-halved"></i> Your payment is protected by AcctSuite Buyer Protection.</p>
        </div>
      </div>`;
  }

  window.toggleListingDesc = function () {
    const el = document.getElementById('listingDescText');
    const btn = document.getElementById('listingDescToggle');
    if (!el || !btn) return;
    const clamped = el.classList.toggle('is-clamped');
    btn.textContent = clamped ? 'Show more >' : 'Show less';
  };

  window.selectListingAccount = function (listingId, idx) {
    listingSelectedAccount[String(listingId)] = Number(idx) || 0;
    const item = A().findListingById(listingId);
    if (!item) return;
    document.getElementById('modalBody').innerHTML = buildListingDetailHtml(item);
  };

  window.previewListingLink = function (url) {
    const u = String(url || '').trim();
    if (!u) {
      alert('No preview link for this listing.');
      return;
    }
    window.open(u, '_blank', 'noopener,noreferrer');
  };

  window.openListingDetail = async function (id) {
    let item = A().findListingById(id);
    if (!item) {
      alert('Listing not available.');
      return;
    }
    const modal = document.getElementById('appModal');
    if (modal) modal.classList.add('av-listing-modal');
    document.getElementById('modalBody').innerHTML = '<p class="text-sm text-slate-500 py-8 text-center">Loading listing…</p>';
    (function () {
      var m = document.getElementById('appModal');
      if (!m) return;
      m.classList.remove('hidden');
      m.classList.add('flex');
    })();

    if (window.AcctSuiteApi && window.AcctSuiteApiSync && window.AcctSuiteApiSync.usingApi && window.AcctSuiteApiSync.usingApi()) {
      try {
        const res = await window.AcctSuiteApi.marketGet({ id: Number(id) || id });
        if (res && res.ok && res.listing) {
          const mapped = window.AcctSuiteApiSync.mapListing
            ? window.AcctSuiteApiSync.mapListing(res.listing)
            : res.listing;
          item = Object.assign({}, item, mapped);
        }
      } catch (e) {
        console.warn('market.get failed', e);
      }
    }

    document.getElementById('modalBody').innerHTML = buildListingDetailHtml(item);
  };

  window.buyListing = async function (id) {
    const u = refreshUser();
    if (!u) {
      promptSignIn('You are not logged in. Sign in first to buy.');
      return;
    }
    const res = await Promise.resolve(A().purchaseListing(u, id));
    if (!res.ok) {
      if (res.code === 'insufficient_funds' && window.CommerceUI) {
        window.CommerceUI.showInsufficientFundsModal();
        return;
      }
      alert(res.error);
      if (String(res.error).toLowerCase().includes('balance')) switchTab('wallet');
      return;
    }
    closeModal();
    try {
      if (A().refreshOrdersFromApi) await A().refreshOrdersFromApi();
      else if (window.AcctSuiteApiSync && window.AcctSuiteApiSync.refreshOrdersFromApi) {
        await window.AcctSuiteApiSync.refreshOrdersFromApi();
      } else if (window.AcctSuiteApiSync) await window.AcctSuiteApiSync.hydrateFromApi();
    } catch (e) {}
    applyProfileChrome(refreshUser());
    renderOrders();
    renderPurchase();
    renderMarketplace();
    alert('Purchase successful. Open My Purchase to view credentials and message the seller.');
    switchTab('purchase');
    if (res.orderId) {
      try {
        openOrderDetail(String(res.orderId));
      } catch (e) {}
    }
  };

  // -------- Orders detail / chat / refund --------
  window.openOrderDetail = async function (orderId) {
    const u = refreshUser();
    let order = (u.orders || []).find((o) => String(o.id) === String(orderId) || String(o.publicId || o.txid) === String(orderId));
    // Always prefer fresh credentials from API when available
    if (window.AcctSuiteApi && window.AcctSuiteApiSync && window.AcctSuiteApiSync.usingApi()) {
      try {
        const res = await window.AcctSuiteApi.getOrder(orderId);
        if (res && res.order) {
          const mapped = window.AcctSuiteApiSync.mapOrder
            ? window.AcctSuiteApiSync.mapOrder(res.order)
            : res.order;
          if (u) {
            const rest = (u.orders || []).filter((o) => String(o.id) !== String(mapped.id));
            u.orders = [mapped].concat(rest);
            A().persistUser(u);
          }
          order = mapped;
        }
      } catch (e) {
        console.warn('orders.get failed', e);
      }
    }
    if (!order) {
      alert('Order not found. Pull to refresh or reopen Purchase.');
      return;
    }
    activeOrderId = String(order.id);
    const rawCred = order.credentials;
    const cred = rawCred && typeof rawCred === 'object' ? rawCred : {};
    const hasCreds = !!(cred.username || cred.password || cred.previewLink || cred.twoFA || cred.attachedEmail || cred.extraInfo);
    const isSeller = order.role === 'seller';
    const other = isSeller ? order.buyerName : order.sellerName;
    const tx = order.txid || order.publicId || order.id;
    document.getElementById('modalBody').innerHTML = `
      <h3 class="font-bold text-lg mb-1">Order details</h3>
      <p class="text-xs text-slate-500 mb-3">${escapeHtml(order.title)} · <span class="capitalize">${escapeHtml(order.status)}</span></p>
      <div class="text-sm space-y-2 mb-4">
        <div class="flex justify-between gap-2"><span class="text-slate-500">Transaction ID</span><span class="font-mono text-[11px] text-right break-all">${escapeHtml(tx)}</span></div>
        <div class="flex justify-between"><span class="text-slate-500">${isSeller ? 'Buyer' : 'Seller'}</span><span class="font-medium">${escapeHtml(other)}</span></div>
        <div class="flex justify-between"><span class="text-slate-500">Price</span><span class="font-bold text-brandPrimary">${money(order.price)}</span></div>
      </div>
      ${window.CommerceUI ? window.CommerceUI.orderStatusExtrasHtml(order) : ''}
      ${
        order.status === 'pending' && isSeller
          ? `<p class="text-[11px] text-amber-600 mb-3">Manual sale: funds are on hold until you send login details in chat. AI releases escrow when credentials are detected.</p>`
          : ''
      }
      ${
        order.status !== 'cancelled'
          ? `<div class="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 text-sm font-mono space-y-1 mb-4">
        <p class="text-[10px] uppercase text-slate-400 font-sans font-bold mb-1">Account credentials</p>
        ${
          hasCreds
            ? `<p><span class="text-slate-500">User:</span> ${escapeHtml(cred.username || '—')}</p>
        <p><span class="text-slate-500">Pass:</span> ${escapeHtml(cred.password || '—')}</p>
        ${cred.previewLink ? `<p class="break-all"><span class="text-slate-500">Link:</span> ${escapeHtml(cred.previewLink)}</p>` : ''}
        ${cred.twoFA ? `<p><span class="text-slate-500">2FA:</span> ${escapeHtml(cred.twoFA)}</p>` : ''}
        ${cred.attachedEmail ? `<p><span class="text-slate-500">Email:</span> ${escapeHtml(cred.attachedEmail)}</p>` : ''}
        ${cred.attachedEmailPassword ? `<p><span class="text-slate-500">Email pass:</span> ${escapeHtml(cred.attachedEmailPassword)}</p>` : ''}
        ${cred.extraInfo ? `<p class="font-sans text-xs mt-2 whitespace-pre-wrap">${escapeHtml(cred.extraInfo)}</p>` : ''}`
            : `<p class="font-sans text-xs text-amber-600">${
                order.status === 'pending' && !isSeller
                  ? 'Awaiting seller to deliver login details…'
                  : isSeller
                    ? 'Deliver login details in chat for this order.'
                    : 'Credentials are not available yet. Tap retry or contact Support with your TXID.'
              }</p>
              ${!isSeller ? `<button type="button" onclick="openOrderDetail('${escapeAttr(String(order.id))}')" class="mt-2 text-xs font-bold text-brandPrimary underline">Retry load credentials</button>` : ''}`
        }
      </div>`
          : '<p class="text-xs text-red-500 mb-4">Order cancelled / refunded.</p>'
      }
      <div class="grid grid-cols-2 gap-2">
        <button onclick="openOrderChat('${escapeAttr(String(order.id))}')" class="bg-brandPrimary text-white py-2.5 rounded-xl text-xs font-bold">Chat ${isSeller ? 'Buyer' : 'Seller'}</button>
        ${isSeller && order.status !== 'cancelled' ? `<button onclick="confirmRefund('${escapeAttr(String(order.id))}')" class="bg-red-500 text-white py-2.5 rounded-xl text-xs font-bold">Refund Buyer</button>` : '<div></div>'}
        ${!isSeller && order.canReview ? `<button onclick="leaveSellerReview('${escapeAttr(String(order.id))}')" class="col-span-2 border border-brandPrimary text-brandPrimary py-2.5 rounded-xl text-xs font-bold">Leave a review</button>` : ''}
        ${!isSeller && order.sellerEmail ? `<button onclick="openSellerProfile('${escapeAttr(order.sellerEmail)}')" class="col-span-2 text-xs text-slate-500 underline py-1">View seller profile</button>` : ''}
        ${isSeller && order.status === 'pending' ? `<button onclick="releaseOrder('${escapeAttr(String(order.id))}')" class="col-span-2 border border-brandPrimary text-brandPrimary py-2.5 rounded-xl text-xs font-bold">I sent login details — release funds</button>` : ''}
      </div>`;
    (function(){var m=document.getElementById('appModal'); if(!m)return; m.classList.remove('hidden'); m.classList.add('flex');})();
  };

  window.leaveSellerReview = async function (orderId) {
    const rating = parseInt(prompt('Rate this seller (1–5 stars):', '5') || '', 10);
    if (!(rating >= 1 && rating <= 5)) return;
    const comment = prompt('Optional comment:', '') || '';
    try {
      if (!window.AcctSuiteApi) throw new Error('API unavailable');
      await window.AcctSuiteApi.createReview({ orderId: Number(orderId), rating, comment });
      if (window.AcctSuiteApiSync) await window.AcctSuiteApiSync.hydrateFromApi();
      closeModal();
      renderOrders();
      renderPurchase();
      alert('Thanks for your review!');
    } catch (e) {
      alert(e.message || 'Could not submit review');
    }
  };

  window.goToSellerStore = function (sellerKey) {
    const key = String(sellerKey || '').trim();
    if (!key) {
      alert('Store unavailable.');
      return;
    }
    if (typeof closeModal === 'function') closeModal();
    // Prefer merchant slug; emails are supported by sellers.storefront fallback.
    window.location.href = '/seller/' + encodeURIComponent(key);
  };

  window.openSellerProfile = window.goToSellerStore;

  function findStoryBundle(sellerEmail) {
    const email = String(sellerEmail || '').toLowerCase();
    const feed = window.__acctsuiteStoryFeed || [];
    return feed.find((m) => String(m.sellerEmail || '').toLowerCase() === email) || null;
  }

  let storyViewerTimer = null;
  let storyViewerIdx = 0;
  let storyViewerBundle = null;

  function ensureStoryViewer() {
    let el = document.getElementById('avStoryViewer');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'avStoryViewer';
    el.className = 'av-story-viewer hidden';
    el.innerHTML = `
      <div class="av-story-viewer__shade" data-close-story="1"></div>
      <div class="av-story-viewer__card">
        <div class="av-story-viewer__bars" id="avStoryBars"></div>
        <div class="av-story-viewer__top">
          <div class="av-story-viewer__who">
            <span class="av-story-viewer__avatar" id="avStoryAvatar"></span>
            <div>
              <p class="av-story-viewer__name" id="avStoryName"></p>
              <p class="av-story-viewer__time" id="avStoryTime"></p>
            </div>
          </div>
          <button type="button" class="av-story-viewer__close" data-close-story="1" aria-label="Close"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <img id="avStoryImage" class="av-story-viewer__img" alt="">
        <p class="av-story-viewer__caption" id="avStoryCaption"></p>
        <button type="button" class="av-story-viewer__nav av-story-viewer__nav--prev" id="avStoryPrev" aria-label="Previous"></button>
        <button type="button" class="av-story-viewer__nav av-story-viewer__nav--next" id="avStoryNext" aria-label="Next"></button>
        <a href="#" class="av-story-viewer__store" id="avStoryStore">View store</a>
      </div>`;
    document.body.appendChild(el);
    el.addEventListener('click', (ev) => {
      if (ev.target.closest('[data-close-story]')) closeStoryViewer();
    });
    document.getElementById('avStoryPrev').onclick = () => showStoryAt(storyViewerIdx - 1);
    document.getElementById('avStoryNext').onclick = () => showStoryAt(storyViewerIdx + 1);
    return el;
  }

  function closeStoryViewer() {
    if (storyViewerTimer) {
      clearTimeout(storyViewerTimer);
      storyViewerTimer = null;
    }
    const el = document.getElementById('avStoryViewer');
    if (el) el.classList.add('hidden');
    storyViewerBundle = null;
  }

  function formatStoryAge(iso) {
    const t = new Date(iso).getTime();
    if (!t || isNaN(t)) return 'now';
    const min = Math.max(0, Math.floor((Date.now() - t) / 60000));
    if (min < 60) return min + 'm';
    const hr = Math.floor(min / 60);
    if (hr < 24) return hr + 'h';
    return Math.floor(hr / 24) + 'd';
  }

  function showStoryAt(idx) {
    if (!storyViewerBundle || !Array.isArray(storyViewerBundle.stories)) return;
    const stories = storyViewerBundle.stories;
    if (idx < 0) {
      closeStoryViewer();
      return;
    }
    if (idx >= stories.length) {
      closeStoryViewer();
      const slug = storyViewerBundle.sellerMerchantSlug || storyViewerBundle.sellerEmail;
      if (slug) goToSellerStore(slug);
      return;
    }
    storyViewerIdx = idx;
    const s = stories[idx];
    const bars = document.getElementById('avStoryBars');
    bars.innerHTML = stories
      .map((_, i) => `<span class="av-story-bar${i < idx ? ' is-done' : ''}${i === idx ? ' is-active' : ''}"><i></i></span>`)
      .join('');
    const avatar = document.getElementById('avStoryAvatar');
    avatar.innerHTML = sellerAvatarFaceHtml(
      storyViewerBundle.sellerAvatar || s.sellerAvatar,
      (storyViewerBundle.sellerName || 'S').slice(0, 2).toUpperCase(),
      'av-merchant-face-img'
    );
    document.getElementById('avStoryName').textContent = storyViewerBundle.sellerName || 'Seller';
    document.getElementById('avStoryTime').textContent = formatStoryAge(s.createdAt);
    document.getElementById('avStoryImage').src = s.imageUrl || '';
    document.getElementById('avStoryCaption').textContent = s.caption || '';
    document.getElementById('avStoryCaption').classList.toggle('hidden', !(s.caption || '').trim());
    const store = document.getElementById('avStoryStore');
    const slug = storyViewerBundle.sellerMerchantSlug || storyViewerBundle.sellerEmail || '';
    store.href = '/seller/' + encodeURIComponent(slug);
    store.onclick = (e) => {
      e.preventDefault();
      closeStoryViewer();
      goToSellerStore(slug);
    };
    if (storyViewerTimer) clearTimeout(storyViewerTimer);
    storyViewerTimer = setTimeout(() => showStoryAt(idx + 1), 5200);
  }

  window.openMerchantStory = async function (sellerEmail) {
    let bundle = findStoryBundle(sellerEmail);
    if ((!bundle || !(bundle.stories || []).length) && window.AcctSuiteApi) {
      try {
        const res = await window.AcctSuiteApi.storiesBySeller({ sellerEmail });
        if (res.stories && res.stories.length) {
          bundle = {
            sellerEmail,
            sellerName: res.stories[0].sellerName,
            sellerAvatar: res.stories[0].sellerAvatar,
            sellerMerchantSlug: res.stories[0].sellerMerchantSlug,
            stories: res.stories,
          };
        }
      } catch (e) {}
    }
    if (!bundle || !(bundle.stories || []).length) {
      goToSellerStore(sellerEmail);
      return;
    }
    storyViewerBundle = bundle;
    ensureStoryViewer().classList.remove('hidden');
    showStoryAt(0);
  };

  window.openMyStories = async function () {
    const u = requireAuth({ message: 'Sign in to manage your stories' });
    if (!u) return;
    const body = document.getElementById('modalBody');
    if (!body) return;
    body.innerHTML = `<h3 class="font-bold text-lg mb-1">My Stories</h3>
      <p class="text-xs text-slate-500 mb-3">Photos stay live for 24 hours on Top Merchants.</p>
      <div id="myStoriesList" class="space-y-2 mb-4 text-sm text-slate-500">Loading…</div>
      <label class="block text-xs font-medium text-slate-500 mb-1">Caption (optional)</label>
      <input type="text" id="storyCaption" maxlength="280" placeholder="Say something…" class="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 text-sm mb-3">
      <input type="file" id="storyPhotoInput" accept="image/jpeg,image/png,image/webp" class="hidden">
      <button type="button" id="storyUploadBtn" class="w-full bg-brandPrimary hover:bg-brandHover text-white font-bold py-3 rounded-xl mb-2"><i class="fa-solid fa-camera mr-2"></i>Add story photo</button>
      <button type="button" onclick="closeModal()" class="w-full border border-slate-300 dark:border-slate-700 py-2.5 rounded-xl text-sm font-semibold">Close</button>`;
    (function () {
      const m = document.getElementById('appModal');
      if (!m) return;
      m.classList.remove('hidden');
      m.classList.add('flex');
    })();

    async function refreshMine() {
      const box = document.getElementById('myStoriesList');
      if (!box) return;
      try {
        const res = await window.AcctSuiteApi.storiesMine();
        const stories = res.stories || [];
        if (!stories.length) {
          box.innerHTML = '<p class="text-xs text-slate-500">You haven\'t posted any stories yet.</p>';
          return;
        }
        box.innerHTML = stories
          .map(
            (s) => `<div class="flex gap-2 items-center border border-slate-200 dark:border-slate-800 rounded-xl p-2">
            <img src="${escapeAttr(s.imageUrl)}" alt="" class="w-12 h-12 rounded-lg object-cover shrink-0">
            <div class="min-w-0 flex-1"><p class="text-xs truncate">${escapeHtml(s.caption || 'No caption')}</p><p class="text-[10px] text-slate-400">${escapeHtml(formatStoryAge(s.createdAt))} ago</p></div>
            <button type="button" class="text-red-500 text-xs font-bold px-2" data-del-story="${escapeAttr(String(s.id))}">Delete</button>
          </div>`
          )
          .join('');
        box.querySelectorAll('[data-del-story]').forEach((btn) => {
          btn.addEventListener('click', async () => {
            try {
              await window.AcctSuiteApi.storiesDelete({ id: btn.getAttribute('data-del-story') });
              refreshMine();
              if (window.AcctSuiteApi.storiesFeed) {
                const feed = await window.AcctSuiteApi.storiesFeed().catch(() => ({ merchants: [] }));
                window.__acctsuiteStoryFeed = feed.merchants || [];
                renderMarketplace();
              }
            } catch (e) {
              alert(e.message || 'Could not delete');
            }
          });
        });
      } catch (e) {
        box.innerHTML = `<p class="text-xs text-red-500">${escapeHtml(e.message || 'Could not load stories')}</p>`;
      }
    }

    refreshMine();
    const fileInput = document.getElementById('storyPhotoInput');
    const uploadBtn = document.getElementById('storyUploadBtn');
    uploadBtn.onclick = () => fileInput.click();
    fileInput.onchange = () => {
      const file = fileInput.files && fileInput.files[0];
      if (!file) return;
      if (file.size > 3 * 1024 * 1024) {
        alert('Photo is too large (max 3MB)');
        return;
      }
      const reader = new FileReader();
      reader.onload = async () => {
        uploadBtn.disabled = true;
        uploadBtn.textContent = 'Uploading…';
        try {
          const caption = (document.getElementById('storyCaption') || {}).value || '';
          await window.AcctSuiteApi.storiesCreate({ image: reader.result, caption });
          fileInput.value = '';
          if (document.getElementById('storyCaption')) document.getElementById('storyCaption').value = '';
          const feed = await window.AcctSuiteApi.storiesFeed().catch(() => ({ merchants: [] }));
          window.__acctsuiteStoryFeed = feed.merchants || [];
          renderMarketplace();
          await refreshMine();
          if (window.AcctSuiteToast) window.AcctSuiteToast.success('Story posted');
        } catch (e) {
          alert(e.message || 'Could not post story');
        } finally {
          uploadBtn.disabled = false;
          uploadBtn.innerHTML = '<i class="fa-solid fa-camera mr-2"></i>Add story photo';
        }
      };
      reader.readAsDataURL(file);
    };
  };

  window.copyMerchantLink = function () {
    const el = document.getElementById('profileMerchantUrl');
    const url = (el && el.dataset.full) || '';
    if (!url) return;
    const done = () => {
      if (window.AcctSuiteToast) window.AcctSuiteToast.show('Merchant link copied', { type: 'success' });
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(done).catch(() => {});
    }
  };

  function resolveBuyListingId() {
    try {
      const hash = String(location.hash || '');
      const qIdx = hash.indexOf('?');
      if (qIdx !== -1) {
        const fromHash = new URLSearchParams(hash.slice(qIdx + 1)).get('buy');
        if (fromHash) return String(fromHash);
      }
    } catch (e) {}
    try {
      const stored = sessionStorage.getItem('acctsuite_open_listing');
      if (stored) {
        sessionStorage.removeItem('acctsuite_open_listing');
        return String(stored);
      }
    } catch (e) {}
    return '';
  }

  function handleBuyDeepLink() {
    const buyId = resolveBuyListingId();
    if (!buyId || typeof window.openListingDetail !== 'function') return;
    setTimeout(() => window.openListingDetail(buyId), 400);
  }

  window.handleBuyDeepLink = handleBuyDeepLink;

  window.confirmRefund = async function (orderId) {
    const refundOk = window.AcctSuiteConfirm
      ? await window.AcctSuiteConfirm({
          title: 'Refund order',
          message:
            'Refund this order to the buyer? Seller balance can go negative (owing) if funds are insufficient. Future sales repay the debt automatically.',
          okText: 'Refund buyer',
          icon: 'fa-rotate-left',
          danger: true,
        })
      : confirm(
          'Refund this order to the buyer? Seller balance can go negative (owing) if funds are insufficient. Future sales repay the debt automatically.'
        );
    if (!refundOk) return;
    const u = refreshUser();
    const res = await Promise.resolve(A().refundOrder(u, orderId));
    if (!res.ok) {
      alert(res.error);
      return;
    }
    closeModal();
    applyProfileChrome(refreshUser());
    renderOrders();
    renderPurchase();
    alert('Buyer refunded.' + (res.owing ? ' You now owe $' + Number(res.owing).toFixed(2) + '.' : ''));
  };

  window.releaseOrder = async function (orderId) {
    const u = refreshUser();
    const res = await Promise.resolve(A().completeManualOrder(u, orderId));
    if (!res.ok) {
      alert(res.error);
      return;
    }
    closeModal();
    applyProfileChrome(refreshUser());
    renderOrders();
    renderPurchase();
    alert('Order completed. Funds moved from escrow to your balance.');
  };

  window.openOrderChat = async function (orderId) {
    activeOrderId = orderId;
    chatMode = 'order';
    supportThreadId = null;
    pendingChatAttachment = null;
    stopChatPoll();
    closeModal();
    const u = refreshUser();
    const order = (u.orders || []).find((o) => String(o.id) === String(orderId));
    const tx = order ? order.txid || order.publicId || orderId : orderId;
    document.getElementById('chatTitle').textContent = 'Order Chat';
    document.getElementById('chatSubtitle').textContent = 'TXID: ' + tx;
    document.getElementById('chatOnlineDot').classList.add('hidden');
    document.getElementById('chatTyping').textContent = '';
    const reportBtn = document.getElementById('chatReportBtn');
    if (reportBtn) {
      const isBuyer = order && order.role === 'buyer';
      reportBtn.classList.toggle('hidden', !isBuyer);
    }
    document.getElementById('chatOverlay').classList.remove('hidden');
    document.getElementById('chatOverlay').classList.add('flex');
    if (window.CommerceUI) window.CommerceUI.showChatRulesBanner(true);
    if (window.AcctSuiteApiSync && window.AcctSuiteApiSync.usingApi()) {
      await window.AcctSuiteApiSync.loadMessages(orderId);
    }
    renderChat();
  };

  window.openSupportChat = async function () {
    const u = requireAuth({ message: 'You are not logged in. Sign in first.' });
    if (!u) return;
    chatMode = 'support';
    activeOrderId = null;
    pendingChatAttachment = null;
    stopChatPoll();
    closeModal();
    document.getElementById('chatTitle').textContent = 'Chat Support';
    document.getElementById('chatSubtitle').textContent = 'AcctSuite Support';
    const reportBtn = document.getElementById('chatReportBtn');
    if (reportBtn) reportBtn.classList.add('hidden');
    document.getElementById('chatOverlay').classList.remove('hidden');
    document.getElementById('chatOverlay').classList.add('flex');
    if (window.CommerceUI) window.CommerceUI.showChatRulesBanner(false);
    try {
      if (window.AcctSuiteApi && (await window.AcctSuiteApi.isAvailable())) {
        const res = await window.AcctSuiteApi.supportOpen();
        supportThreadId = res.thread && res.thread.id;
        supportMessagesCache = res.messages || [];
        updateSupportPresence(res.thread);
        renderChat();
        startChatPoll();
        ensureBrowserNotifications();
        return;
      }
    } catch (e) {
      alert(e.message || 'Could not open chat support. Check your login.');
    }
    document.getElementById('chatMessages').innerHTML =
      '<p class="text-center text-xs text-slate-400 py-8">Live chat needs the online backend. Log out and log in again, then retry.</p>';
  };

  window.reportSellerFromChat = async function () {
    if (chatMode !== 'order' || !activeOrderId) return;
    const reason = prompt('Why are you reporting this seller? Describe the problem:');
    if (!reason || !String(reason).trim()) return;
    try {
      await window.AcctSuiteApi.reportSeller({ orderId: Number(activeOrderId), reason: String(reason).trim() });
      alert('Report submitted. Support can review the order chat using the Transaction ID.');
    } catch (e) {
      alert(e.message || 'Could not submit report');
    }
  };

  let pendingChatAttachment = null;

  window.onChatFileSelected = function (ev) {
    const file = ev.target.files && ev.target.files[0];
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      alert('File too large (max 8MB)');
      ev.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      pendingChatAttachment = { dataUrl: reader.result, name: file.name, mime: file.type };
      const hint = document.getElementById('chatAttachHint');
      if (hint) {
        hint.classList.remove('hidden');
        hint.textContent = 'Attached: ' + file.name + ' — send to upload';
      }
    };
    reader.readAsDataURL(file);
    ev.target.value = '';
  };

  function attachmentHtml(m, mine) {
    if (!m.attachmentUrl) return '';
    const mime = String(m.attachmentMime || '');
    const name = String(m.attachmentName || '');
    const isImg =
      mime.startsWith('image/') ||
      /\.(png|jpe?g|gif|webp|heic|heif|bmp)$/i.test(m.attachmentUrl) ||
      /\.(png|jpe?g|gif|webp|heic|heif|bmp)$/i.test(name);
    if (isImg) {
      return `<a href="${escapeAttr(m.attachmentUrl)}" target="_blank" rel="noopener" class="block mt-1"><img src="${escapeAttr(m.attachmentUrl)}" alt="" class="max-w-full rounded-lg max-h-40 object-cover" loading="lazy" onerror="this.onerror=null;this.outerHTML='<span class=\\'text-[11px] opacity-80 italic\\'>Photo unavailable — ask support to resend</span>';"></a>`;
    }
    return `<a href="${escapeAttr(m.attachmentUrl)}" target="_blank" rel="noopener" class="inline-flex items-center gap-1 mt-1 text-[11px] underline ${mine ? 'text-white/90' : 'text-brandPrimary'}"><i class="fa-solid fa-file"></i> ${escapeHtml(m.attachmentName || 'Download file')}</a>`;
  }

  function supportBodyHtml(m) {
    const body = String(m.body || m.text || '').trim();
    const name = String(m.attachmentName || '').trim();
    if (!body) return '';
    if (m.attachmentUrl && name && (body === name || body === '📎 ' + name || /^📎\s/.test(body))) return '';
    return escapeHtml(body);
  }

  function updateSupportPresence(thread) {
    const dot = document.getElementById('chatOnlineDot');
    const sub = document.getElementById('chatSubtitle');
    const typing = document.getElementById('chatTyping');
    if (!thread) return;
    if (dot) {
      dot.classList.toggle('hidden', !thread.staffOnline);
      dot.title = thread.staffOnline ? 'Support online' : '';
    }
    if (sub) sub.textContent = thread.staffOnline ? 'Support · Online' : 'Support · Typically replies in minutes';
    if (typing) typing.textContent = thread.staffTyping ? 'Support is typing…' : '';
  }

  let chatPollTimer = null;
  let supportThreadId = null;
  let supportMessagesCache = [];
  let chatMode = 'order'; // order | support
  let lastSupportMsgId = 0;
  let typingTimer = null;

  function stopChatPoll() {
    if (chatPollTimer) {
      clearInterval(chatPollTimer);
      chatPollTimer = null;
    }
  }

  function startChatPoll() {
    stopChatPoll();
    chatPollTimer = setInterval(async () => {
      if (chatMode !== 'support' || !window.AcctSuiteApi) return;
      try {
        const res = await window.AcctSuiteApi.supportMessages(supportThreadId);
        supportThreadId = res.thread && res.thread.id;
        const msgs = res.messages || [];
        const newest = msgs.length ? msgs[msgs.length - 1].id : 0;
        if (newest && newest !== lastSupportMsgId) {
          const last = msgs[msgs.length - 1];
          if (last && last.role === 'staff' && last.id !== lastSupportMsgId && lastSupportMsgId > 0) {
            fireBrowserNotification('Support reply', last.body || 'New message from support');
          }
          lastSupportMsgId = newest;
          supportMessagesCache = msgs;
          renderChat();
        } else {
          supportMessagesCache = msgs;
        }
        updateSupportPresence(res.thread);
      } catch (e) {}
    }, 2500);
  }

  function ensureBrowserNotifications() {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
  }

  function fireBrowserNotification(title, body) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    if (document.visibilityState === 'visible' && chatMode === 'support') return;
    try {
      new Notification(title, { body: String(body || '').slice(0, 120), icon: '/img/logo.png' });
    } catch (e) {}
  }

  window.onChatTyping = function () {
    if (chatMode !== 'support' || !window.AcctSuiteApi) return;
    clearTimeout(typingTimer);
    window.AcctSuiteApi.supportTyping({ typing: true }).catch(() => {});
    typingTimer = setTimeout(() => {
      window.AcctSuiteApi.supportTyping({ typing: false }).catch(() => {});
    }, 1500);
  };

  window.closeOrderChat = function () {
    stopChatPoll();
    if (chatMode === 'support' && window.AcctSuiteApi) {
      window.AcctSuiteApi.supportTyping({ typing: false }).catch(() => {});
    }
    chatMode = 'order';
    document.getElementById('chatOverlay').classList.add('hidden');
    document.getElementById('chatOverlay').classList.remove('flex');
  };

  function renderChat() {
    const box = document.getElementById('chatMessages');
    if (!box) return;
    const u = refreshUser();
    if (chatMode === 'support') {
      const msgs = supportMessagesCache || [];
      box.innerHTML = msgs.length
        ? msgs
            .map((m) => {
              const mine = m.role === 'user';
              const name = mine ? (u && u.name) || 'You' : m.staffName || 'Support';
              const body = supportBodyHtml(m);
              return `<div class="flex ${mine ? 'justify-end' : 'justify-start'}"><div class="max-w-[80%] rounded-2xl px-3 py-2 text-sm ${mine ? 'bg-brandPrimary text-white' : 'bg-slate-100 dark:bg-slate-800'}"><p class="text-[10px] opacity-70 mb-0.5">${escapeHtml(name)}</p>${body ? `<p class="whitespace-pre-wrap break-words">${body}</p>` : ''}${attachmentHtml(m, mine)}</div></div>`;
            })
            .join('')
        : '<p class="text-center text-xs text-slate-400 py-8">No messages yet. Ask support anything — you can also attach screenshots.</p>';
      if (msgs.length) lastSupportMsgId = msgs[msgs.length - 1].id;
      box.scrollTop = box.scrollHeight;
      return;
    }
    if (!activeOrderId) return;
    const msgs = A().getMessages(activeOrderId);
    box.innerHTML = msgs.length
      ? msgs
          .map((m) => {
            const mine = m.fromEmail === u.email;
            return `<div class="flex ${mine ? 'justify-end' : 'justify-start'}"><div class="max-w-[80%] rounded-2xl px-3 py-2 text-sm ${mine ? 'bg-brandPrimary text-white' : 'bg-slate-100 dark:bg-slate-800'}"><p class="text-[10px] opacity-70 mb-0.5">${escapeHtml(m.fromName)}</p><p class="whitespace-pre-wrap break-words">${escapeHtml(m.text)}</p>${attachmentHtml(m, mine)}</div></div>`;
          })
          .join('')
      : '<p class="text-center text-xs text-slate-400 py-8">No messages yet. Say hello — attach screenshots with the paperclip.</p>';
    box.scrollTop = box.scrollHeight;
  }

  window.sendChatMessage = async function () {
    const input = document.getElementById('chatInput');
    const text = (input.value || '').trim();
    const attach = pendingChatAttachment;
    if (!text && !attach) return;
    if (chatMode === 'support') {
      try {
        const payload = { text: text || '', threadId: supportThreadId };
        if (attach) {
          payload.attachment = attach.dataUrl;
          payload.fileName = attach.name;
        }
        const res = await window.AcctSuiteApi.supportSend(payload);
        supportMessagesCache = res.messages || [];
        if (res.thread) updateSupportPresence(res.thread);
        input.value = '';
        pendingChatAttachment = null;
        const hint = document.getElementById('chatAttachHint');
        if (hint) {
          hint.classList.add('hidden');
          hint.textContent = '';
        }
        renderChat();
      } catch (e) {
        alert(e.message || 'Send failed');
      }
      return;
    }
    if (!activeOrderId) return;
    const u = refreshUser();
    const extra = attach ? { attachment: attach.dataUrl, fileName: attach.name } : null;
    const res = await Promise.resolve(A().sendMessage(u, activeOrderId, text || '', extra));
    if (res && res.ok === false) {
      if (res.code === 'external_contact_blocked' && window.CommerceUI) {
        window.CommerceUI.handleBlockedChatMessage(res.error);
      } else {
        alert(res.error || 'Send failed');
      }
      return;
    }
    input.value = '';
    pendingChatAttachment = null;
    const hint = document.getElementById('chatAttachHint');
    if (hint) {
      hint.classList.add('hidden');
      hint.textContent = '';
    }
    if (window.AcctSuiteApiSync && window.AcctSuiteApiSync.usingApi()) {
      await window.AcctSuiteApiSync.loadMessages(activeOrderId);
      if (res && res.fundsReleased) {
        await window.AcctSuiteApiSync.hydrateFromApi();
        applyProfileChrome(refreshUser());
        alert('AI confirmed login details were sent. Escrow funds released to the seller.');
      }
    }
    renderChat();
  };

  // Presence heartbeat while logged in
  setInterval(() => {
    if (window.AcctSuiteApi && window.AcctSuiteApi.getToken && window.AcctSuiteApi.getToken()) {
      window.AcctSuiteApi.presencePing().catch(() => {});
    }
  }, 60000);

  window.selectPlan = async function (planId, method) {
    const u = refreshUser();
    if (!u) return;
    const plan = (A().PLANS && A().PLANS[planId]) || null;
    const price = plan ? Number(plan.price) || 0 : 0;
    const payMethod = method || (price > 0 ? 'flutterwave' : 'free');

    async function runUpgrade() {
      try {
        const methodBody = payMethod === 'wallet' ? 'wallet' : price > 0 ? 'flutterwave' : 'free';
        let res = null;
        // Prefer live API when logged in (token, cookie, or api-sync flag).
        const Api = window.AcctSuiteApi;
        const Sync = window.AcctSuiteApiSync;
        const hasApiSession = !!(
          (Api && typeof Api.getToken === 'function' && Api.getToken()) ||
          (Sync && typeof Sync.usingApi === 'function' && Sync.usingApi())
        );
        if (hasApiSession && Api && typeof Api.upgradePlan === 'function') {
          try {
            const apiRes = await Api.upgradePlan({ planId: String(planId), method: methodBody });
            if (apiRes && apiRes.paymentLink) {
              window.location.href = apiRes.paymentLink;
              return;
            }
            res = {
              ok: true,
              plan: apiRes.plan,
              dailyUploads: apiRes.dailyUploads,
              message: apiRes.message || 'Plan updated.',
            };
          } catch (apiErr) {
            res = {
              ok: false,
              error: (apiErr && apiErr.message) || 'Plan upgrade failed',
              code: (apiErr && apiErr.code) || '',
            };
          }
        } else {
          res = await Promise.resolve(A().setPlan(u, planId, { method: methodBody }));
        }
        if (!res || !res.ok) {
          if (res && (res.code === 'insufficient_funds' || /insufficient/i.test(String(res.error || '')))) {
            if (window.CommerceUI && typeof window.CommerceUI.showInsufficientFundsModal === 'function') {
              window.CommerceUI.showInsufficientFundsModal();
            } else {
              alert(res.error || 'Insufficient funds');
            }
            return;
          }
          alert((res && res.error) || 'Could not update plan');
          return;
        }
        if (res.checkout) return;
        if (window.AcctSuiteApiSync) await window.AcctSuiteApiSync.hydrateFromApi();
        applyProfileChrome(refreshUser());
        renderPlans();
        const active = A().getPlan(refreshUser());
        alert(res.message || ('Plan updated to ' + active.name + ' — ' + active.dailyUploads + ' uploads / day.'));
      } catch (e) {
        if (e && (e.code === 'insufficient_funds' || /insufficient/i.test(String(e.message || '')))) {
          if (window.CommerceUI && typeof window.CommerceUI.showInsufficientFundsModal === 'function') {
            window.CommerceUI.showInsufficientFundsModal();
          } else {
            alert(e.message || 'Insufficient funds');
          }
          return;
        }
        alert(e.message || 'Plan upgrade failed');
      }
    }

    if (price <= 0) {
      await runUpgrade();
      return;
    }

    if (payMethod === 'wallet') {
      const bal = Number(u.balance) || 0;
      if (bal + 0.0001 < price) {
        if (window.CommerceUI && typeof window.CommerceUI.showInsufficientFundsModal === 'function') {
          window.CommerceUI.showInsufficientFundsModal();
        } else {
          alert('Insufficient funds. Please deposit money into your wallet.');
        }
        return;
      }
    }

    if (window.CommerceUI && typeof window.CommerceUI.confirmPlanCheckout === 'function') {
      const ok = await window.CommerceUI.confirmPlanCheckout({
        planName: plan.name || planId,
        price: price,
        dailyUploads: plan.dailyUploads,
        method: payMethod,
      });
      if (!ok) return;
      await runUpgrade();
      return;
    }

    await runUpgrade();
  };

  window.setAdsFilter = function (f) {
    adsFilter = f;
    document.querySelectorAll('.ads-filter-btn').forEach((b) => {
      b.classList.toggle('text-brandPrimary', b.dataset.filter === f);
      b.classList.toggle('border-brandPrimary', b.dataset.filter === f);
      b.classList.toggle('border-b-2', b.dataset.filter === f);
      b.classList.toggle('text-slate-400', b.dataset.filter !== f);
    });
    renderAds();
  };

  window.setOrdersFilter = function (f) {
    ordersFilter = f;
    document.querySelectorAll('.orders-filter-btn').forEach((b) => {
      b.classList.toggle('text-brandPrimary', b.dataset.filter === f);
      b.classList.toggle('border-brandPrimary', b.dataset.filter === f);
      b.classList.toggle('border-b-2', b.dataset.filter === f);
      b.classList.toggle('text-slate-400', b.dataset.filter !== f);
    });
    renderOrders();
  };

  window.setPurchaseFilter = function (f) {
    purchaseFilter = f;
    document.querySelectorAll('.purchase-filter-btn').forEach((b) => {
      b.classList.toggle('text-brandPrimary', b.dataset.filter === f);
      b.classList.toggle('border-brandPrimary', b.dataset.filter === f);
      b.classList.toggle('border-b-2', b.dataset.filter === f);
      b.classList.toggle('text-slate-400', b.dataset.filter !== f);
    });
    renderPurchase();
  };

  window.setOrdersSearch = function (q) {
    ordersSearch = q || '';
    renderOrders();
  };

  window.setPurchaseSearch = function (q) {
    purchaseSearch = q || '';
    renderPurchase();
  };

  window.copyReferralLink = function () {
    const el = document.getElementById('referralLinkText');
    const link = (el && el.dataset.full) || '';
    if (navigator.clipboard) navigator.clipboard.writeText(link).then(() => alert('Referral link copied!'));
    else alert(link);
  };

  window.shareReferralLink = function () {
    copyReferralLink();
  };

  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  function escapeAttr(s) {
    return escapeHtml(s).replace(/'/g, '&#39;');
  }
  function relativeTime(iso) {
    try {
      const d = new Date(iso);
      const diff = (Date.now() - d.getTime()) / 1000;
      if (diff < 60) return 'just now';
      if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
      if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
      return Math.floor(diff / 86400) + 'd ago';
    } catch (e) {
      return '';
    }
  }

  function compressAvatarFile(file, maxEdge) {
    return new Promise((resolve, reject) => {
      if (!file || !String(file.type || '').startsWith('image/')) {
        reject(new Error('Please choose a photo'));
        return;
      }
      if (file.size > 8 * 1024 * 1024) {
        reject(new Error('Photo is too large (max 8MB)'));
        return;
      }
      const img = new Image();
      const blobUrl = URL.createObjectURL(file);
      img.onload = () => {
        try {
          const max = maxEdge || 512;
          let w = img.width;
          let h = img.height;
          if (w < 1 || h < 1) {
            reject(new Error('Could not read that photo'));
            return;
          }
          if (w > h) {
            if (w > max) {
              h = Math.round((h * max) / w);
              w = max;
            }
          } else if (h > max) {
            w = Math.round((w * max) / h);
            h = max;
          }
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('Could not process photo'));
            return;
          }
          ctx.drawImage(img, 0, 0, w, h);
          URL.revokeObjectURL(blobUrl);
          resolve(canvas.toDataURL('image/jpeg', 0.86));
        } catch (err) {
          URL.revokeObjectURL(blobUrl);
          reject(err);
        }
      };
      img.onerror = () => {
        URL.revokeObjectURL(blobUrl);
        reject(new Error('Could not read that photo'));
      };
      img.src = blobUrl;
    });
  }

  window.AcctSuiteUI = {
    promptSignIn,
    isLoggedIn() {
      return !!refreshUser();
    },
    refreshAll() {
      const u = refreshUser();
      applyProfileChrome(u);
      renderMarketplace();
      if (!u) return;
      renderAds();
      renderOrders();
      renderPurchase();
      renderPlans();
      renderTxHistory();
      renderNotifications();
    },
    onAdsUpdated() {
      const u = refreshUser();
      if (!u) return;
      applyProfileChrome(u);
      renderAds();
      renderMarketplace();
      renderNotifications();
    },
    async onProfilePhoto(input) {
      const file = input && input.files && input.files[0];
      if (input) input.value = '';
      if (!file) return;
      const u = requireAuth({ message: 'You are not logged in. Sign in to update your photo.' });
      if (!u) return;
      try {
        const dataUrl = await compressAvatarFile(file);
        if (window.AcctSuiteApiSync && window.AcctSuiteApiSync.usingApi() && window.AcctSuiteApi) {
          const res = await window.AcctSuiteApi.updateProfile({
            name: u.name,
            phone: u.phone || '',
            avatar: dataUrl,
          });
          if (res && res.user && res.user.avatarUrl) {
            u.avatarUrl = res.user.avatarUrl;
          } else {
            u.avatarUrl = dataUrl;
          }
          A().persistUser(u);
          if (window.AcctSuiteApiSync.hydrateFromApi) {
            await window.AcctSuiteApiSync.hydrateFromApi();
          }
        } else {
          u.avatarUrl = dataUrl;
          A().persistUser(u);
        }
        applyProfileChrome(A().getCurrentUser() || u);
        if (window.AcctSuiteToast) window.AcctSuiteToast.success('Profile photo updated');
        else alert('Profile photo updated');
      } catch (e) {
        alert((e && e.message) || 'Could not update photo');
      }
    }
    ,
    async onCoverPhoto(input) {
      const file = input && input.files && input.files[0];
      if (input) input.value = '';
      if (!file) return;
      const u = requireAuth({ message: 'You are not logged in. Sign in to update your cover photo.' });
      if (!u) return;
      try {
        const dataUrl = await compressAvatarFile(file, 1600);
        if (window.AcctSuiteApiSync && window.AcctSuiteApiSync.usingApi() && window.AcctSuiteApi) {
          const res = await window.AcctSuiteApi.updateProfile({
            name: u.name,
            phone: u.phone || '',
            cover: dataUrl,
          });
          if (res && res.user && res.user.coverUrl) {
            u.coverUrl = res.user.coverUrl;
          } else {
            u.coverUrl = dataUrl;
          }
          A().persistUser(u);
          if (window.AcctSuiteApiSync.hydrateFromApi) {
            await window.AcctSuiteApiSync.hydrateFromApi();
          }
        } else {
          u.coverUrl = dataUrl;
          A().persistUser(u);
        }
        applyProfileChrome(A().getCurrentUser() || u);
        if (window.AcctSuiteToast) window.AcctSuiteToast.success('Cover photo updated');
        else alert('Cover photo updated');
      } catch (e) {
        alert((e && e.message) || 'Could not update cover photo');
      }
    }
  };

  window.addEventListener('acctsuite:wallet-updated', () => {
    try {
      applyProfileChrome(refreshUser());
    } catch (e) {}
  });

  document.addEventListener('DOMContentLoaded', async () => {
    if (window.AcctSuiteApiSync) {
      try {
        const Api = window.AcctSuiteApi;
        let online = false;
        if (Api) {
          try {
            online = await Api.isAvailable();
          } catch (e) {}
        }
        if (online && Api) {
          if (window.AcctSuiteApiSync.ensureApiSession) {
            await window.AcctSuiteApiSync.ensureApiSession(Api);
          }
          if (typeof window.AcctSuiteApiSync.patchAcctSuiteForApi === 'function') {
            window.AcctSuiteApiSync.patchAcctSuiteForApi();
          }
        }
      } catch (e) {}
      // Public market first so home cards appear on the first paint (session hydrate must never block them).
      if (window.AcctSuiteApiSync.hydratePublicMarket) {
        await window.AcctSuiteApiSync.hydratePublicMarket();
      }
      const hydrated = await window.AcctSuiteApiSync.hydrateFromApi();
      // Always re-pull orders/ads after hydrate so lists are never stuck empty
      try {
        if (hydrated && window.AcctSuiteApiSync.refreshOrdersFromApi) {
          await window.AcctSuiteApiSync.refreshOrdersFromApi();
        }
        if (hydrated && window.AcctSuiteApiSync.refreshAdsFromApi) {
          await window.AcctSuiteApiSync.refreshAdsFromApi();
        }
      } catch (e) {}
    }
    // Mark ready even if API sync is missing, so home never sticks on skeleton.
    window.__acctsuiteMarketReady = true;
    window.AcctSuiteUI.refreshAll();
    try {
      if (window.AcctSuiteKyc && refreshUser()) await window.AcctSuiteKyc.refreshStatus();
    } catch (e) {}
    // Keep the user on wallet/orders/etc after refresh (do not bounce to home)
    try {
      if (typeof window.restoreDashTab === 'function') window.restoreDashTab();
    } catch (e) {}
    // Open a specific order from email deep-link: #purchase?txid=... or #orders?txid=...
    try {
      const hash = String(location.hash || '');
      const qIdx = hash.indexOf('?');
      if (qIdx !== -1) {
        const params = new URLSearchParams(hash.slice(qIdx + 1));
        const txid = params.get('txid') || params.get('orderId') || params.get('id');
        if (txid && typeof window.openOrderDetail === 'function') {
          setTimeout(() => window.openOrderDetail(txid), 400);
        }
      }
    } catch (e) {}
    handleBuyDeepLink();
    // re-run pending AI reviews that never finished (localStorage mode only)
    const u = refreshUser();
    if (u && !(window.AcctSuiteApiSync && window.AcctSuiteApiSync.usingApi())) {
      (u.ads || [])
        .filter((a) => a.status === 'pending')
        .forEach((a) => {
          setTimeout(() => A().runAiReviewOnAd(refreshUser(), a.id) && window.AcctSuiteUI.onAdsUpdated(), 800);
        });
    }
  });
})();

/**
 * Dashboard UI bindings for Acctventa (uses window.Acctventa).
 */
(function () {
  const A = () => window.Acctventa;
  let currentUser = null;
  let sellDraft = {};
  let sellStep = 1;
  let adsFilter = 'all';
  let ordersFilter = 'all';
  let purchaseFilter = 'all';
  let ordersSearch = '';
  let purchaseSearch = '';
  let activeOrderId = null;

  function money(n) {
    return A().formatMoney(n);
  }

  /** Instagram / Facebook style verified badge beside a username */
  function verifyBadgeHtml(size) {
    const s = size === 'lg' ? '1.3rem' : size === 'sm' ? '0.9rem' : '1.1rem';
    return `<span class="av-verify-badge" title="Verified" aria-label="Verified" style="width:${s};height:${s};min-width:${s}"><img src="/img/brand/verified.svg" alt="" width="40" height="40" decoding="async"></span>`;
  }

  function nameWithVerify(name, isVerified, size) {
    return `${escapeHtml(name || '')}${isVerified ? verifyBadgeHtml(size) : ''}`;
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
    if (window.AcctventaToast) window.AcctventaToast.error(msg);
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

  function applyProfileChrome(u) {
    const set = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };
    if (!u) {
      paintAvatar('headerProfileAvatar', { name: 'Guest' });
      paintAvatar('leftProfileAvatar', { name: 'Guest' });
      paintAvatar('rightProfileAvatar', { name: 'Guest' });
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
      if (notifBadge) {
        notifBadge.classList.add('hidden');
        notifBadge.classList.remove('flex');
      }
      syncGuestMenu(false);
      return;
    }
    syncGuestMenu(true);
    paintAvatar('headerProfileAvatar', u);
    paintAvatar('leftProfileAvatar', u);
    paintAvatar('rightProfileAvatar', u);
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
      if (window.AcctventaKyc && typeof window.AcctventaKyc.syncFromUser === 'function') {
        window.AcctventaKyc.syncFromUser(u);
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

    const refLink = 'acctventa.com/auth/sign-up?ref=' + encodeURIComponent(u.referralCode || 'user');
    const refEl = document.getElementById('referralLinkText');
    if (refEl) {
      refEl.textContent = refLink;
      refEl.dataset.full = 'https://' + refLink;
    }

    const notifBadge = document.getElementById('notifBadge');
    const unread = (u.notifications || []).filter((n) => !n.read).length;
    if (notifBadge) {
      if (unread > 0) {
        notifBadge.textContent = String(unread);
        notifBadge.classList.remove('hidden');
        notifBadge.classList.add('flex');
      } else {
        notifBadge.classList.add('hidden');
        notifBadge.classList.remove('flex');
      }
    }

    // account dashboard stats
    const ads = u.ads || [];
    set('dashActiveAds', String(ads.filter((a) => a.status === 'active').length));
    set('dashTotalAccounts', String(ads.length));
    set('dashAccountsSold', String((u.orders || []).filter((o) => o.role === 'seller' && o.status === 'completed').length));
    set('dashAccountsApproved', String(ads.filter((a) => a.status === 'active').length));

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
  }

  function productLogoFor(item) {
    const Cat = window.AcctventaCatalog;
    if (!Cat) return '';
    const hit = Cat.findProduct(item.platform || item.category || item.title);
    return hit ? hit.logo : Cat.logoUrl({ domain: '' });
  }

  function productGroupFor(item) {
    const Cat = window.AcctventaCatalog;
    if (!Cat) return '';
    const hit = Cat.findProduct(item.platform || item.category || '');
    return hit ? hit.groupId : '';
  }

  function sellerAvatarFaceHtml(avatarUrl, initials, imgClass) {
    const ini = escapeHtml(initials || '?');
    const url = String(avatarUrl || '').trim();
    if (url) {
      return `<img src="${escapeAttr(url)}" alt="" class="${imgClass || 'w-full h-full object-cover rounded-full'}" loading="lazy" onerror="this.style.display='none';this.parentNode && (this.parentNode.textContent='${ini}');">`;
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
    if (compact) {
      return `<div class="product-item bg-lightCard dark:bg-darkCard border border-slate-200 dark:border-slate-800 rounded-xl p-2.5 w-40 shrink-0 relative" data-category="${escapeAttr(cat)}" data-group="${escapeAttr(group)}" data-price="${Number(item.price) || 0}">
        <div class="flex items-center gap-1.5 mb-1.5">
          <img src="${escapeAttr(logo)}" alt="" class="av-prod-logo" loading="lazy" onerror="this.style.opacity=.3">
          <span class="text-[10px] text-slate-500 truncate">${escapeHtml(cat)}</span>
        </div>
        <h4 class="font-bold text-xs leading-snug mb-1 h-8 overflow-hidden">${escapeHtml(item.title)}</h4>
        ${item.sellerRating ? `<div class="mb-1 scale-90 origin-left">${starsRowHtml(item.sellerRating, item.sellerReviews)}</div>` : ''}
        <p class="text-[10px] text-slate-500 truncate flex items-center gap-0.5">By <span class="inline-flex items-center min-w-0">${nameWithVerify(item.sellerName || 'Seller', item.sellerVerified, 'sm')}</span></p>
        <p class="text-[10px] text-emerald-500 mt-0.5"><span class="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1"></span>${stock} available</p>
        <div class="flex justify-between items-center mt-2">
          <span class="text-sm font-bold text-brandPrimary">${money(item.price)}</span>
          <button onclick="openListingDetail('${item.id}')" class="bg-brandPrimary hover:bg-brandHover text-white text-[10px] font-bold px-2.5 py-1 rounded-full">Buy now</button>
        </div>
      </div>`;
    }
    return `<div class="product-item bg-lightCard dark:bg-darkCard border border-slate-200 dark:border-slate-800 rounded-xl p-2.5 flex gap-2.5 items-center" data-category="${escapeAttr(cat)}" data-group="${escapeAttr(group)}" data-price="${Number(item.price) || 0}">
      <img src="${escapeAttr(logo)}" alt="" class="w-9 h-9 rounded-lg object-cover bg-slate-800 shrink-0" loading="lazy" onerror="this.style.opacity=.3">
      <div class="min-w-0 flex-1">
        <h4 class="font-bold text-sm leading-snug truncate">${escapeHtml(item.title)}</h4>
        <p class="text-[10px] text-slate-500 truncate flex items-center gap-0.5">By <span class="inline-flex items-center min-w-0">${nameWithVerify(item.sellerName || 'Seller', item.sellerVerified, 'sm')}</span> · ${escapeHtml(cat)}</p>
        <div class="mt-0.5">${previewBtn}</div>
      </div>
      <div class="text-right shrink-0">
        <div class="text-sm font-bold text-brandPrimary mb-1">${money(item.price)}</div>
        <button onclick="openListingDetail('${item.id}')" class="bg-brandPrimary hover:bg-brandHover text-white text-[10px] font-bold px-2.5 py-1 rounded-full">Buy</button>
      </div>
    </div>`;
  }

  /** Full-width home row — AcctBazaar “Other product” pattern */
  function homeOtherListingCard(item) {
    const logo = productLogoFor(item);
    const group = productGroupFor(item);
    const cat = item.platform || item.category || '';
    const stock = Math.max(1, Number(item.stock) || 1);
    return `<div class="product-item bg-lightCard dark:bg-darkCard border border-slate-200 dark:border-slate-800 rounded-xl p-3 flex gap-3 items-stretch" data-category="${escapeAttr(cat)}" data-group="${escapeAttr(group)}" data-price="${Number(item.price) || 0}">
      <img src="${escapeAttr(logo)}" alt="" class="w-11 h-11 rounded-xl object-cover bg-slate-800 shrink-0 self-center" loading="lazy" onerror="this.style.opacity=.3">
      <div class="min-w-0 flex-1 flex flex-col justify-center gap-0.5">
        <h4 class="font-bold text-sm leading-snug line-clamp-2">${escapeHtml(item.title)}</h4>
        ${item.sellerRating ? `<div>${starsRowHtml(item.sellerRating, item.sellerReviews)}</div>` : ''}
        <p class="text-[11px] text-slate-500 truncate flex items-center gap-0.5 flex-wrap">By <span class="inline-flex items-center min-w-0">${nameWithVerify(item.sellerName || 'Seller', item.sellerVerified, 'sm')}</span></p>
        <p class="text-[11px] text-emerald-500"><span class="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1 align-middle"></span>${stock} available</p>
      </div>
      <div class="shrink-0 flex flex-col items-end justify-center gap-1.5 pl-1">
        <span class="text-base font-extrabold text-brandPrimary">${money(item.price)}</span>
        <button type="button" onclick="openListingDetail('${item.id}')" class="bg-brandPrimary hover:bg-brandHover text-white text-[11px] font-bold px-4 py-2 rounded-full whitespace-nowrap">Buy now</button>
      </div>
    </div>`;
  }

  const HOME_TRENDING_MAX = 8;

  function shuffleListings(arr) {
    const a = (arr || []).slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = a[i];
      a[i] = a[j];
      a[j] = t;
    }
    return a;
  }

  function renderMarketplace() {
    // Fresh shuffle on every render/refresh so filtered categories still feel fair.
    const list = shuffleListings(A().getMarketplaceListings());
    const home = document.getElementById('homeListings');
    const homeOther = document.getElementById('homeOtherListings');
    const homeOtherSection = document.getElementById('homeOtherSection');
    const market = document.getElementById('marketListings');
    const merchants = document.getElementById('topMerchantsRow');

    if (home) {
      if (!list.length) {
        home.innerHTML = `<div class="text-center py-8 text-sm text-slate-500 w-full">No live listings yet. Be the first to <button class="text-brandPrimary font-semibold" onclick="openSellProductWizard()">Sell Product</button>.</div>`;
      } else {
        home.innerHTML = list.slice(0, HOME_TRENDING_MAX).map((i) => listingCard(i, true)).join('');
      }
    }
    if (homeOther) {
      if (!list.length) {
        homeOther.innerHTML = '';
      } else {
        homeOther.innerHTML = list.map((i) => homeOtherListingCard(i)).join('');
      }
    }
    if (homeOtherSection) {
      homeOtherSection.classList.toggle('hidden', !list.length);
    }
    if (market) {
      if (!list.length) {
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
          map[i.sellerEmail] = {
            name: i.sellerName,
            email: i.sellerEmail,
            merchantSlug: i.sellerMerchantSlug || '',
            initials: i.sellerInitials,
            avatarUrl: i.sellerAvatar || '',
            sellerId: i.sellerId || '',
            sales: 0,
            hasStory: false,
          };
        }
        map[i.sellerEmail].sales += 1;
        if (!map[i.sellerEmail].merchantSlug && i.sellerMerchantSlug) map[i.sellerEmail].merchantSlug = i.sellerMerchantSlug;
        if (!map[i.sellerEmail].avatarUrl && i.sellerAvatar) map[i.sellerEmail].avatarUrl = i.sellerAvatar;
        if (!map[i.sellerEmail].sellerId && i.sellerId) map[i.sellerEmail].sellerId = i.sellerId;
      });
      const storyFeed = window.__acctventaStoryFeed || [];
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
            return `<button type="button" onclick="${action}" class="av-merchant-chip flex flex-col items-center shrink-0 text-center w-16">
          <span class="${ring}"><span class="av-merchant-face">${face}</span></span>
          <span class="text-xs font-bold truncate w-full mt-1">${escapeHtml(m.name)}</span>
          <span class="text-[10px] text-slate-500">${m.hasStory ? 'Story' : m.sales + ' live'}</span>
        </button>`;
          })
          .join('');
      }
    }
  }

  function renderAds() {
    const u = refreshUser();
    if (!u) return;
    const box = document.getElementById('adsListContainer');
    if (!box) return;
    let ads = u.ads || [];
    if (adsFilter !== 'all') {
      if (adsFilter === 'active') {
        // Live on market only
        ads = ads.filter((a) => a.status === 'active' && Number(a.stock) > 0);
      } else if (adsFilter === 'removed') {
        ads = ads.filter(
          (a) => a.status === 'removed' || (a.status === 'active' && !(Number(a.stock) > 0))
        );
      } else {
        ads = ads.filter((a) => a.status === adsFilter);
      }
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
                : 'No ads in this tab';
      const emptySub =
        adsFilter === 'pending'
          ? 'New uploads appear here until Owner approves them.'
          : adsFilter === 'active'
            ? 'Sold-out ads move to Removed — list a new product or ask Owner to restock.'
            : adsFilter === 'denied'
              ? 'Denied listings will show here with the reason.'
              : adsFilter === 'removed'
                ? 'Removed or sold-out listings show here.'
                : 'Tap + to list a product.';
      box.innerHTML = `<div class="text-center py-12 space-y-2">
        <i class="fa-solid fa-bullhorn text-4xl text-slate-300 dark:text-slate-700"></i>
        <p class="font-bold text-sm text-slate-600 dark:text-slate-400">${emptyTitle}</p>
        <p class="text-xs text-slate-400">${emptySub}</p>
      </div>`;
      return;
    }
    box.innerHTML = ads
      .map((a) => {
        const stock = Number(a.stock);
        const soldOut = a.status === 'active' && !(stock > 0);
        const statusColor =
          a.status === 'active' && !soldOut
            ? 'text-emerald-500'
            : a.status === 'pending'
              ? 'text-amber-500'
              : a.status === 'denied'
                ? 'text-red-500'
                : 'text-slate-400';
        let statusLabel =
          a.status === 'pending'
            ? 'Under Review'
            : soldOut
              ? 'Sold out'
              : (a.status || '').charAt(0).toUpperCase() + (a.status || '').slice(1);
        if (a.status === 'active' && !soldOut) statusLabel = 'Live · stock ' + (stock || 1);
        return `<div class="bg-lightCard dark:bg-darkCard border border-slate-200 dark:border-slate-800 p-4 rounded-xl shadow-sm space-y-2">
        <div class="flex justify-between gap-3">
          <div class="min-w-0">
            <h4 class="font-bold text-sm">${escapeHtml(a.title)}</h4>
            <p class="text-xs text-slate-500 mt-0.5">${escapeHtml(a.category || '')} · ${a.releaseType === 'manual' ? 'Manual release' : 'Auto confirm'}</p>
          </div>
          <div class="text-right shrink-0">
            <p class="font-extrabold text-brandPrimary text-sm">${money(a.price)}</p>
            <p class="text-xs font-semibold ${statusColor} mt-1">${statusLabel}</p>
          </div>
        </div>
        ${a.status === 'denied' && a.denyReason ? `<div class="text-xs bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 text-red-600 dark:text-red-300 rounded-lg p-2"><strong>Reason for denied:</strong> ${escapeHtml(a.denyReason)}</div>` : ''}
        ${a.status === 'pending' ? `<p class="text-[11px] text-amber-600">Pending Owner approval before Market.</p>` : ''}
        ${soldOut ? `<p class="text-[11px] text-amber-600">This unit sold. It will not show on Market until restocked with new login details.</p>` : ''}
      </div>`;
      })
      .join('');
  }

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
        window.AcctventaCatalog &&
        (window.AcctventaCatalog.findProduct(cat) || window.AcctventaCatalog.findProduct(o.title));
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
      .map(
        (n) => `<div class="relative border-l border-slate-200 dark:border-slate-700 pl-2.5 ml-0.5 py-2">
      <div class="size-2 rounded-full bg-brandPrimary absolute top-3 -left-1"></div>
      <div class="flex justify-between"><p class="font-medium text-sm">${escapeHtml(n.title)}</p><span class="text-[10px] text-slate-400">${relativeTime(n.createdAt)}</span></div>
      <p class="text-xs text-slate-500 mt-0.5">${escapeHtml(n.body)}</p>
    </div>`
      )
      .join('');
    notes.forEach((n) => (n.read = true));
    A().persistUser(u);
    applyProfileChrome(u);
  }

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
          <p class="text-[10px] text-slate-400 mt-1">Wallet total ${walletBal}. Only sales &amp; referral earnings are withdrawable — deposits are for buying. Payouts are sent by admin after review.</p>
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
      if (window.AcctventaApi && typeof window.AcctventaApi.banksList === 'function') {
        const res = await window.AcctventaApi.banksList({ country: 'NG' });
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
        if (window.AcctventaApi && (await window.AcctventaApi.isAvailable())) {
          if (depositChannel === 'crypto') {
            const addr = cryptoAddressFor(depositCurrency, depositNetwork);
            if (!addr) {
              alert('No wallet is available at the moment.');
              return;
            }
            const cryptoOk = window.AcctventaConfirm
              ? await window.AcctventaConfirm({
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
          const apiRes = await window.AcctventaApi.deposit(payload);
          if (apiRes.paymentLink) {
            window.location.href = apiRes.paymentLink;
            return;
          }
          if (window.AcctventaApiSync) await window.AcctventaApiSync.hydrateFromApi();
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
      if (window.AcctventaApiSync) {
        if (typeof window.AcctventaApiSync.patchAcctventaForApi === 'function') {
          window.AcctventaApiSync.patchAcctventaForApi();
        }
        const Api = window.AcctventaApi;
        if (Api && window.AcctventaApiSync.ensureApiSession) {
          await window.AcctventaApiSync.ensureApiSession(Api);
        }
        if (window.AcctventaApiSync.hydrateFromApi) {
          await window.AcctventaApiSync.hydrateFromApi();
        }
      }
    } catch (_) {}
    const u = refreshUser() || u0;
    if (!A().canUploadToday(u)) {
      alert('Daily upload limit reached (' + A().getPlan(u).dailyUploads + '). Upgrade your plan to upload more today.');
      switchTab('plans');
      return;
    }
    sellDraft = { releaseType: 'auto' };
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
    ['wizardTitle', 'wizardDesc', 'wizardPrice', 'wizardUser', 'wizardPass', 'wizardPreview', 'wizardEmail', 'wizardEmailPass', 'wizard2fa', 'wizardExtra'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
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
      const uploadOk = window.AcctventaConfirm
        ? await window.AcctventaConfirm({
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
      const username = document.getElementById('wizardUser').value.trim();
      const password = document.getElementById('wizardPass').value.trim();
      const previewLink = document.getElementById('wizardPreview').value.trim();
      const attachedEmail = document.getElementById('wizardEmail').value.trim();
      const attachedEmailPassword = document.getElementById('wizardEmailPass').value.trim();
      const twoFA = document.getElementById('wizard2fa').value.trim();
      const extraInfo = document.getElementById('wizardExtra').value.trim();
      if (!username || !password) {
        alert('Username and account password are required.');
        return;
      }
      sellDraft = { ...sellDraft, username, password, previewLink, attachedEmail, attachedEmailPassword, twoFA, extraInfo };
      showSellStep(3);
      return;
    }
    // submit — must hit MySQL when logged into API (never localStorage-only)
    const u = refreshUser();
    if (window.AcctventaApiSync) {
      if (typeof window.AcctventaApiSync.patchAcctventaForApi === 'function') {
        window.AcctventaApiSync.patchAcctventaForApi();
      }
      if (window.AcctventaApiSync.ensureApiSession && window.AcctventaApi) {
        try {
          await window.AcctventaApiSync.ensureApiSession(window.AcctventaApi);
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
      if (window.AcctventaApiSync && window.AcctventaApiSync.refreshAdsFromApi) {
        await window.AcctventaApiSync.refreshAdsFromApi();
      } else if (window.AcctventaApiSync && window.AcctventaApiSync.hydrateFromApi) {
        await window.AcctventaApiSync.hydrateFromApi();
      }
    } catch (_) {}
    const status = String(res.status || res.ad?.status || 'pending').toLowerCase();
    document.getElementById('sellWizardOverlay').classList.remove('flex');
    document.getElementById('sellWizardOverlay').classList.add('hidden');
    ['wizardTitle', 'wizardDesc', 'wizardPrice', 'wizardUser', 'wizardPass', 'wizardPreview', 'wizardEmail', 'wizardEmailPass', 'wizard2fa', 'wizardExtra'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    applyProfileChrome(refreshUser());
    switchTab('ads');
    const filter =
      status === 'denied' ? 'denied' : status === 'active' ? 'active' : 'pending';
    setAdsFilter(filter);
    renderAds();
    const msg =
      status === 'denied'
        ? res.message || 'Listing denied by AI review. Open My Ads → Denied.'
        : status === 'active'
          ? 'Listing is live. Open My Ads → Active.'
          : res.message ||
            'Listing submitted. Open My Ads → Pending — Owner must approve before it appears on Market/Home.';
    if (window.AcctventaToast) {
      window.AcctventaToast[status === 'denied' ? 'error' : 'success'](msg);
    } else {
      alert(msg);
    }
  };

  function fillSellReview() {
    const box = document.getElementById('sellReviewSummary');
    if (!box) return;
    box.innerHTML = `
      <div class="space-y-2 text-sm">
        <div class="flex justify-between"><span class="text-slate-500">Title</span><span class="font-medium text-right ml-4">${escapeHtml(sellDraft.title || '')}</span></div>
        <div class="flex justify-between"><span class="text-slate-500">Category</span><span class="font-medium">${escapeHtml(sellDraft.category || '')}</span></div>
        <div class="flex justify-between"><span class="text-slate-500">Price</span><span class="font-bold text-brandPrimary">${money(sellDraft.price)}</span></div>
        <div class="flex justify-between"><span class="text-slate-500">Release</span><span class="font-medium">${sellDraft.releaseType === 'manual' ? 'Manual' : 'Auto confirm'}</span></div>
        <div class="flex justify-between"><span class="text-slate-500">Username</span><span class="font-mono text-xs">${escapeHtml(sellDraft.username || '')}</span></div>
        <div class="flex justify-between gap-2"><span class="text-slate-500 shrink-0">Preview link</span><span class="font-mono text-[10px] text-right break-all">${escapeHtml(sellDraft.previewLink || '—')}</span></div>
        <div class="flex justify-between"><span class="text-slate-500">2FA</span><span class="font-medium">${escapeHtml(sellDraft.twoFA || '—')}</span></div>
      </div>
      <p class="text-[11px] text-amber-600 mt-3">After submit, your listing is checked and stays <strong>Pending</strong> until Owner approves it for Market.</p>`;
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
      return s + '+ Sales';
    }
    return v + ' Sales';
  }

  function starsRowHtml(rating, reviewCount) {
    const r = Math.max(0, Math.min(5, Number(rating) || 0));
    const full = Math.floor(r);
    const half = r - full >= 0.35 ? 1 : 0;
    let icons = '';
    for (let i = 0; i < 5; i++) {
      if (i < full) icons += '<i class="fa-solid fa-star"></i>';
      else if (i === full && half) icons += '<i class="fa-solid fa-star-half-stroke"></i>';
      else icons += '<i class="fa-regular fa-star text-slate-300 dark:text-slate-600"></i>';
    }
    const count = Number(reviewCount) || 0;
    return `<span class="av-listing-stars">${icons}${count ? `<em>(${count})</em>` : ''}</span>`;
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
    const storeKey = escapeAttr(item.sellerMerchantSlug || item.sellerId || item.sellerEmail || '');

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
          <img src="${escapeAttr(logo)}" alt="" class="av-listing-detail__logo" loading="lazy" onerror="this.style.opacity=.35">
          <div class="min-w-0 flex-1">
            <div class="av-listing-detail__title-row">
              <h3 class="av-listing-detail__title">${escapeHtml(item.title)}</h3>
              <span class="av-listing-detail__price">${money(item.price)}</span>
            </div>
            <div class="av-listing-detail__meta">
              ${item.sellerRating ? starsRowHtml(item.sellerRating, item.sellerReviews) : ''}
              ${item.sellerVerified ? verifyBadgeHtml('sm') : ''}
              <span>● ${stock} available, added ${escapeHtml(added)}</span>
            </div>
          </div>
        </div>
        <div class="av-listing-badge${isAuto ? '' : ' av-listing-badge--manual'}">${isAuto ? '<i class="fa-solid fa-bolt"></i> Instant Delivery' : '<i class="fa-solid fa-clock"></i> Manual delivery'}</div>
        <div class="av-listing-seller">
          <div class="av-listing-seller__avatar">${sellerAvatarFaceHtml(item.sellerAvatar, item.sellerInitials || 'S', 'av-listing-seller__avatar-img')}</div>
          <div class="av-listing-seller__body">
            <p class="av-listing-seller__name inline-flex items-center gap-0.5 flex-wrap">${nameWithVerify(item.sellerName || 'Seller', item.sellerVerified, 'sm')}</p>
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
          <p class="av-listing-protect"><i class="fa-solid fa-shield-halved"></i> Your payment is protected by Acctventa Buyer Protection.</p>
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

    if (window.AcctventaApi && window.AcctventaApiSync && window.AcctventaApiSync.usingApi && window.AcctventaApiSync.usingApi()) {
      try {
        const res = await window.AcctventaApi.marketGet({ id: Number(id) || id });
        if (res && res.ok && res.listing) {
          const mapped = window.AcctventaApiSync.mapListing
            ? window.AcctventaApiSync.mapListing(res.listing)
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
      else if (window.AcctventaApiSync && window.AcctventaApiSync.refreshOrdersFromApi) {
        await window.AcctventaApiSync.refreshOrdersFromApi();
      } else if (window.AcctventaApiSync) await window.AcctventaApiSync.hydrateFromApi();
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
    if (window.AcctventaApi && window.AcctventaApiSync && window.AcctventaApiSync.usingApi()) {
      try {
        const res = await window.AcctventaApi.getOrder(orderId);
        if (res && res.order) {
          const mapped = window.AcctventaApiSync.mapOrder
            ? window.AcctventaApiSync.mapOrder(res.order)
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
      if (!window.AcctventaApi) throw new Error('API unavailable');
      await window.AcctventaApi.createReview({ orderId: Number(orderId), rating, comment });
      if (window.AcctventaApiSync) await window.AcctventaApiSync.hydrateFromApi();
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
    window.location.href = '/seller/' + encodeURIComponent(key);
  };

  window.openSellerProfile = window.goToSellerStore;

  function findStoryBundle(sellerEmail) {
    const email = String(sellerEmail || '').toLowerCase();
    const feed = window.__acctventaStoryFeed || [];
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
    if ((!bundle || !(bundle.stories || []).length) && window.AcctventaApi) {
      try {
        const res = await window.AcctventaApi.storiesBySeller({ sellerEmail });
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
        const res = await window.AcctventaApi.storiesMine();
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
              await window.AcctventaApi.storiesDelete({ id: btn.getAttribute('data-del-story') });
              refreshMine();
              if (window.AcctventaApi.storiesFeed) {
                const feed = await window.AcctventaApi.storiesFeed().catch(() => ({ merchants: [] }));
                window.__acctventaStoryFeed = feed.merchants || [];
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
          await window.AcctventaApi.storiesCreate({ image: reader.result, caption });
          fileInput.value = '';
          if (document.getElementById('storyCaption')) document.getElementById('storyCaption').value = '';
          const feed = await window.AcctventaApi.storiesFeed().catch(() => ({ merchants: [] }));
          window.__acctventaStoryFeed = feed.merchants || [];
          renderMarketplace();
          await refreshMine();
          if (window.AcctventaToast) window.AcctventaToast.success('Story posted');
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
      if (window.AcctventaToast) window.AcctventaToast.show('Merchant link copied', { type: 'success' });
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
      const stored = sessionStorage.getItem('acctventa_open_listing');
      if (stored) {
        sessionStorage.removeItem('acctventa_open_listing');
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
    const refundOk = window.AcctventaConfirm
      ? await window.AcctventaConfirm({
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
    if (window.AcctventaApiSync && window.AcctventaApiSync.usingApi()) {
      await window.AcctventaApiSync.loadMessages(orderId);
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
    document.getElementById('chatSubtitle').textContent = 'Acctventa Support';
    const reportBtn = document.getElementById('chatReportBtn');
    if (reportBtn) reportBtn.classList.add('hidden');
    document.getElementById('chatOverlay').classList.remove('hidden');
    document.getElementById('chatOverlay').classList.add('flex');
    if (window.CommerceUI) window.CommerceUI.showChatRulesBanner(false);
    try {
      if (window.AcctventaApi && (await window.AcctventaApi.isAvailable())) {
        const res = await window.AcctventaApi.supportOpen();
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
      await window.AcctventaApi.reportSeller({ orderId: Number(activeOrderId), reason: String(reason).trim() });
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
      if (chatMode !== 'support' || !window.AcctventaApi) return;
      try {
        const res = await window.AcctventaApi.supportMessages(supportThreadId);
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
    if (chatMode !== 'support' || !window.AcctventaApi) return;
    clearTimeout(typingTimer);
    window.AcctventaApi.supportTyping({ typing: true }).catch(() => {});
    typingTimer = setTimeout(() => {
      window.AcctventaApi.supportTyping({ typing: false }).catch(() => {});
    }, 1500);
  };

  window.closeOrderChat = function () {
    stopChatPoll();
    if (chatMode === 'support' && window.AcctventaApi) {
      window.AcctventaApi.supportTyping({ typing: false }).catch(() => {});
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
        const res = await window.AcctventaApi.supportSend(payload);
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
    if (window.AcctventaApiSync && window.AcctventaApiSync.usingApi()) {
      await window.AcctventaApiSync.loadMessages(activeOrderId);
      if (res && res.fundsReleased) {
        await window.AcctventaApiSync.hydrateFromApi();
        applyProfileChrome(refreshUser());
        alert('AI confirmed login details were sent. Escrow funds released to the seller.');
      }
    }
    renderChat();
  };

  // Presence heartbeat while logged in
  setInterval(() => {
    if (window.AcctventaApi && window.AcctventaApi.getToken && window.AcctventaApi.getToken()) {
      window.AcctventaApi.presencePing().catch(() => {});
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
        const Api = window.AcctventaApi;
        const Sync = window.AcctventaApiSync;
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
        if (window.AcctventaApiSync) await window.AcctventaApiSync.hydrateFromApi();
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

  function compressAvatarFile(file) {
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
          const max = 512;
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

  window.AcctventaUI = {
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
        if (window.AcctventaApiSync && window.AcctventaApiSync.usingApi() && window.AcctventaApi) {
          const res = await window.AcctventaApi.updateProfile({
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
          if (window.AcctventaApiSync.hydrateFromApi) {
            await window.AcctventaApiSync.hydrateFromApi();
          }
        } else {
          u.avatarUrl = dataUrl;
          A().persistUser(u);
        }
        applyProfileChrome(A().getCurrentUser() || u);
        if (window.AcctventaToast) window.AcctventaToast.success('Profile photo updated');
        else alert('Profile photo updated');
      } catch (e) {
        alert((e && e.message) || 'Could not update photo');
      }
    }
  };

  window.addEventListener('acctventa:wallet-updated', () => {
    try {
      applyProfileChrome(refreshUser());
    } catch (e) {}
  });

  document.addEventListener('DOMContentLoaded', async () => {
    if (window.AcctventaApiSync) {
      try {
        const Api = window.AcctventaApi;
        let online = false;
        if (Api) {
          try {
            online = await Api.isAvailable();
          } catch (e) {}
        }
        if (online && Api) {
          if (window.AcctventaApiSync.ensureApiSession) {
            await window.AcctventaApiSync.ensureApiSession(Api);
          }
          if (typeof window.AcctventaApiSync.patchAcctventaForApi === 'function') {
            window.AcctventaApiSync.patchAcctventaForApi();
          }
        }
      } catch (e) {}
      const hydrated = await window.AcctventaApiSync.hydrateFromApi();
      if (!hydrated && window.AcctventaApiSync.hydratePublicMarket) {
        await window.AcctventaApiSync.hydratePublicMarket();
      }
      // Always re-pull orders/ads after hydrate so lists are never stuck empty
      try {
        if (hydrated && window.AcctventaApiSync.refreshOrdersFromApi) {
          await window.AcctventaApiSync.refreshOrdersFromApi();
        }
        if (hydrated && window.AcctventaApiSync.refreshAdsFromApi) {
          await window.AcctventaApiSync.refreshAdsFromApi();
        }
      } catch (e) {}
    }
    window.AcctventaUI.refreshAll();
    try {
      if (window.AcctventaKyc && refreshUser()) await window.AcctventaKyc.refreshStatus();
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
    if (u && !(window.AcctventaApiSync && window.AcctventaApiSync.usingApi())) {
      (u.ads || [])
        .filter((a) => a.status === 'pending')
        .forEach((a) => {
          setTimeout(() => A().runAiReviewOnAd(refreshUser(), a.id) && window.AcctventaUI.onAdsUpdated(), 800);
        });
    }
  });
})();

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
  let activeOrderId = null;

  function money(n) {
    return A().formatMoney(n);
  }

  function refreshUser() {
    currentUser = A().getCurrentUser();
    return currentUser;
  }

  function requireAuth() {
    const u = refreshUser();
    if (!u) {
      window.location.href = '/index.html?page=login';
      return null;
    }
    // ensure plan defaults
    if (!u.plan) {
      u.plan = 'free';
      A().persistUser(u);
    }
    return u;
  }

  function applyProfileChrome(u) {
    const initials = A().getInitials(u.name);
    const set = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };
    set('headerProfileAvatar', initials);
    set('leftProfileAvatar', initials);
    set('leftProfileName', (u.name || '').toUpperCase());
    set('leftProfileEmail', u.email);
    set('rightProfileAvatar', initials);
    set('rightProfileName', u.name);
    set('rightProfileEmail', u.email);
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
    set('walletEscrowDisplay', money(u.escrowBalance));
    set('walletDepositsDisplay', money(u.totalDeposits));
    set('walletWithdrawalsDisplay', money(u.totalWithdrawals));
    set('currentPlanLabel', plan.name);
    set('uploadLimitBannerText', `You are on ${plan.name}. Uploads left today: ${A().getRemainingUploads(u)} of ${plan.dailyUploads}.`);

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
  }

  function listingCard(item, compact) {
    const previewBtn = item.previewLink
      ? `<a href="${escapeAttr(item.previewLink)}" target="_blank" rel="noopener" onclick="event.stopPropagation()" class="text-[10px] text-brandPrimary underline">Preview link</a>`
      : `<span class="text-[10px] text-slate-400">No preview</span>`;
    if (compact) {
      return `<div class="bg-lightCard dark:bg-darkCard border border-slate-200 dark:border-slate-800 rounded-xl p-3 w-44 shrink-0 relative shadow-sm">
        <h4 class="font-bold text-sm leading-tight mb-1 h-10 overflow-hidden">${escapeHtml(item.title)}</h4>
        <p class="text-[10px] text-slate-500 mb-1">By ${escapeHtml(item.sellerName || 'Seller')}</p>
        ${previewBtn}
        <div class="flex justify-between items-center mt-3">
          <span class="text-sm font-bold text-brandPrimary">${money(item.price)}</span>
          <button onclick="openListingDetail('${item.id}')" class="bg-brandPrimary hover:bg-brandHover text-white text-xs font-bold px-3 py-1.5 rounded-full">View</button>
        </div>
      </div>`;
    }
    return `<div class="bg-lightCard dark:bg-darkCard border border-slate-200 dark:border-slate-800 rounded-xl p-3 flex justify-between items-center product-item shadow-sm" data-category="${escapeAttr(item.category || '')}" data-price="${Number(item.price) || 0}">
      <div class="min-w-0 pr-3">
        <h4 class="font-bold text-sm mb-0.5 truncate">${escapeHtml(item.title)}</h4>
        <p class="text-[10px] text-slate-500">By ${escapeHtml(item.sellerName || 'Seller')} · ${escapeHtml(item.category || '')}</p>
        <div class="mt-1">${previewBtn}</div>
      </div>
      <div class="text-right shrink-0">
        <div class="text-sm font-bold text-brandPrimary mb-1">${money(item.price)}</div>
        <button onclick="openListingDetail('${item.id}')" class="bg-brandPrimary hover:bg-brandHover text-white text-[10px] font-bold px-3 py-1 rounded-full">Buy now</button>
      </div>
    </div>`;
  }

  function renderMarketplace() {
    const list = A().getMarketplaceListings();
    const home = document.getElementById('homeListings');
    const market = document.getElementById('marketListings');
    const merchants = document.getElementById('topMerchantsRow');

    if (home) {
      if (!list.length) {
        home.innerHTML = `<div class="text-center py-8 text-sm text-slate-500 w-full">No live listings yet. Be the first to <button class="text-brandPrimary font-semibold" onclick="openSellProductWizard()">Sell Product</button>.</div>`;
      } else {
        home.innerHTML = list.slice(0, 12).map((i) => listingCard(i, true)).join('');
      }
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
        if (!map[i.sellerEmail]) map[i.sellerEmail] = { name: i.sellerName, email: i.sellerEmail, initials: i.sellerInitials, sales: 0 };
        map[i.sellerEmail].sales += 1;
      });
      const arr = Object.values(map).slice(0, 10);
      if (!arr.length) {
        merchants.innerHTML = `<p class="text-xs text-slate-400 py-2">Merchants will appear after approved sales listings go live.</p>`;
      } else {
        merchants.innerHTML = arr
          .map(
            (m) => `<div class="flex flex-col items-center shrink-0 text-center w-16">
          <div class="w-14 h-14 rounded-full border-2 border-brandPrimary mb-1 bg-brandPrimary/20 text-brandPrimary flex items-center justify-center font-bold">${escapeHtml(m.initials)}</div>
          <span class="text-xs font-bold truncate w-full">${escapeHtml(m.name)}</span>
          <span class="text-[10px] text-slate-500">${m.sales} live</span>
        </div>`
          )
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
    if (adsFilter !== 'all') ads = ads.filter((a) => a.status === adsFilter);
    if (!ads.length) {
      box.innerHTML = `<div class="text-center py-12 space-y-2">
        <i class="fa-solid fa-bullhorn text-4xl text-slate-300 dark:text-slate-700"></i>
        <p class="font-bold text-sm text-slate-600 dark:text-slate-400">No ads in this tab</p>
        <p class="text-xs text-slate-400">Tap + to list a product. New uploads start Under Review.</p>
      </div>`;
      return;
    }
    box.innerHTML = ads
      .map((a) => {
        const statusColor =
          a.status === 'active'
            ? 'text-emerald-500'
            : a.status === 'pending'
              ? 'text-amber-500'
              : a.status === 'denied'
                ? 'text-red-500'
                : 'text-slate-400';
        const statusLabel = a.status === 'pending' ? 'Under Review' : (a.status || '').charAt(0).toUpperCase() + (a.status || '').slice(1);
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
        ${a.status === 'pending' ? `<p class="text-[11px] text-amber-600">AI is reviewing credentials & preview link…</p>` : ''}
      </div>`;
      })
      .join('');
  }

  function renderOrders() {
    const u = refreshUser();
    if (!u) return;
    const box = document.getElementById('ordersListContainer');
    if (!box) return;
    let orders = u.orders || [];
    if (ordersFilter !== 'all') orders = orders.filter((o) => o.status === ordersFilter);
    if (!orders.length) {
      box.innerHTML = `<div class="text-center py-12 space-y-2">
        <i class="fa-regular fa-clipboard text-4xl text-slate-300 dark:text-slate-700"></i>
        <p class="font-bold text-sm">No orders</p>
        <p class="text-xs text-slate-400">Buy and sell orders will be shown here.</p>
        <button onclick="switchTab('market')" class="mt-2 text-xs border border-brandPrimary text-brandPrimary px-4 py-2 rounded-lg">Explore marketplace</button>
      </div>`;
      return;
    }
    box.innerHTML = orders
      .map((o) => {
        const role = o.role === 'seller' ? 'Sold' : 'Bought';
        return `<button type="button" onclick="openOrderDetail('${o.id}')" class="w-full text-left bg-lightCard dark:bg-darkCard border border-slate-200 dark:border-slate-800 p-4 rounded-xl flex justify-between items-center shadow-sm hover:border-brandPrimary transition">
        <div class="min-w-0">
          <h4 class="font-bold text-sm truncate">${escapeHtml(o.title)}</h4>
          <p class="text-[10px] text-slate-500 mt-0.5">${role} · ${escapeHtml(o.status)} · ${escapeHtml(o.id)}</p>
        </div>
        <span class="font-bold text-sm text-brandPrimary">${money(o.price)}</span>
      </button>`;
      })
      .join('');
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
    box.innerHTML = Object.values(plans)
      .map((p) => {
        const active = u.plan === p.id;
        return `<div class="bg-lightCard dark:bg-darkCard border ${active ? 'border-brandPrimary' : 'border-slate-200 dark:border-slate-800'} rounded-2xl p-4 shadow-sm space-y-3">
        <div class="flex justify-between items-center">
          <h3 class="font-bold">${escapeHtml(p.name)}</h3>
          ${active ? '<span class="text-[10px] bg-brandPrimary/15 text-brandPrimary px-2 py-0.5 rounded-full font-bold">CURRENT</span>' : ''}
        </div>
        <p class="text-2xl font-extrabold text-brandPrimary">${p.price ? money(p.price) + '<span class="text-xs text-slate-400 font-medium">/mo</span>' : 'Free'}</p>
        <ul class="text-xs text-slate-500 space-y-1">
          <li><i class="fa-solid fa-check text-emerald-500 mr-1"></i>${p.dailyUploads} uploads / day</li>
          <li><i class="fa-solid fa-check text-emerald-500 mr-1"></i>${escapeHtml(p.approval)}</li>
          <li><i class="fa-solid fa-check text-emerald-500 mr-1"></i>AI link & credential review</li>
        </ul>
        ${
          active
            ? '<button disabled class="w-full py-2.5 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-400">Active plan</button>'
            : `<button onclick="selectPlan('${p.id}')" class="w-full py-2.5 rounded-xl text-xs font-bold bg-brandPrimary text-white hover:bg-brandHover">${p.price ? 'Upgrade (pay later via gateway)' : 'Use Free plan'}</button>`
        }
      </div>`;
      })
      .join('');
  }

  function renderTxHistory() {
    const u = refreshUser();
    const box = document.getElementById('txHistoryList');
    if (!box || !u) return;
    const txs = u.transactions || [];
    if (!txs.length) {
      box.innerHTML = `<p class="text-xs text-slate-400 text-center py-6">No transactions yet.</p>`;
      return;
    }
    box.innerHTML = txs
      .map(
        (t) => `<div class="flex justify-between items-start border-b border-slate-100 dark:border-slate-800 py-3 text-sm">
      <div>
        <p class="font-medium capitalize">${escapeHtml(t.type)}</p>
        <p class="text-[10px] text-slate-400">${escapeHtml(t.status)} · ${relativeTime(t.createdAt)}</p>
        ${t.fee ? `<p class="text-[10px] text-slate-400">Fee: ${money(t.fee)}${t.payout != null ? ' · Payout: ' + money(t.payout) : ''}</p>` : ''}
      </div>
      <span class="font-bold ${t.type === 'deposit' ? 'text-emerald-500' : 'text-slate-800 dark:text-white'}">${t.type === 'deposit' ? '+' : '-'}${money(t.amount)}</span>
    </div>`
      )
      .join('');
  }

  // -------- Sell wizard --------
  window.openSellProductWizard = function () {
    const u = requireAuth();
    if (!u) return;
    if (!A().canUploadToday(u)) {
      alert('Daily upload limit reached (' + A().getPlan(u).dailyUploads + '). Upgrade your plan to upload more today.');
      switchTab('plans');
      return;
    }
    sellDraft = { releaseType: 'auto' };
    sellStep = 1;
    showSellStep(1);
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
    if (btn) btn.textContent = step === 3 ? 'Submit for AI Review' : 'Continue';
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

  window.handleSellWizardNext = async function () {
    if (sellStep === 1) {
      const category = document.getElementById('wizardCat').value;
      const title = document.getElementById('wizardTitle').value.trim();
      const description = document.getElementById('wizardDesc').value.trim();
      const price = document.getElementById('wizardPrice').value;
      if (!category || !title || !price) {
        alert('Please fill category, name, and price.');
        return;
      }
      sellDraft = { ...sellDraft, category, platform: category, title, description, price: Number(price) };
      if (!confirm('Warning: Uploading bad, fake, or non-working accounts can get you banned. After 3 verified bad uploads, your account may be permanently banned. Continue?')) return;
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
    // submit
    const u = refreshUser();
    const res = await Promise.resolve(A().createAd(u, sellDraft));
    if (!res.ok) {
      alert(res.error);
      return;
    }
    alert('Listing submitted. Status: Under Review — AI will approve or deny based on credentials & preview link.');
    document.getElementById('sellWizardOverlay').classList.remove('flex');
    document.getElementById('sellWizardOverlay').classList.add('hidden');
    // clear fields
    ['wizardTitle', 'wizardDesc', 'wizardPrice', 'wizardUser', 'wizardPass', 'wizardPreview', 'wizardEmail', 'wizardEmailPass', 'wizard2fa', 'wizardExtra'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    applyProfileChrome(refreshUser());
    renderAds();
    switchTab('ads');
    setAdsFilter('pending');
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
      <p class="text-[11px] text-amber-600 mt-3">After submit, listing stays <strong>Under Review</strong> until AI checks that the preview link matches the account type and required fields are valid.</p>`;
  }

  // -------- Listing detail / buy --------
  window.openListingDetail = function (id) {
    const item = A().findListingById(id);
    if (!item) {
      alert('Listing not available.');
      return;
    }
    const preview = item.previewLink
      ? `<a href="${escapeAttr(item.previewLink)}" target="_blank" rel="noopener" class="inline-flex items-center gap-2 text-sm text-brandPrimary font-semibold underline"><i class="fa-solid fa-arrow-up-right-from-square"></i> Open preview link before buying</a>
         <p class="text-[11px] text-slate-400 mt-1 break-all">${escapeHtml(item.previewLink)}</p>`
      : `<p class="text-xs text-slate-500">No public preview link for this listing.</p>`;
    document.getElementById('modalBody').innerHTML = `
      <h3 class="font-bold text-xl mb-1">${escapeHtml(item.title)}</h3>
      <p class="text-xs text-slate-500 mb-3">By ${escapeHtml(item.sellerName)} · ${escapeHtml(item.category || '')}</p>
      <p class="text-sm text-slate-600 dark:text-slate-300 mb-4">${escapeHtml(item.description || 'No description.')}</p>
      <div class="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 mb-4">
        <p class="text-[10px] font-bold uppercase text-slate-400 mb-1">Review product link</p>
        ${preview}
      </div>
      <div class="flex justify-between items-center mb-4"><span class="text-slate-500 text-sm">Price</span><span class="text-2xl font-extrabold text-brandPrimary">${money(item.price)}</span></div>
      <p class="text-[11px] text-emerald-600 mb-3"><i class="fa-solid fa-shield-halved mr-1"></i>Escrow protected — funds release after delivery.</p>
      <button onclick="buyListing('${item.id}')" class="w-full bg-brandPrimary hover:bg-brandHover text-white py-3.5 rounded-xl font-bold text-sm shadow-md">Buy now · ${money(item.price)}</button>`;
    document.getElementById('appModal').classList.remove('hidden');
  };

  window.buyListing = async function (id) {
    const u = refreshUser();
    const res = await Promise.resolve(A().purchaseListing(u, id));
    if (!res.ok) {
      alert(res.error);
      if (String(res.error).toLowerCase().includes('balance')) switchTab('wallet');
      return;
    }
    closeModal();
    applyProfileChrome(refreshUser());
    renderOrders();
    renderMarketplace();
    alert('Purchase successful. Open Orders to view credentials and message the seller.');
    switchTab('orders');
  };

  // -------- Orders detail / chat / refund --------
  window.openOrderDetail = function (orderId) {
    const u = refreshUser();
    const order = (u.orders || []).find((o) => o.id === orderId);
    if (!order) return;
    activeOrderId = orderId;
    const cred = order.credentials || {};
    const isSeller = order.role === 'seller';
    const other = isSeller ? order.buyerName : order.sellerName;
    document.getElementById('modalBody').innerHTML = `
      <h3 class="font-bold text-lg mb-1">Order details</h3>
      <p class="text-xs text-slate-500 mb-3">${escapeHtml(order.title)} · <span class="capitalize">${escapeHtml(order.status)}</span></p>
      <div class="text-sm space-y-2 mb-4">
        <div class="flex justify-between"><span class="text-slate-500">${isSeller ? 'Buyer' : 'Seller'}</span><span class="font-medium">${escapeHtml(other)}</span></div>
        <div class="flex justify-between"><span class="text-slate-500">Price</span><span class="font-bold text-brandPrimary">${money(order.price)}</span></div>
      </div>
      ${
        order.status !== 'cancelled'
          ? `<div class="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 text-sm font-mono space-y-1 mb-4">
        <p class="text-[10px] uppercase text-slate-400 font-sans font-bold mb-1">Account credentials</p>
        <p><span class="text-slate-500">User:</span> ${escapeHtml(cred.username || '—')}</p>
        <p><span class="text-slate-500">Pass:</span> ${escapeHtml(cred.password || '—')}</p>
        ${cred.previewLink ? `<p class="break-all"><span class="text-slate-500">Link:</span> ${escapeHtml(cred.previewLink)}</p>` : ''}
        ${cred.twoFA ? `<p><span class="text-slate-500">2FA:</span> ${escapeHtml(cred.twoFA)}</p>` : ''}
        ${cred.attachedEmail ? `<p><span class="text-slate-500">Email:</span> ${escapeHtml(cred.attachedEmail)}</p>` : ''}
        ${cred.extraInfo ? `<p class="font-sans text-xs mt-2">${escapeHtml(cred.extraInfo)}</p>` : ''}
      </div>`
          : '<p class="text-xs text-red-500 mb-4">Order cancelled / refunded.</p>'
      }
      <div class="grid grid-cols-2 gap-2">
        <button onclick="openOrderChat('${orderId}')" class="bg-brandPrimary text-white py-2.5 rounded-xl text-xs font-bold">Chat ${isSeller ? 'Buyer' : 'Seller'}</button>
        ${isSeller && order.status !== 'cancelled' ? `<button onclick="confirmRefund('${orderId}')" class="bg-red-500 text-white py-2.5 rounded-xl text-xs font-bold">Refund Buyer</button>` : '<div></div>'}
        ${isSeller && order.status === 'pending' ? `<button onclick="releaseOrder('${orderId}')" class="col-span-2 border border-brandPrimary text-brandPrimary py-2.5 rounded-xl text-xs font-bold">Release / Complete Order</button>` : ''}
      </div>`;
    document.getElementById('appModal').classList.remove('hidden');
  };

  window.confirmRefund = async function (orderId) {
    if (!confirm('Refund this order to the buyer? This will cancel the order and cannot be undone.')) return;
    const u = refreshUser();
    const res = await Promise.resolve(A().refundOrder(u, orderId));
    if (!res.ok) {
      alert(res.error);
      return;
    }
    closeModal();
    applyProfileChrome(refreshUser());
    renderOrders();
    alert('Buyer refunded.');
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
    alert('Order completed. Funds moved from escrow to your balance.');
  };

  window.openOrderChat = async function (orderId) {
    activeOrderId = orderId;
    closeModal();
    document.getElementById('chatOverlay').classList.remove('hidden');
    document.getElementById('chatOverlay').classList.add('flex');
    if (window.AcctventaApiSync && window.AcctventaApiSync.usingApi()) {
      await window.AcctventaApiSync.loadMessages(orderId);
    }
    renderChat();
  };

  window.closeOrderChat = function () {
    document.getElementById('chatOverlay').classList.add('hidden');
    document.getElementById('chatOverlay').classList.remove('flex');
  };

  function renderChat() {
    const box = document.getElementById('chatMessages');
    if (!box || !activeOrderId) return;
    const msgs = A().getMessages(activeOrderId);
    const u = refreshUser();
    box.innerHTML = msgs.length
      ? msgs
          .map((m) => {
            const mine = m.fromEmail === u.email;
            return `<div class="flex ${mine ? 'justify-end' : 'justify-start'}"><div class="max-w-[80%] rounded-2xl px-3 py-2 text-sm ${mine ? 'bg-brandPrimary text-white' : 'bg-slate-100 dark:bg-slate-800'}"><p class="text-[10px] opacity-70 mb-0.5">${escapeHtml(m.fromName)}</p>${escapeHtml(m.text)}</div></div>`;
          })
          .join('')
      : '<p class="text-center text-xs text-slate-400 py-8">No messages yet. Say hello.</p>';
    box.scrollTop = box.scrollHeight;
  }

  window.sendChatMessage = async function () {
    const input = document.getElementById('chatInput');
    const text = (input.value || '').trim();
    if (!text || !activeOrderId) return;
    const u = refreshUser();
    await Promise.resolve(A().sendMessage(u, activeOrderId, text));
    input.value = '';
    if (window.AcctventaApiSync && window.AcctventaApiSync.usingApi()) {
      await window.AcctventaApiSync.loadMessages(activeOrderId);
    }
    renderChat();
  };

  // -------- Wallet --------
  window.openWalletModal = function (type) {
    const cfg = A().CONFIG;
    const bal = money((refreshUser() || {}).balance);
    if (type === 'deposit') {
      document.getElementById('modalBody').innerHTML = `
        <div class="space-y-1">
          <div class="w-11 h-11 rounded-xl bg-brandPrimary/15 text-brandPrimary flex items-center justify-center mb-3"><i class="fa-solid fa-wallet"></i></div>
          <h3 class="font-bold text-xl tracking-tight">Fund Wallet</h3>
          <p class="text-xs text-slate-500">Secure checkout powered by Flutterwave. Minimum ${money(cfg.minDeposit)}.</p>
          <div class="relative mt-3"><span class="absolute left-4 top-3.5 text-slate-400 font-semibold">$</span>
          <input id="walletAmountInput" type="number" min="${cfg.minDeposit}" step="0.01" placeholder="${cfg.minDeposit.toFixed(2)}" class="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl pl-8 pr-4 py-3.5 text-sm focus:outline-none focus:border-brandPrimary"></div>
          <ul class="text-[11px] text-slate-500 space-y-1 mt-3 mb-4">
            <li><i class="fa-solid fa-shield-halved text-brandPrimary mr-1"></i>Card, bank & more via Flutterwave</li>
            <li><i class="fa-solid fa-bolt text-brandPrimary mr-1"></i>Balance updates after payment confirms</li>
          </ul>
          <button onclick="submitWalletAction('deposit')" class="w-full bg-brandPrimary hover:bg-brandHover text-white py-3.5 rounded-xl font-bold text-sm shadow-md">Pay securely</button>
        </div>`;
    } else {
      const feePct = (cfg.withdrawCommissionRate * 100).toFixed(0);
      document.getElementById('modalBody').innerHTML = `
        <div class="space-y-1">
          <div class="w-11 h-11 rounded-xl bg-brandPrimary/15 text-brandPrimary flex items-center justify-center mb-3"><i class="fa-solid fa-money-bill-transfer"></i></div>
          <h3 class="font-bold text-xl tracking-tight">Withdraw Funds</h3>
          <p class="text-xs text-slate-500">Available ${bal}. Minimum ${money(cfg.minWithdraw)}. Platform fee ${feePct}%.</p>
          <div class="relative mt-3"><span class="absolute left-4 top-3.5 text-slate-400 font-semibold">$</span>
          <input id="walletAmountInput" type="number" min="${cfg.minWithdraw}" step="0.01" placeholder="${cfg.minWithdraw.toFixed(2)}" class="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl pl-8 pr-4 py-3.5 text-sm"></div>
          <label class="block text-[11px] text-slate-500 mt-3 mb-1">Payout method</label>
          <select id="withdrawMethod" class="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 text-sm mb-2">
            <option value="bank">Bank account</option>
            <option value="crypto">Crypto wallet</option>
          </select>
          <input id="withdrawDest" type="text" placeholder="Account number or wallet address" class="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 text-sm mb-2">
          <input id="withdrawName" type="text" placeholder="Account / wallet name" class="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 text-sm mb-2">
          <input id="withdrawBank" type="text" placeholder="Bank name (optional)" class="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 text-sm mb-4">
          <p class="text-[11px] text-slate-400 mb-3">You’ll receive amount − ${feePct}% fee after owner approval.</p>
          <button onclick="submitWalletAction('withdraw')" class="w-full bg-brandPrimary hover:bg-brandHover text-white py-3.5 rounded-xl font-bold text-sm shadow-md">Request withdrawal</button>
        </div>`;
    }
    document.getElementById('appModal').classList.remove('hidden');
  };

  window.submitWalletAction = async function (type) {
    const u = refreshUser();
    const amount = parseFloat(document.getElementById('walletAmountInput').value);
    let res;
    if (type === 'deposit') {
      const btn = event && event.target;
      if (btn && btn.tagName === 'BUTTON') {
        btn.disabled = true;
        btn.textContent = 'Opening Flutterwave…';
      }
      res = await Promise.resolve(A().deposit(u, amount));
      if (res.ok && res.checkout) return; // redirected
    } else {
      const dest = (document.getElementById('withdrawDest') || {}).value || '';
      const accountName = (document.getElementById('withdrawName') || {}).value || '';
      const bankName = (document.getElementById('withdrawBank') || {}).value || '';
      res = await Promise.resolve(
        A().withdraw(u, amount, (document.getElementById('withdrawMethod') || {}).value, {
          destination: dest.trim(),
          accountName: accountName.trim(),
          bankName: bankName.trim(),
        })
      );
    }
    if (!res.ok) {
      alert(res.error);
      if (type === 'deposit') openWalletModal('deposit');
      return;
    }
    closeModal();
    applyProfileChrome(refreshUser());
    renderTxHistory();
    if (type === 'deposit') alert('Deposit credited: ' + money(res.credited));
    else alert(res.message || ('Withdrawal requested. Payout after fee: ' + money(res.payout)));
  };

  window.selectPlan = function (planId) {
    const u = refreshUser();
    if (planId !== 'free' && !confirm('Paid plans need a payment gateway. For now this will activate the plan in-app so you can test upload limits. Continue?')) return;
    A().setPlan(u, planId);
    applyProfileChrome(refreshUser());
    renderPlans();
    alert('Plan updated to ' + A().getPlan(refreshUser()).name);
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

  window.AcctventaUI = {
    refreshAll() {
      const u = requireAuth();
      if (!u) return;
      applyProfileChrome(u);
      renderMarketplace();
      renderAds();
      renderOrders();
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
    }
  };

  document.addEventListener('DOMContentLoaded', async () => {
    if (window.AcctventaApiSync) {
      await window.AcctventaApiSync.hydrateFromApi();
    }
    window.AcctventaUI.refreshAll();
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

/**
 * Sync dashboard local state from MySQL API when available.
 * Keeps existing UI code working by hydrating the AcctSuite user shape.
 */
(function (global) {
  const TOKEN_KEY = 'acctsuite_api_token';

  function usingApi() {
    try {
      if (global.AcctSuiteApi && global.AcctSuiteApi.hasApiSession) {
        return global.AcctSuiteApi.hasApiSession();
      }
      return localStorage.getItem('acctsuite_backend') === 'api' &&
        !!(localStorage.getItem(TOKEN_KEY) || localStorage.getItem('isLoggedIn') === 'true');
    } catch (e) {
      return false;
    }
  }

  async function ensureApiSession(Api) {
    if (!Api) return false;
    if (Api.getToken && Api.getToken()) return true;
    if (usingApi()) return true;
    try {
      const me = await Api.me();
      if (me && me.user) {
        try {
          localStorage.setItem('acctsuite_backend', 'api');
          localStorage.setItem('isLoggedIn', 'true');
        } catch (e) {}
        if (Api.applySessionUser) Api.applySessionUser(me.user);
        return true;
      }
    } catch (e) {}
    return false;
  }

  function mapAd(row) {
    return {
      id: String(row.id),
      title: row.title,
      description: row.description || '',
      category: row.category || '',
      price: Number(row.price) || 0,
      releaseType: row.release_type || row.releaseType || 'auto',
      status: row.status,
      denyReason: row.deny_reason || row.denyReason || '',
      previewLink: row.preview_link || row.previewLink || '',
      username: row.username,
      password: row.password_plain || row.password || '',
      attachedEmail: row.attached_email || '',
      attachedEmailPassword: row.attached_email_password || '',
      twoFA: row.two_fa || '',
      extraInfo: row.extra_info || '',
      createdAt: row.created_at || row.createdAt,
      stock: row.stock != null ? Number(row.stock) : 1,
    };
  }

  function mapOrder(row) {
    return {
      id: String(row.id),
      publicId: row.public_id || row.publicId || row.txid || '',
      txid: row.txid || row.public_id || row.publicId || '',
      listingId: row.listing_id != null ? String(row.listing_id) : '',
      title: row.title,
      category: row.category || '',
      price: Number(row.price) || 0,
      status: row.status,
      role: row.role === 'seller' ? 'seller' : 'buyer',
      buyerName: row.buyerName || '',
      sellerName: row.sellerName || '',
      sellerEmail: row.sellerEmail || '',
      sellerId: row.sellerId != null ? String(row.sellerId) : (row.seller_id != null ? String(row.seller_id) : ''),
      buyerEmail: row.buyerEmail || '',
      credentials: row.credentials || null,
      canReview: !!row.canReview,
      reviewed: !!row.reviewed,
      createdAt: row.created_at || row.createdAt,
      orderStatusStep: row.order_status_step || row.orderStatusStep || null,
      disputeDeadlineAt: row.dispute_deadline_at || row.disputeDeadlineAt || null,
      disputeExpiredAt: row.dispute_expired_at || row.disputeExpiredAt || null,
      fundsReleasedAt: row.funds_released_at || row.fundsReleasedAt || null,
      warrantyUntil: row.warranty_until || row.warrantyUntil || null,
    };
  }

  function mapListing(row) {
    const name = row.sellerName || 'Seller';
    const parts = String(name).trim().split(/\s+/).filter(Boolean);
    const initials = !parts.length ? '?' : parts.length === 1 ? parts[0].slice(0, 2).toUpperCase() : (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
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
      sellerMerchantSlug: row.sellerMerchantSlug || row.seller_merchant_slug || row.merchant_slug || '',
      sellerVerified: row.sellerVerified === true || row.sellerVerified === 1 || row.sellerVerified === '1'
        || row.seller_verified === true || row.seller_verified === 1 || row.seller_verified === '1',
      sellerRating: Number(row.sellerRating) || 0,
      sellerReviews: Number(row.sellerReviews) || 0,
      sellerCompletedSales: Number(row.sellerCompletedSales || row.seller_completed_sales) || 0,
      sellerAvatar: row.sellerAvatar || row.seller_avatar || row.avatarUrl || row.avatar_url || '',
      sellerInitials: initials,
      stock: row.stock != null ? Number(row.stock) : 1,
      publicSlug: row.publicSlug || row.public_slug || '',
      createdAt: row.created_at || row.createdAt || '',
    };
  }

  function mapTx(row) {
    const publicId = row.publicId || row.txid || row.reference || '';
    return {
      id: String(row.id),
      type: row.type,
      amount: Number(row.amount) || 0,
      fee: Number(row.fee) || 0,
      payout: row.payout != null ? Number(row.payout) : null,
      status: row.status,
      method: row.method || '',
      note: row.note || '',
      reference: publicId || String(row.reference || ''),
      publicId: publicId || String(row.reference || row.id || ''),
      txid: publicId || String(row.reference || row.id || ''),
      createdAt: row.created_at || row.createdAt,
    };
  }

  function mapNotif(row) {
    const body = row.body || '';
    let ref = row.ref_id != null && String(row.ref_id).trim() ? String(row.ref_id).trim() : (row.ref != null ? String(row.ref).trim() : '');
    if (!ref) {
      const tx = String(body).match(/TXID\s+([A-Za-z0-9_-]+)/i);
      if (tx) ref = tx[1];
    }
    if (!ref) {
      const hash = String(body).match(/#([A-Za-z0-9-]{8,})/);
      if (hash) ref = hash[1];
    }
    return {
      id: String(row.id),
      title: row.title,
      body: body,
      type: row.type || 'info',
      ref: ref,
      read: !!(row.is_read || row.read),
      createdAt: row.created_at || row.createdAt,
    };
  }

  const DEMO_SELLER_NAMES = { omoba: 1, michael: 1, ugochukwu: 1 };

  function isDemoSellerIdentity(email, name) {
    const e = String(email || '').toLowerCase();
    const n = String(name || '').trim().toLowerCase();
    if (e.endsWith('@acctsuite.local') || e.indexOf('demo.') === 0) return true;
    if (n && DEMO_SELLER_NAMES[n]) return true;
    return false;
  }

  function isDemoListing(row) {
    if (!row) return false;
    return isDemoSellerIdentity(row.sellerEmail || row.email, row.sellerName || row.name);
  }

  /** Strip legacy browser-seeded demo sellers so they never resurface as "live" ads. */
  function scrubLocalDemoMarketplace() {
    try {
      const raw = localStorage.getItem('acctsuite_users');
      if (!raw) return;
      const users = JSON.parse(raw);
      if (!users || typeof users !== 'object') return;
      let changed = false;
      Object.keys(users).forEach((email) => {
        const u = users[email];
        if (!u || typeof u !== 'object') return;
        if (isDemoSellerIdentity(email, u.name)) {
          delete users[email];
          changed = true;
          return;
        }
        if (Array.isArray(u.ads) && u.ads.length) {
          const next = u.ads.filter((ad) => {
            if (!ad) return false;
            const title = String(ad.title || '').toLowerCase();
            // Known seed titles from old demo packs
            if (title.indexOf('facebook account') !== -1 && title.indexOf('nigeria') !== -1) return false;
            if (title.indexOf('express vpn') !== -1 || title.indexOf('expressvpn') !== -1) return false;
            if (title.indexOf('premium express') !== -1) return false;
            return true;
          });
          if (next.length !== u.ads.length) {
            u.ads = next;
            changed = true;
          }
        }
      });
      if (changed) localStorage.setItem('acctsuite_users', JSON.stringify(users));
    } catch (e) {}
  }

  async function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /** Fetch live market with short retries — never invent an empty catalog on transient failure. */
  async function fetchMarketListingsMapped(Api, attempts) {
    const tries = Math.max(1, attempts || 3);
    let lastErr = null;
    for (let i = 0; i < tries; i++) {
      try {
        if (i > 0 && Api.clearAvailabilityCache) Api.clearAvailabilityCache();
        const marketRes = await Api.market();
        const listings = (marketRes.listings || [])
          .map(mapListing)
          .filter((row) => !isDemoListing(row));
        return { ok: true, listings: listings };
      } catch (e) {
        lastErr = e;
        await sleep(180 * (i + 1));
      }
    }
    return { ok: false, error: lastErr, listings: null };
  }

  function patchMarketListingsOnly() {
    const A = global.AcctSuite;
    if (!A || A.__apiMarketPatched) return;
    A.__apiMarketPatched = true;
    const origMarket = A.getMarketplaceListings.bind(A);
    A.getMarketplaceListings = function () {
      // Once the live API catalog has been loaded (even if empty), never fall back to
      // localStorage seed ads — that is what made old demo listings "come back".
      if (Array.isArray(global.__acctsuiteApiMarket)) return global.__acctsuiteApiMarket;
      if (global.__acctsuitePreferApiMarket) return [];
      return (origMarket() || []).filter((row) => !isDemoListing(row));
    };
    const origFind = A.findListingById.bind(A);
    A.findListingById = function (id) {
      if (Array.isArray(global.__acctsuiteApiMarket)) {
        const hit = global.__acctsuiteApiMarket.find((x) => String(x.id) === String(id));
        if (hit) return hit;
        if (global.__acctsuitePreferApiMarket) return null;
      }
      const local = origFind(id);
      return local && isDemoListing(local) ? null : local;
    };
  }

  /** Public marketplace for guests (no login required). */
  async function hydratePublicMarket() {
    const Api = global.AcctSuiteApi;
    const A = global.AcctSuite;
    if (!Api || !A) {
      global.__acctsuiteMarketReady = true;
      return false;
    }
    scrubLocalDemoMarketplace();
    patchMarketListingsOnly();
    let result = false;
    try {
      let ok = false;
      try {
        if (Api.clearAvailabilityCache) Api.clearAvailabilityCache();
        ok = await Api.isAvailable();
      } catch (e) {
        ok = false;
      }
      if (!ok) {
        // One more attempt after a short pause (first paint often races PHP warm-up).
        await sleep(250);
        try {
          if (Api.clearAvailabilityCache) Api.clearAvailabilityCache();
          ok = await Api.isAvailable();
        } catch (e2) {
          ok = false;
        }
      }
      if (!ok) {
        result = false;
      } else {
        try {
          global.__acctsuitePreferApiMarket = true;
          const fetched = await fetchMarketListingsMapped(Api, 3);
          if (!fetched.ok) {
            console.warn('Public market hydrate failed', fetched.error);
            // Keep any previous successful catalog; do not wipe to [].
            result = Array.isArray(global.__acctsuiteApiMarket);
          } else {
            global.__acctsuiteApiMarket = fetched.listings;
            patchMarketListingsOnly();
            try {
              const feed = await Api.storiesFeed().catch(() => ({ merchants: [] }));
              global.__acctsuiteStoryFeed = (feed.merchants || []).filter(
                (m) => !isDemoSellerIdentity(m.sellerEmail, m.sellerName)
              );
            } catch (e2) {
              // Keep prior feed on failure
              global.__acctsuiteStoryFeed = global.__acctsuiteStoryFeed || [];
            }
            result = true;
          }
        } catch (e) {
          console.warn('Public market hydrate failed', e);
          result = Array.isArray(global.__acctsuiteApiMarket);
        }
      }
    } finally {
      // Always flip ready so the UI never stays on skeleton / empty-flash forever.
      global.__acctsuiteMarketReady = true;
    }
    return result;
  }

  async function hydrateFromApi() {
    const Api = global.AcctSuiteApi;
    const A = global.AcctSuite;
    if (!Api || !A) return false;
    let ok = false;
    try {
      ok = await Api.isAvailable();
    } catch (e) {
      return false;
    }
    if (!ok) return false;
    const sessionOk = await ensureApiSession(Api);
    if (!sessionOk) return false;

    try {
      const [me, adsRes, ordersRes, marketRes, walletRes, notesRes, cfgRes] = await Promise.all([
        Api.me(),
        Api.myAds()
          .then((r) => Object.assign({ __adsOk: true }, r || {}))
          .catch((e) => ({ __adsOk: false, ads: null, error: e && e.message })),
        Api.myOrders()
          .then((r) => Object.assign({ __ordersOk: true }, r || {}))
          .catch((e) => ({ __ordersOk: false, orders: null, error: e && e.message })),
        // Never invent an empty catalog here — failures must not wipe a good public hydrate.
        fetchMarketListingsMapped(Api, 3).then((r) => Object.assign({ __marketOk: !!r.ok }, r)),
        Api.wallet().then((r) => Object.assign({ __walletOk: true }, r || {})).catch((e) => ({ __walletOk: false, transactions: null, error: e && e.message })),
        Api.notifications().catch(() => ({ notifications: [] })),
        Api.publicConfig().catch(() => null),
      ]);

      const user = me.user;
      const uploadsToday = Number(me.uploadsToday) || 0;
      const dayKey = (() => {
        const d = new Date();
        return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      })();

      let prevUser = null;
      try {
        prevUser = A.getCurrentUser && A.getCurrentUser();
      } catch (e) {}

      // Keep previous history if wallet.summary failed (e.g. Flutterwave timeout after key change)
      let txs = [];
      if (walletRes && walletRes.__walletOk) {
        txs = (walletRes.transactions || []).map(mapTx);
      } else {
        if (prevUser && Array.isArray(prevUser.transactions)) txs = prevUser.transactions;
        if (walletRes && walletRes.error) {
          console.warn('Wallet history sync failed', walletRes.error);
        }
      }

      // Keep previous orders if orders.mine failed — never wipe a successful purchase from the UI
      let orders = [];
      if (ordersRes && ordersRes.__ordersOk) {
        orders = (ordersRes.orders || []).map(mapOrder);
      } else {
        if (prevUser && Array.isArray(prevUser.orders)) orders = prevUser.orders;
        if (ordersRes && ordersRes.error) {
          console.warn('Orders sync failed', ordersRes.error);
        }
      }

      let ads = [];
      if (adsRes && adsRes.__adsOk) {
        ads = (adsRes.ads || []).map(mapAd);
      } else {
        if (prevUser && Array.isArray(prevUser.ads)) ads = prevUser.ads;
        if (adsRes && adsRes.error) {
          console.warn('Ads sync failed', adsRes.error);
        }
      }

      const local = {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone || '',
        countryCode: user.countryCode || '',
        balance: user.balance,
        withdrawableBalance: user.withdrawableBalance != null ? user.withdrawableBalance : 0,
        owing: user.owing || (Number(user.balance) < 0 ? Math.abs(Number(user.balance)) : 0),
        escrowBalance: user.escrowBalance,
        totalDeposits: user.totalDeposits,
        totalWithdrawals: user.totalWithdrawals,
        plan: user.plan || 'free',
        referralCode: user.referralCode,
        isVerified: !!user.isVerified,
        kycStatus: user.kycStatus || (user.isVerified ? 'verified' : 'none'),
        createdAt: user.createdAt,
        payoutBank: user.payoutBank || '',
        payoutAccount: user.payoutAccount || '',
        payoutAccountName: user.payoutAccountName || '',
        payoutCurrency: user.payoutCurrency || '',
        payoutBankLocked: !!user.payoutBankLocked,
        payoutBankCode: user.payoutBankCode || '',
        avatarUrl: user.avatarUrl || '',
        merchantSlug: user.merchantSlug || null,
        merchantLink: user.merchantLink || null,
        ads: ads,
        orders: orders,
        transactions: txs,
        notifications: (notesRes.notifications || []).map(mapNotif),
        messages: {},
        uploadsByDay: { [dayKey]: uploadsToday },
        password: '', // never store API password locally
      };

      A.persistUser(local);
      Api.applySessionUser(user);
      try {
        localStorage.setItem('acctsuite_backend', 'api');
      } catch (e) {}

      global.__acctsuitePreferApiMarket = true;
      if (marketRes && marketRes.__marketOk && Array.isArray(marketRes.listings)) {
        global.__acctsuiteApiMarket = marketRes.listings;
      } else if (!Array.isArray(global.__acctsuiteApiMarket)) {
        // Session hydrate ran before public market — try once more without wiping.
        const pub = await fetchMarketListingsMapped(Api, 2);
        if (pub.ok) global.__acctsuiteApiMarket = pub.listings;
      }
      patchMarketListingsOnly();
      try {
        const feed = await Api.storiesFeed().catch(() => ({ merchants: [] }));
        global.__acctsuiteStoryFeed = (feed.merchants || []).filter(
          (m) => !isDemoSellerIdentity(m.sellerEmail, m.sellerName)
        );
      } catch (eFeed) {
        global.__acctsuiteStoryFeed = global.__acctsuiteStoryFeed || [];
      }

      if (cfgRes && cfgRes.config) {
        A.saveSettings({
          config: {
            minDeposit: cfgRes.config.minDeposit,
            minWithdraw: cfgRes.config.minWithdraw,
            withdrawCommissionRate: cfgRes.config.withdrawCommissionRate,
            salesCommissionRate: cfgRes.config.salesCommissionRate != null ? cfgRes.config.salesCommissionRate : 0.22,
            depositFeeRate: cfgRes.config.depositFeeRate,
            supportTelegram: cfgRes.config.supportTelegram,
            groupTelegram: cfgRes.config.groupTelegram,
            supportWhatsapp: cfgRes.config.supportWhatsapp,
            supportEmail: cfgRes.config.supportEmail,
            siteName: cfgRes.config.siteName,
            siteTagline: cfgRes.config.siteTagline,
            announcementEnabled: !!cfgRes.config.announcementEnabled,
            announcementText: cfgRes.config.announcementText || '',
            maintenanceMode: !!cfgRes.config.maintenanceMode,
            maintenanceMessage: cfgRes.config.maintenanceMessage || '',
            listingsPaused: !!cfgRes.config.listingsPaused,
            listingsPausedMessage: cfgRes.config.listingsPausedMessage || '',
            referralsEnabled: cfgRes.config.referralsEnabled !== false,
            registrationsEnabled: cfgRes.config.registrationsEnabled !== false,
            disputeWindowMinutes: cfgRes.config.disputeWindowMinutes || 60,
            warrantyHours: cfgRes.config.warrantyHours || 24,
            paymentCurrency: cfgRes.config.paymentCurrency || 'NGN',
            usdNgnRate: cfgRes.config.usdNgnRate || 1600,
            walletCurrencies: cfgRes.config.walletCurrencies || null,
          },
        });
        try {
          if (typeof window.applyAcctSuiteSiteControls === 'function') {
            window.applyAcctSuiteSiteControls(cfgRes.config);
          }
        } catch (eBanner) {}
        if (Array.isArray(cfgRes.plans)) {
          const plans = {};
          cfgRes.plans.forEach((p) => {
            plans[p.id] = {
              id: p.id,
              name: p.name,
              price: Number(p.price) || 0,
              dailyUploads: Number(p.dailyUploads) || 0,
              approval: p.approval || '',
            };
          });
          A.saveSettings({ plans });
        }
      }

      patchAcctSuiteForApi();
      return true;
    } catch (e) {
      console.warn('API hydrate failed', e);
      if (e && e.status === 401) {
        try {
          localStorage.removeItem('acctsuite_backend');
          Api.setToken('');
        } catch (err) {}
      }
      return false;
    }
  }

  function patchAcctSuiteForApi() {
    const A = global.AcctSuite;
    const Api = global.AcctSuiteApi;
    if (!A || !Api || A.__apiPatched) return;
    A.__apiPatched = true;

    patchMarketListingsOnly();

    A.createAd = async function (_user, draft) {
      try {
        let online = false;
        try {
          online = await Api.isAvailable();
        } catch (e) {}
        if (!online) {
          return { ok: false, error: 'Cannot reach the server. Check your connection and try again.', code: 'offline' };
        }
        await ensureApiSession(Api);
        const priceRaw = draft && draft.price;
        const priceNum = Number(String(priceRaw ?? '').replace(/,/g, '.'));
        if (!Number.isFinite(priceNum) || priceNum <= 0) {
          return { ok: false, error: 'Invalid listing price. Enter a valid amount (e.g. 8.00).', code: 'validation' };
        }
        const payload = {
          category: draft.category,
          title: draft.title,
          description: draft.description || '',
          price: Math.round(priceNum * 100) / 100,
          releaseType: draft.releaseType || 'auto',
          username: draft.username,
          password: draft.password,
          previewLink: draft.previewLink || '',
          attachedEmail: draft.attachedEmail || '',
          attachedEmailPassword: draft.attachedEmailPassword || '',
          twoFA: draft.twoFA || '',
          extraInfo: draft.extraInfo || '',
        };
        const res = await Api.createAd(payload);
        const mapped = mapAd(res.ad || {});
        // Merge immediately so My Ads never looks empty if hydrate glitches
        try {
          const cur = A.getCurrentUser && A.getCurrentUser();
          if (cur) {
            const rest = (cur.ads || []).filter((a) => String(a.id) !== String(mapped.id));
            cur.ads = [mapped].concat(rest);
            if (typeof cur.uploadsToday === 'number') cur.uploadsToday += 1;
            try {
              const d = new Date();
              const dayKey =
                d.getFullYear() +
                '-' +
                String(d.getMonth() + 1).padStart(2, '0') +
                '-' +
                String(d.getDate()).padStart(2, '0');
              cur.uploadsByDay = cur.uploadsByDay || {};
              cur.uploadsByDay[dayKey] = (Number(cur.uploadsByDay[dayKey]) || 0) + 1;
            } catch (e2) {}
            A.persistUser(cur);
          }
        } catch (e) {}
        try {
          await hydrateFromApi();
        } catch (e) {}
        return {
          ok: true,
          ad: mapped,
          ai: res.ai,
          status: res.status || mapped.status || 'pending',
          message: res.message || '',
        };
      } catch (e) {
        if (e && e.status === 401) {
          return { ok: false, error: 'Session expired. Log out, sign in again, then retry.', code: 'auth' };
        }
        return { ok: false, error: e.message || 'Failed to create listing', code: e.code || '' };
      }
    };

    A.purchaseListing = async function (_user, listingId) {
      try {
        const res = await Api.createOrder({ listingId: Number(listingId) });
        if (Api.applyPurchaseResult) Api.applyPurchaseResult(res);
        // Merge the new order immediately so Orders is never empty if hydrate/myOrders glitches
        try {
          const cur = A.getCurrentUser && A.getCurrentUser();
          if (cur && res) {
            const mapped = mapOrder({
              id: res.orderId || res.id,
              public_id: res.publicId || res.txid || res.public_id,
              txid: res.publicId || res.txid,
              listing_id: res.listingId || listingId,
              title: res.title || 'Order',
              category: res.category || '',
              price: res.price,
              status: res.status || 'completed',
              role: 'buyer',
              sellerName: res.sellerName || '',
              sellerEmail: res.sellerEmail || '',
              sellerId: res.sellerId,
              credentials: res.credentials || null,
              created_at: res.createdAt || new Date().toISOString(),
              order_status_step: res.orderStatusStep || (res.status === 'completed' ? 'delivered' : 'paid'),
              canReview: !!(res.status === 'completed'),
              reviewed: false,
            });
            const rest = (cur.orders || []).filter((o) => String(o.id) !== String(mapped.id));
            cur.orders = [mapped].concat(rest);
            if (res.balance != null) cur.balance = Number(res.balance);
            A.persistUser(cur);
          }
        } catch (mergeErr) {
          console.warn('Could not merge purchase into local orders', mergeErr);
        }
        await hydrateFromApi();
        return { ok: true, orderId: res && (res.orderId || res.id), publicId: res && (res.publicId || res.txid) };
      } catch (e) {
        return { ok: false, error: e.message || 'Purchase failed', code: e.code || '' };
      }
    };

    /** Force-refresh orders list from API (used when opening Purchase / Orders). */
    A.refreshOrdersFromApi = async function () {
      return refreshOrdersFromApi();
    };

    A.refundOrder = async function (_user, orderId) {
      try {
        const res = await Api.orderRefund({ orderId: Number(orderId) });
        await hydrateFromApi();
        return { ok: true, owing: res.owing || 0, sellerBalance: res.sellerBalance };
      } catch (e) {
        return { ok: false, error: e.message || 'Refund failed' };
      }
    };

    A.completeManualOrder = async function (_user, orderId) {
      try {
        await Api.orderRelease({ orderId: Number(orderId) });
        await hydrateFromApi();
        return { ok: true };
      } catch (e) {
        return { ok: false, error: e.message || 'Release failed' };
      }
    };

    A.deposit = async function (_user, amount) {
      try {
        const res = await Api.deposit({ amount: Number(amount) });
        if (res.paymentLink) {
          window.location.href = res.paymentLink;
          return { ok: true, checkout: true, paymentLink: res.paymentLink };
        }
        await hydrateFromApi();
        return { ok: true, credited: res.credited };
      } catch (e) {
        return { ok: false, error: e.message || 'Deposit failed' };
      }
    };

    A.withdraw = async function (_user, amount, method, extra) {
      try {
        const payload = {
          amount: Number(amount),
          method: method || 'bank',
          destination: (extra && extra.destination) || '',
          accountName: (extra && extra.accountName) || '',
          bankName: (extra && extra.bankName) || '',
          bankCode: (extra && extra.bankCode) || '',
          currency: (extra && extra.currency) || '',
        };
        const res = await Api.withdraw(payload);
        await hydrateFromApi();
        return { ok: true, payout: res.payout, fee: res.fee, message: res.message };
      } catch (e) {
        return { ok: false, error: e.message || 'Withdraw failed' };
      }
    };

    A.setPlan = async function (_user, planId, opts) {
      try {
        const method = (opts && opts.method) || 'flutterwave';
        const res = await Api.upgradePlan({ planId: String(planId), method });
        if (res.paymentLink) {
          window.location.href = res.paymentLink;
          return { ok: true, checkout: true, paymentLink: res.paymentLink };
        }
        await hydrateFromApi();
        return {
          ok: true,
          plan: res.plan,
          dailyUploads: res.dailyUploads,
          message: res.message || 'Plan updated.',
        };
      } catch (e) {
        return { ok: false, error: e.message || 'Plan upgrade failed', code: e.code || '' };
      }
    };

    A.getMessages = function (orderId) {
      return global.__acctsuiteApiMessages && global.__acctsuiteApiMessages[orderId]
        ? global.__acctsuiteApiMessages[orderId]
        : [];
    };

    A.sendMessage = async function (_user, orderId, text, extra) {
      try {
        const payload = { orderId: Number(orderId), text };
        if (extra && extra.attachment) {
          payload.attachment = extra.attachment;
          payload.fileName = extra.fileName || 'attachment';
        }
        const res = await Api.sendMessage(payload);
        await loadMessages(orderId);
        if (res && res.fundsReleased) {
          await hydrateFromApi();
        }
        return { ok: true, fundsReleased: !!(res && res.fundsReleased), ai: res && res.ai };
      } catch (e) {
        return { ok: false, error: e.message || 'Send failed', code: e.code || '' };
      }
    };

    A.runAiReviewOnAd = function () {
      return false; // server already reviewed
    };
  }

  async function loadMessages(orderId) {
    const Api = global.AcctSuiteApi;
    if (!Api) return [];
    try {
      const res = await Api.getMessages(orderId);
      const mapped = (res.messages || []).map((m) => ({
        id: String(m.id),
        fromName: m.fromName || '',
        fromEmail: m.fromEmail || '',
        text: m.body || m.text || '',
        attachmentUrl: m.attachmentUrl || m.attachment_url || null,
        attachmentName: m.attachmentName || m.attachment_name || null,
        attachmentMime: m.attachmentMime || m.attachment_mime || null,
        createdAt: m.created_at || m.createdAt,
      }));
      global.__acctsuiteApiMessages = global.__acctsuiteApiMessages || {};
      global.__acctsuiteApiMessages[orderId] = mapped;
      return mapped;
    } catch (e) {
      return [];
    }
  }

  async function refreshOrdersFromApi() {
    const Api = global.AcctSuiteApi;
    const A = global.AcctSuite;
    if (!Api || !A) return false;
    try {
      const res = await Api.myOrders();
      const cur = A.getCurrentUser && A.getCurrentUser();
      if (!cur) return false;
      cur.orders = (res.orders || []).map(mapOrder);
      A.persistUser(cur);
      return true;
    } catch (e) {
      console.warn('refreshOrdersFromApi failed', e);
      return false;
    }
  }

  async function refreshAdsFromApi() {
    const Api = global.AcctSuiteApi;
    const A = global.AcctSuite;
    if (!Api || !A) return false;
    try {
      const res = await Api.myAds();
      const cur = A.getCurrentUser && A.getCurrentUser();
      if (!cur) return false;
      cur.ads = (res.ads || []).map(mapAd);
      A.persistUser(cur);
      return true;
    } catch (e) {
      console.warn('refreshAdsFromApi failed', e);
      return false;
    }
  }

  global.AcctSuiteApiSync = {
    hydrateFromApi,
    hydratePublicMarket,
    loadMessages,
    refreshOrdersFromApi,
    refreshAdsFromApi,
    usingApi,
    ensureApiSession,
    patchAcctSuiteForApi,
    mapOrder,
    mapListing,
  };
})(window);

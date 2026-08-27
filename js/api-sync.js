/**
 * Sync dashboard local state from MySQL API when available.
 * Keeps existing UI code working by hydrating the Acctventa user shape.
 */
(function (global) {
  const TOKEN_KEY = 'acctventa_api_token';

  function usingApi() {
    try {
      if (global.AcctventaApi && global.AcctventaApi.hasApiSession) {
        return global.AcctventaApi.hasApiSession();
      }
      return localStorage.getItem('acctventa_backend') === 'api' &&
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
          localStorage.setItem('acctventa_backend', 'api');
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
    return {
      id: String(row.id),
      title: row.title,
      body: row.body || '',
      type: row.type || 'info',
      read: !!(row.is_read || row.read),
      createdAt: row.created_at || row.createdAt,
    };
  }

  function patchMarketListingsOnly() {
    const A = global.Acctventa;
    if (!A || A.__apiMarketPatched) return;
    A.__apiMarketPatched = true;
    const origMarket = A.getMarketplaceListings.bind(A);
    A.getMarketplaceListings = function () {
      if (global.__acctventaApiMarket) return global.__acctventaApiMarket;
      return origMarket();
    };
    const origFind = A.findListingById.bind(A);
    A.findListingById = function (id) {
      const list = global.__acctventaApiMarket || [];
      const hit = list.find((x) => String(x.id) === String(id));
      return hit || origFind(id);
    };
  }

  /** Public marketplace for guests (no login required). */
  async function hydratePublicMarket() {
    const Api = global.AcctventaApi;
    const A = global.Acctventa;
    if (!Api || !A) return false;
    let ok = false;
    try {
      ok = await Api.isAvailable();
    } catch (e) {
      return false;
    }
    if (!ok) return false;
    try {
      const marketRes = await Api.market().catch(() => ({ listings: [] }));
      global.__acctventaApiMarket = (marketRes.listings || []).map(mapListing);
      patchMarketListingsOnly();
      return true;
    } catch (e) {
      console.warn('Public market hydrate failed', e);
      return false;
    }
  }

  async function hydrateFromApi() {
    const Api = global.AcctventaApi;
    const A = global.Acctventa;
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
        Api.market().catch(() => ({ listings: [] })),
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
        localStorage.setItem('acctventa_backend', 'api');
      } catch (e) {}

      global.__acctventaApiMarket = (marketRes.listings || []).map(mapListing);

      if (cfgRes && cfgRes.config) {
        A.saveSettings({
          config: {
            minDeposit: cfgRes.config.minDeposit,
            minWithdraw: cfgRes.config.minWithdraw,
            withdrawCommissionRate: cfgRes.config.withdrawCommissionRate,
            salesCommissionRate: cfgRes.config.salesCommissionRate != null ? cfgRes.config.salesCommissionRate : 0.22,
            depositFeeRate: cfgRes.config.depositFeeRate,
            supportTelegram: cfgRes.config.supportTelegram,
            supportEmail: cfgRes.config.supportEmail,
            paymentCurrency: cfgRes.config.paymentCurrency || 'NGN',
            usdNgnRate: cfgRes.config.usdNgnRate || 1600,
            walletCurrencies: cfgRes.config.walletCurrencies || null,
          },
        });
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

      patchAcctventaForApi();
      return true;
    } catch (e) {
      console.warn('API hydrate failed', e);
      if (e && e.status === 401) {
        try {
          localStorage.removeItem('acctventa_backend');
          Api.setToken('');
        } catch (err) {}
      }
      return false;
    }
  }

  function patchAcctventaForApi() {
    const A = global.Acctventa;
    const Api = global.AcctventaApi;
    if (!A || !Api || A.__apiPatched) return;
    A.__apiPatched = true;

    patchMarketListingsOnly();

    A.createAd = async function (_user, draft) {
      try {
        // Token may live only in httponly cookie; request() still sends credentials
        if (!Api.getToken() && !usingApi()) {
          return { ok: false, error: 'You are offline from the server. Log out and sign in again, then retry.' };
        }
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
      return global.__acctventaApiMessages && global.__acctventaApiMessages[orderId]
        ? global.__acctventaApiMessages[orderId]
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
    const Api = global.AcctventaApi;
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
      global.__acctventaApiMessages = global.__acctventaApiMessages || {};
      global.__acctventaApiMessages[orderId] = mapped;
      return mapped;
    } catch (e) {
      return [];
    }
  }

  async function refreshOrdersFromApi() {
    const Api = global.AcctventaApi;
    const A = global.Acctventa;
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
    const Api = global.AcctventaApi;
    const A = global.Acctventa;
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

  global.AcctventaApiSync = {
    hydrateFromApi,
    hydratePublicMarket,
    loadMessages,
    refreshOrdersFromApi,
    refreshAdsFromApi,
    usingApi,
    ensureApiSession,
    patchAcctventaForApi,
    mapOrder,
    mapListing,
  };
})(window);

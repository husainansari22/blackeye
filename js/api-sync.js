/**
 * Sync dashboard local state from MySQL API when available.
 * Keeps existing UI code working by hydrating the Acctventa user shape.
 */
(function (global) {
  const TOKEN_KEY = 'acctventa_api_token';

  function usingApi() {
    try {
      return localStorage.getItem('acctventa_backend') === 'api' && !!(localStorage.getItem(TOKEN_KEY) || document.cookie.indexOf('acctventa_token=') !== -1);
    } catch (e) {
      return false;
    }
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
      publicId: row.public_id || row.publicId,
      listingId: row.listing_id != null ? String(row.listing_id) : '',
      title: row.title,
      category: row.category || '',
      price: Number(row.price) || 0,
      status: row.status,
      role: row.role === 'seller' ? 'seller' : 'buyer',
      buyerName: row.buyerName || '',
      sellerName: row.sellerName || '',
      credentials: row.credentials || null,
      createdAt: row.created_at || row.createdAt,
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
      sellerName: name,
      sellerEmail: row.sellerEmail || '',
      sellerVerified: !!(row.sellerVerified || row.seller_verified),
      sellerInitials: initials,
      stock: row.stock != null ? Number(row.stock) : 1,
    };
  }

  function mapTx(row) {
    return {
      id: String(row.id),
      type: row.type,
      amount: Number(row.amount) || 0,
      fee: Number(row.fee) || 0,
      payout: row.payout != null ? Number(row.payout) : null,
      status: row.status,
      method: row.method || '',
      note: row.note || '',
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
    if (!Api.getToken() && !usingApi()) return false;

    try {
      const [me, adsRes, ordersRes, marketRes, walletRes, notesRes, cfgRes] = await Promise.all([
        Api.me(),
        Api.myAds().catch(() => ({ ads: [] })),
        Api.myOrders().catch(() => ({ orders: [] })),
        Api.market().catch(() => ({ listings: [] })),
        Api.wallet().catch(() => ({ transactions: [] })),
        Api.notifications().catch(() => ({ notifications: [] })),
        Api.publicConfig().catch(() => null),
      ]);

      const user = me.user;
      const uploadsToday = Number(me.uploadsToday) || 0;
      const dayKey = (() => {
        const d = new Date();
        return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      })();

      const local = {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone || '',
        countryCode: user.countryCode || '',
        balance: user.balance,
        escrowBalance: user.escrowBalance,
        totalDeposits: user.totalDeposits,
        totalWithdrawals: user.totalWithdrawals,
        plan: user.plan || 'free',
        referralCode: user.referralCode,
        createdAt: user.createdAt,
        payoutBank: user.payoutBank || '',
        payoutAccount: user.payoutAccount || '',
        payoutAccountName: user.payoutAccountName || '',
        payoutCurrency: user.payoutCurrency || '',
        payoutBankLocked: !!user.payoutBankLocked,
        ads: (adsRes.ads || []).map(mapAd),
        orders: (ordersRes.orders || []).map(mapOrder),
        transactions: (walletRes.transactions || []).map(mapTx),
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

    A.createAd = async function (_user, draft) {
      try {
        const res = await Api.createAd(draft);
        await hydrateFromApi();
        return { ok: true, ad: mapAd(res.ad || {}), ai: res.ai };
      } catch (e) {
        return { ok: false, error: e.message || 'Failed to create listing' };
      }
    };

    A.purchaseListing = async function (_user, listingId) {
      try {
        await Api.createOrder({ listingId: Number(listingId) });
        await hydrateFromApi();
        return { ok: true };
      } catch (e) {
        return { ok: false, error: e.message || 'Purchase failed' };
      }
    };

    A.refundOrder = async function (_user, orderId) {
      try {
        await Api.orderRefund({ orderId: Number(orderId) });
        await hydrateFromApi();
        return { ok: true };
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
          currency: (extra && extra.currency) || '',
        };
        const res = await Api.withdraw(payload);
        await hydrateFromApi();
        return { ok: true, payout: res.payout, fee: res.fee, message: res.message };
      } catch (e) {
        return { ok: false, error: e.message || 'Withdraw failed' };
      }
    };

    A.getMessages = function (orderId) {
      return global.__acctventaApiMessages && global.__acctventaApiMessages[orderId]
        ? global.__acctventaApiMessages[orderId]
        : [];
    };

    A.sendMessage = async function (_user, orderId, text) {
      try {
        await Api.sendMessage({ orderId: Number(orderId), text });
        await loadMessages(orderId);
        return { ok: true };
      } catch (e) {
        return { ok: false, error: e.message || 'Send failed' };
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
        createdAt: m.created_at || m.createdAt,
      }));
      global.__acctventaApiMessages = global.__acctventaApiMessages || {};
      global.__acctventaApiMessages[orderId] = mapped;
      return mapped;
    } catch (e) {
      return [];
    }
  }

  global.AcctventaApiSync = {
    hydrateFromApi,
    loadMessages,
    usingApi,
    patchAcctventaForApi,
  };
})(window);

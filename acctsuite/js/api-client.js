/**
 * AcctSuite API client — talks to /api/index.php (MySQL backend).
 * Falls back gracefully when API is offline so localStorage demo still works.
 */
(function (global) {
  const API_URL = '/api/index.php';
  const TOKEN_KEY = 'acctsuite_api_token';
  const STAFF_TOKEN_KEY = 'acctsuite_staff_token';

  function getToken() {
    try {
      const ls = localStorage.getItem(TOKEN_KEY) || '';
      if (ls) return ls;
    } catch (e) {}
    try {
      const m = document.cookie.match(/(?:^|;\s*)acctsuite_token=([^;]+)/);
      return m ? decodeURIComponent(m[1]) : '';
    } catch (e) {
      return '';
    }
  }

  function setToken(token) {
    try {
      if (token) localStorage.setItem(TOKEN_KEY, token);
      else localStorage.removeItem(TOKEN_KEY);
    } catch (e) {}
  }

  function getStaffToken() {
    try {
      return localStorage.getItem(STAFF_TOKEN_KEY) || '';
    } catch (e) {
      return '';
    }
  }

  function setStaffToken(token) {
    try {
      if (token) localStorage.setItem(STAFF_TOKEN_KEY, token);
      else localStorage.removeItem(STAFF_TOKEN_KEY);
    } catch (e) {}
  }

  async function request(action, { method = 'GET', body, query, asStaff = false } = {}) {
    const url = new URL(API_URL, window.location.origin);
    url.searchParams.set('action', action);
    if (query) {
      Object.entries(query).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
      });
    }
    const opts = {
      method,
      credentials: 'include',
      headers: {},
    };
    const token = asStaff ? getStaffToken() : getToken();
    if (token) {
      opts.headers['Authorization'] = 'Bearer ' + token;
      if (asStaff) opts.headers['X-Staff-Token'] = token;
      else opts.headers['X-Auth-Token'] = token;
    }
    if (body !== undefined) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    const res = await fetch(url.toString(), opts);
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) {
      const err = new Error(data.error || data.message || 'Request failed');
      err.status = res.status;
      err.data = data;
      err.code = data.code || '';
      throw err;
    }
    if (data.token && !asStaff) setToken(data.token);
    return data;
  }

  let available = null;

  async function isAvailable() {
    if (available !== null) return available;
    try {
      const r = await request('health');
      available = !!(r && r.ok && r.installed !== false);
    } catch (_) {
      available = false;
    }
    return available;
  }

  function clearAvailabilityCache() {
    available = null;
  }

  function applySessionUser(user) {
    if (!user) return;
    try {
      localStorage.setItem('isLoggedIn', 'true');
      localStorage.setItem('acctsuite_session', String(user.email || '').toLowerCase());
      localStorage.setItem('userName', user.name || '');
      localStorage.setItem('userEmail', user.email || '');
      localStorage.setItem('userPhone', user.phone || '');
      localStorage.setItem('walletBalance', String(user.balance ?? 0));
      localStorage.setItem('acctsuite_backend', 'api');
    } catch (e) {}
  }

  /** True when the app should talk to the live API (token, or logged-in API session). */
  function hasApiSession() {
    try {
      if (getToken()) return true;
      if (localStorage.getItem('isLoggedIn') === 'true') return true;
      if (localStorage.getItem('acctsuite_backend') === 'api') return true;
    } catch (e) {}
    return false;
  }

  /** Push a fresh wallet balance into every client-side store (localStorage + AcctSuite user). */
  function applyWalletBalance(balance, userExtra) {
    if (balance == null || isNaN(Number(balance))) return;
    const bal = Number(balance);
    try {
      localStorage.setItem('walletBalance', String(bal));
      localStorage.setItem('isLoggedIn', 'true');
      localStorage.setItem('acctsuite_backend', 'api');
    } catch (e) {}
    try {
      const session = (
        localStorage.getItem('acctsuite_session') ||
        localStorage.getItem('userEmail') ||
        (userExtra && userExtra.email) ||
        ''
      ).toLowerCase();
      if (session) {
        const raw = localStorage.getItem('acctsuite_users');
        const users = raw ? JSON.parse(raw) : {};
        if (users[session]) {
          users[session].balance = bal;
          if (userExtra) {
            if (userExtra.withdrawableBalance != null) users[session].withdrawableBalance = userExtra.withdrawableBalance;
            if (userExtra.escrowBalance != null) users[session].escrowBalance = userExtra.escrowBalance;
            if (userExtra.totalDeposits != null) users[session].totalDeposits = userExtra.totalDeposits;
            if (userExtra.totalWithdrawals != null) users[session].totalWithdrawals = userExtra.totalWithdrawals;
          }
          localStorage.setItem('acctsuite_users', JSON.stringify(users));
        }
      }
    } catch (e) {}
    try {
      if (global.AcctSuite && global.AcctSuite.getCurrentUser && global.AcctSuite.persistUser) {
        const cur = global.AcctSuite.getCurrentUser();
        if (cur) {
          cur.balance = bal;
          if (userExtra) {
            if (userExtra.withdrawableBalance != null) cur.withdrawableBalance = userExtra.withdrawableBalance;
            if (userExtra.escrowBalance != null) cur.escrowBalance = userExtra.escrowBalance;
            if (userExtra.totalDeposits != null) cur.totalDeposits = userExtra.totalDeposits;
            if (userExtra.totalWithdrawals != null) cur.totalWithdrawals = userExtra.totalWithdrawals;
          }
          global.AcctSuite.persistUser(cur);
        } else if (userExtra && userExtra.email) {
          global.AcctSuite.persistUser({
            id: userExtra.id,
            name: userExtra.name || '',
            email: userExtra.email,
            phone: userExtra.phone || '',
            balance: bal,
            withdrawableBalance: userExtra.withdrawableBalance,
            escrowBalance: userExtra.escrowBalance,
            totalDeposits: userExtra.totalDeposits,
            totalWithdrawals: userExtra.totalWithdrawals,
            plan: userExtra.plan || 'free',
            referralCode: userExtra.referralCode,
            isVerified: !!userExtra.isVerified,
            ads: [],
            orders: [],
            transactions: [],
            notifications: [],
          });
        }
      }
    } catch (e) {}
    try {
      global.dispatchEvent(new CustomEvent('acctsuite:wallet-updated', { detail: { balance: bal } }));
    } catch (e) {}
  }

  /** After orders.buy or cart.checkout — sync wallet from API response immediately. */
  function applyPurchaseResult(res) {
    if (!res) return;
    const user = res.user || null;
    const balance = res.balance != null ? res.balance : (user && user.balance);
    if (balance == null || isNaN(Number(balance))) return;
    applyWalletBalance(Number(balance), user || undefined);
    if (user) applySessionUser(user);
  }

  const Api = {
    request,
    isAvailable,
    clearAvailabilityCache,
    getToken,
    setToken,
    applySessionUser,
    hasApiSession,
    applyWalletBalance,
    applyPurchaseResult,
    register(payload) {
      return request('auth.register', { method: 'POST', body: payload }).then((data) => {
        if (data.token) setToken(data.token);
        applySessionUser(data.user);
        return data;
      });
    },
    login(payload) {
      return request('auth.login', { method: 'POST', body: payload }).then((data) => {
        if (data.token) setToken(data.token);
        applySessionUser(data.user);
        // Seed local profile without wiping existing orders if hydrate is slow/offline
        try {
          if (global.AcctSuite && data.user && data.user.email) {
            global.AcctSuite.persistUser({
              id: data.user.id,
              name: data.user.name,
              email: data.user.email,
              phone: data.user.phone || '',
              balance: data.user.balance,
              withdrawableBalance: data.user.withdrawableBalance,
              escrowBalance: data.user.escrowBalance,
              totalDeposits: data.user.totalDeposits,
              totalWithdrawals: data.user.totalWithdrawals,
              plan: data.user.plan || 'free',
              referralCode: data.user.referralCode,
              isVerified: !!data.user.isVerified,
              kycStatus: data.user.kycStatus,
              avatarUrl: data.user.avatarUrl || '',
            });
          }
        } catch (e) {}
        return data;
      });
    },
    async logout() {
      try {
        await request('auth.logout', { method: 'POST', body: {} });
      } catch (_) {}
      setToken('');
      try {
        localStorage.removeItem('acctsuite_backend');
      } catch (e) {}
    },
    forgotPassword(payload) {
      return request('auth.forgot', { method: 'POST', body: payload });
    },
    resetPassword(payload) {
      return request('auth.reset', { method: 'POST', body: payload });
    },
    updateProfile(payload) {
      return request('auth.profile', { method: 'POST', body: payload });
    },
    changePassword(payload) {
      return request('auth.changePassword', { method: 'POST', body: payload });
    },
    me() {
      return request('auth.me');
    },
    market(params) {
      return request('market.list', { query: params });
    },
    marketGet(params) {
      return request('market.get', { query: params });
    },
    myAds() {
      return request('ads.mine');
    },
    createAd(payload) {
      return request('ads.create', { method: 'POST', body: payload });
    },
    createOrder(payload) {
      return request('orders.buy', { method: 'POST', body: payload }).then((data) => {
        applyPurchaseResult(data);
        return data;
      });
    },
    myOrders() {
      return request('orders.mine');
    },
    getOrder(orderIdOrTx) {
      const q = {};
      if (orderIdOrTx != null && String(orderIdOrTx).match(/^\d+$/)) q.orderId = Number(orderIdOrTx);
      else if (orderIdOrTx) q.txid = String(orderIdOrTx);
      return request('orders.get', { query: q });
    },
    orderRefund(payload) {
      return request('orders.refund', { method: 'POST', body: payload });
    },
    orderRelease(payload) {
      return request('orders.release', { method: 'POST', body: payload });
    },
    getMessages(orderId) {
      return request('messages.list', { query: { orderId } });
    },
    sendMessage(payload) {
      return request('messages.send', { method: 'POST', body: payload });
    },
    wallet() {
      return request('wallet.summary');
    },
    deposit(payload) {
      return request('wallet.deposit', { method: 'POST', body: payload });
    },
    confirmDeposit(payload) {
      return request('wallet.deposit.confirm', { method: 'POST', body: payload });
    },
    confirmPayment(payload) {
      return request('wallet.deposit.confirm', { method: 'POST', body: payload });
    },
    upgradePlan(payload) {
      return request('plans.upgrade', { method: 'POST', body: payload });
    },
    withdraw(payload) {
      return request('wallet.withdraw', { method: 'POST', body: payload });
    },
    notifications() {
      return request('notifications.list');
    },
    publicConfig() {
      return request('config.public');
    },
    presencePing() {
      return request('presence.ping', { method: 'POST', body: {} });
    },
    staffLogin(payload) {
      return request('staff.login', { method: 'POST', body: payload, asStaff: true }).then((data) => {
        if (data.token) setStaffToken(data.token);
        return data;
      });
    },
    changeAdminPassword(payload) {
      return request('admin.changePassword', { method: 'POST', body: payload });
    },
    getStaffToken,
    setStaffToken,
    supportOpen() {
      return request('support.open', { method: 'POST', body: {} });
    },
    supportMessages(threadId) {
      return request('support.messages', { query: threadId ? { threadId } : {} });
    },
    supportSend(payload) {
      return request('support.send', { method: 'POST', body: payload });
    },
    supportTyping(payload) {
      return request('support.typing', { method: 'POST', body: payload });
    },
    staffSupportThreads() {
      return request('support.threads', { asStaff: true });
    },
    staffSupportMessages(threadId) {
      return request('support.messages', { asStaff: true, query: { threadId } });
    },
    staffSupportSend(payload) {
      return request('support.send', { method: 'POST', body: payload, asStaff: true });
    },
    staffSupportTyping(payload) {
      return request('support.typing', { method: 'POST', body: payload, asStaff: true });
    },
    createReview(payload) {
      return request('reviews.create', { method: 'POST', body: payload });
    },
    sellerReviews(query) {
      return request('reviews.seller', { query });
    },
    reportSeller(payload) {
      return request('reports.create', { method: 'POST', body: payload });
    },
    sellerProfile(query) {
      return request('sellers.profile', { query });
    },
    kycStatus() {
      return request('kyc.status');
    },
    kycSubmit(payload) {
      return request('kyc.submit', { method: 'POST', body: payload });
    },
    staffOrdersSearch(q) {
      return request('staff.orders.search', { asStaff: true, query: { q } });
    },
    staffOrderGet(payload) {
      return request('staff.orders.get', { asStaff: true, query: payload });
    },
    staffOrderRefund(payload) {
      return request('staff.orders.refund', { method: 'POST', body: payload, asStaff: true });
    },
    staffOrderChats() {
      return request('staff.orders.chats', { asStaff: true });
    },
    staffReports() {
      return request('staff.reports', { asStaff: true });
    },
    // -------- Cart --------
    cartList() {
      return request('cart.list');
    },
    cartAdd(payload) {
      return request('cart.add', { method: 'POST', body: payload });
    },
    cartRemove(payload) {
      return request('cart.remove', { method: 'POST', body: payload });
    },
    cartClear() {
      return request('cart.clear', { method: 'POST', body: {} });
    },
    cartCheckout() {
      return request('cart.checkout', { method: 'POST', body: {} }).then((data) => {
        applyPurchaseResult(data);
        return data;
      });
    },
    // -------- Wishlist --------
    wishlistList() {
      return request('wishlist.list');
    },
    wishlistAdd(payload) {
      return request('wishlist.add', { method: 'POST', body: payload });
    },
    wishlistRemove(payload) {
      return request('wishlist.remove', { method: 'POST', body: payload });
    },
    // -------- Disputes --------
    openDispute(payload) {
      return request('disputes.open', { method: 'POST', body: payload });
    },
    myDisputes() {
      return request('disputes.mine');
    },
    getDispute(query) {
      return request('disputes.get', { query });
    },
    staffDisputesList(query) {
      return request('staff.disputes.list', { asStaff: true, query });
    },
    staffDisputeResolve(payload) {
      return request('staff.disputes.resolve', { method: 'POST', body: payload, asStaff: true });
    },
    staffDeductRefund(payload) {
      return request('staff.orders.deduct_refund', { method: 'POST', body: payload, asStaff: true });
    },
    staffWalletPending() {
      return request('staff.wallet.pending', { asStaff: true });
    },
    staffApproveWithdrawal(payload) {
      return request('staff.wallet.approve_withdrawal', { method: 'POST', body: payload, asStaff: true });
    },
    staffRejectWithdrawal(payload) {
      return request('staff.wallet.reject_withdrawal', { method: 'POST', body: payload, asStaff: true });
    },
    banksList(query) {
      return request('banks.list', { query: query || {} });
    },
    // -------- Social proof / storefronts --------
    socialProof() {
      return request('stats.social_proof');
    },
    sellerStorefront(query) {
      return request('sellers.storefront', { query });
    },
    storiesFeed() {
      return request('stories.feed');
    },
    storiesMine() {
      return request('stories.mine');
    },
    storiesBySeller(query) {
      return request('stories.bySeller', { query: query || {} });
    },
    storiesCreate(payload) {
      return request('stories.create', { method: 'POST', body: payload });
    },
    storiesDelete(payload) {
      return request('stories.delete', { method: 'POST', body: payload });
    },
  };

  global.AcctSuiteApi = Api;
})(window);

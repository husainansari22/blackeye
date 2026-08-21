/**
 * Acctventa API client — talks to /api/index.php (MySQL backend).
 * Falls back gracefully when API is offline so localStorage demo still works.
 */
(function (global) {
  const API_URL = '/api/index.php';
  const TOKEN_KEY = 'acctventa_api_token';
  const STAFF_TOKEN_KEY = 'acctventa_staff_token';

  function getToken() {
    try {
      return localStorage.getItem(TOKEN_KEY) || '';
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
      localStorage.setItem('acctventa_session', String(user.email || '').toLowerCase());
      localStorage.setItem('userName', user.name || '');
      localStorage.setItem('userEmail', user.email || '');
      localStorage.setItem('userPhone', user.phone || '');
      localStorage.setItem('walletBalance', String(user.balance ?? 0));
      localStorage.setItem('acctventa_backend', 'api');
    } catch (e) {}
  }

  const Api = {
    request,
    isAvailable,
    clearAvailabilityCache,
    getToken,
    setToken,
    applySessionUser,
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
        return data;
      });
    },
    async logout() {
      try {
        await request('auth.logout', { method: 'POST', body: {} });
      } catch (_) {}
      setToken('');
      try {
        localStorage.removeItem('acctventa_backend');
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
    myAds() {
      return request('ads.mine');
    },
    createAd(payload) {
      return request('ads.create', { method: 'POST', body: payload });
    },
    createOrder(payload) {
      return request('orders.buy', { method: 'POST', body: payload });
    },
    myOrders() {
      return request('orders.mine');
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
      return request('staff.login', { method: 'POST', body: payload }).then((data) => {
        if (data.token) setStaffToken(data.token);
        return data;
      });
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
  };

  global.AcctventaApi = Api;
})(window);

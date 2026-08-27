/**
 * Acctventa core — per-user marketplace data (localStorage).
 * Brand colors stay in CSS. No demo identity data.
 */
(function (global) {
  const USERS_KEY = 'acctventa_users';
  const SESSION_KEY = 'acctventa_session';
  const SETTINGS_KEY = 'acctventa_settings';
  const ADMIN_KEY = 'acctventa_admin';

  const DEFAULT_CONFIG = {
    minDeposit: 3,
    minWithdraw: 5,
    withdrawCommissionRate: 0.1, // platform fee on seller withdrawals (not shown in wallet UI)
    salesCommissionRate: 0.22, // AI sales settlement: deducted from every successful sale
    depositFeeRate: 0,
    freeDailyUploadLimit: 5,
    brandPrimary: '#0ea5e9',
    supportTelegram: 'https://t.me/acctventa',
    supportEmail: 'support@acctventa.com',
    siteName: 'acctventa',
    walletCurrencies: {
      local: [
        { code: 'NGN', name: 'Nigeria', flag: 'ng', rate: 1600, enabled: true },
        { code: 'GHS', name: 'Ghana', flag: 'gh', rate: 15, enabled: true },
        { code: 'KES', name: 'Kenya', flag: 'ke', rate: 130, enabled: true },
        { code: 'ZAR', name: 'South Africa', flag: 'za', rate: 18, enabled: true },
        { code: 'XAF', name: 'Central Africa', flag: 'cm', rate: 600, enabled: true },
        { code: 'XOF', name: 'West Africa', flag: 'sn', rate: 600, enabled: true },
      ],
      crypto: [
        { code: 'USDT', name: 'Tether', networks: ['TRC20', 'BEP20', 'ERC20'], enabled: true },
        { code: 'BTC', name: 'Bitcoin', networks: ['BTC'], enabled: true },
        { code: 'ETH', name: 'Ethereum', networks: ['ERC20'], enabled: true },
        { code: 'USDC', name: 'USD Coin', networks: ['ERC20', 'BEP20'], enabled: true },
        { code: 'BNB', name: 'BNB', networks: ['BEP20'], enabled: true },
        { code: 'TRX', name: 'Tron', networks: ['TRC20'], enabled: true },
        { code: 'LTC', name: 'Litecoin', networks: ['LTC'], enabled: true },
        { code: 'SOL', name: 'Solana', networks: ['SOL'], enabled: true },
      ],
    },
  };

  const DEFAULT_PLANS = {
    free: {
      id: 'free',
      name: 'Free (Default)',
      price: 0,
      dailyUploads: 5,
      approval: 'Standard AI review'
    },
    basic: {
      id: 'basic',
      name: 'Basic',
      price: 9.99,
      dailyUploads: 49,
      approval: 'Basic upload approval'
    },
    business: {
      id: 'business',
      name: 'Business',
      price: 19.99,
      dailyUploads: 99,
      approval: 'Priority upload approval'
    },
    pro: {
      id: 'pro',
      name: 'Pro',
      price: 29.99,
      dailyUploads: 299,
      approval: 'Fast upload approval'
    }
  };

  const DEFAULT_GATEWAYS = {
    deposit: {
      provider: 'none', // none | paystack | flutterwave | stripe | nowpayments
      enabled: false,
      publicKey: '',
      secretKey: '', // WARNING: browser storage is not safe for production secrets
      webhookUrl: '',
      notes: ''
    },
    withdraw: {
      provider: 'none',
      enabled: false,
      publicKey: '',
      secretKey: '',
      webhookUrl: '',
      notes: ''
    }
  };

  let CONFIG = { ...DEFAULT_CONFIG };
  let PLANS = JSON.parse(JSON.stringify(DEFAULT_PLANS));
  let GATEWAYS = JSON.parse(JSON.stringify(DEFAULT_GATEWAYS));

  function getSettings() {
    try {
      return JSON.parse(safeGet(SETTINGS_KEY) || '{}');
    } catch (e) {
      return {};
    }
  }

  function safeGet(key) {
    try {
      return localStorage.getItem(key);
    } catch (e) {
      return null;
    }
  }

  function safeSet(key, value) {
    try {
      localStorage.setItem(key, value);
      return true;
    } catch (e) {
      return false;
    }
  }

  function applySettings(settings) {
    const s = settings || getSettings();
    CONFIG = { ...DEFAULT_CONFIG, ...(s.config || {}) };
    PLANS = JSON.parse(JSON.stringify(DEFAULT_PLANS));
    if (s.plans) {
      Object.keys(s.plans).forEach((id) => {
        if (PLANS[id]) PLANS[id] = { ...PLANS[id], ...s.plans[id], id };
      });
    }
    // keep free daily limit aligned with free plan
    if (PLANS.free && PLANS.free.dailyUploads != null) {
      CONFIG.freeDailyUploadLimit = Number(PLANS.free.dailyUploads) || CONFIG.freeDailyUploadLimit;
    }
    GATEWAYS = {
      deposit: { ...DEFAULT_GATEWAYS.deposit, ...((s.gateways && s.gateways.deposit) || {}) },
      withdraw: { ...DEFAULT_GATEWAYS.withdraw, ...((s.gateways && s.gateways.withdraw) || {}) }
    };
    // expose live objects
    if (global.Acctventa) {
      global.Acctventa.CONFIG = CONFIG;
      global.Acctventa.PLANS = PLANS;
      global.Acctventa.GATEWAYS = GATEWAYS;
    }
    return { CONFIG, PLANS, GATEWAYS };
  }

  function saveSettings(partial) {
    const current = getSettings();
    const next = {
      config: { ...(current.config || {}), ...((partial && partial.config) || {}) },
      plans: { ...(current.plans || {}), ...((partial && partial.plans) || {}) },
      gateways: {
        deposit: {
          ...DEFAULT_GATEWAYS.deposit,
          ...((current.gateways && current.gateways.deposit) || {}),
          ...((partial && partial.gateways && partial.gateways.deposit) || {})
        },
        withdraw: {
          ...DEFAULT_GATEWAYS.withdraw,
          ...((current.gateways && current.gateways.withdraw) || {}),
          ...((partial && partial.gateways && partial.gateways.withdraw) || {})
        }
      },
      updatedAt: new Date().toISOString()
    };
    // deep-merge plan objects properly
    if (partial && partial.plans) {
      next.plans = { ...(current.plans || {}) };
      Object.keys(partial.plans).forEach((id) => {
        next.plans[id] = { ...((current.plans && current.plans[id]) || {}), ...partial.plans[id] };
      });
    }
    safeSet(SETTINGS_KEY, JSON.stringify(next));
    applySettings(next);
    return next;
  }

  function getAdminRecord() {
    try {
      return JSON.parse(safeGet(ADMIN_KEY) || 'null');
    } catch (e) {
      return null;
    }
  }

  function saveAdminRecord(rec) {
    safeSet(ADMIN_KEY, JSON.stringify(rec));
  }

  /** First-time setup: default password admin123 — change immediately in Admin */
  function ensureAdminInitialized() {
    let admin = getAdminRecord();
    if (!admin) {
      admin = {
        username: 'admin',
        password: 'admin123',
        createdAt: new Date().toISOString(),
        mustChangePassword: true
      };
      saveAdminRecord(admin);
    }
    return admin;
  }

  function adminLogin(username, password) {
    const admin = ensureAdminInitialized();
    if (String(username || '').trim() !== admin.username || String(password || '') !== admin.password) {
      return { ok: false, error: 'Invalid admin username or password.' };
    }
    try {
      sessionStorage.setItem('acctventa_admin_session', JSON.stringify({ at: Date.now(), user: admin.username }));
    } catch (e) {
      // still allow login for this page session
      global.__acctventaAdminOk = true;
    }
    return { ok: true, admin: { username: admin.username, mustChangePassword: !!admin.mustChangePassword } };
  }

  function adminLogout() {
    try {
      sessionStorage.removeItem('acctventa_admin_session');
    } catch (e) {}
    global.__acctventaAdminOk = false;
  }

  function isAdminLoggedIn() {
    if (global.__acctventaAdminOk) return true;
    try {
      const s = JSON.parse(sessionStorage.getItem('acctventa_admin_session') || 'null');
      return !!(s && s.user);
    } catch (e) {
      return false;
    }
  }

  function changeAdminPassword(currentPass, newPass) {
    const admin = ensureAdminInitialized();
    if (currentPass !== admin.password) return { ok: false, error: 'Current password is wrong.' };
    if (!newPass || String(newPass).length < 6) return { ok: false, error: 'New password must be at least 6 characters.' };
    admin.password = String(newPass);
    admin.mustChangePassword = false;
    admin.passwordChangedAt = new Date().toISOString();
    saveAdminRecord(admin);
    return { ok: true };
  }

  function setAdminPasswordLocal(newPass) {
    if (!newPass || String(newPass).length < 6) return { ok: false, error: 'New password must be at least 6 characters.' };
    const admin = ensureAdminInitialized();
    admin.password = String(newPass);
    admin.mustChangePassword = false;
    admin.passwordChangedAt = new Date().toISOString();
    saveAdminRecord(admin);
    return { ok: true };
  }

  // Do NOT init storage yet — export API first so login never breaks if storage is blocked
  // (boot continues after Acctventa is assigned below)

  const CATEGORY_LINK_RULES = {
    'Social Media': ['facebook.com', 'fb.com', 'fb.me', 'instagram.com', 'tiktok.com', 'twitter.com', 'x.com', 'linkedin.com', 'snapchat.com', 'pinterest.com', 'threads.net'],
    Facebook: ['facebook.com', 'fb.com', 'fb.me'],
    Instagram: ['instagram.com'],
    TikTok: ['tiktok.com'],
    Twitter: ['twitter.com', 'x.com'],
    'Emails & Messaging': ['gmail.com', 'mail.google.com', 'outlook.com', 'hotmail.com', 'yahoo.com', 'proton.me', 'telegram.org', 't.me', 'whatsapp.com', 'wa.me'],
    Gmail: ['gmail.com', 'mail.google.com'],
    Telegram: ['t.me', 'telegram.org'],
    WhatsApp: ['wa.me', 'whatsapp.com'],
    'VPN & Proxies': ['expressvpn.com', 'nordvpn.com', 'surfshark.com', 'protonvpn.com', 'pia.com', 'privateinternetaccess.com'],
    Giftcards: [],
    Gaming: ['steamcommunity.com', 'xbox.com', 'playstation.com', 'epicgames.com'],
    Subscription: ['netflix.com', 'spotify.com', 'disneyplus.com', 'youtube.com']
  };

  function getUsers() {
    try {
      return JSON.parse(safeGet(USERS_KEY) || '{}');
    } catch (e) {
      return {};
    }
  }

  function saveUsers(users) {
    safeSet(USERS_KEY, JSON.stringify(users));
  }

  function todayKey() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function normalizeUser(user) {
    if (!user) return null;
    user.balance = Number(user.balance) || 0;
    user.withdrawableBalance = Number(user.withdrawableBalance) || 0;
    user.escrowBalance = Number(user.escrowBalance) || 0;
    user.totalDeposits = Number(user.totalDeposits) || 0;
    user.totalWithdrawals = Number(user.totalWithdrawals) || 0;
    user.orders = Array.isArray(user.orders) ? user.orders : [];
    user.ads = Array.isArray(user.ads) ? user.ads : [];
    user.notifications = Array.isArray(user.notifications) ? user.notifications : [];
    user.transactions = Array.isArray(user.transactions) ? user.transactions : [];
    user.messages = user.messages && typeof user.messages === 'object' ? user.messages : {};
    user.plan = user.plan && PLANS[user.plan] ? user.plan : 'free';
    user.uploadsByDay = user.uploadsByDay && typeof user.uploadsByDay === 'object' ? user.uploadsByDay : {};
    user.countryCode = user.countryCode || '';
    user.payoutBank = user.payoutBank || '';
    user.payoutAccount = user.payoutAccount || '';
    user.payoutAccountName = user.payoutAccountName || '';
    user.payoutCurrency = user.payoutCurrency || '';
    user.payoutBankLocked = !!user.payoutBankLocked;
    user.avatarUrl = user.avatarUrl || user.avatar || '';
    if (!isValidReferralCode(user.referralCode)) {
      user.referralCode = randomReferralCode();
    }
    return user;
  }

  function getSessionEmail() {
    return (safeGet(SESSION_KEY) || safeGet('userEmail') || '').toLowerCase();
  }

  function getCurrentUser() {
    if (safeGet('isLoggedIn') !== 'true') return null;
    const email = getSessionEmail();
    const users = getUsers();
    const raw = users[email];
    if (!raw) return null;
    const prevCode = String(raw.referralCode || '');
    const user = normalizeUser(raw);
    if (user && user.referralCode && user.referralCode !== prevCode) {
      users[email] = user;
      saveUsers(users);
    }
    return user || null;
  }

  function persistUser(user) {
    if (!user || !user.email) return;
    const users = getUsers();
    const key = user.email.toLowerCase();
    const prev = users[key] || {};
    // Drop undefined keys so partial updates (e.g. KYC) cannot wipe orders/ads/history
    const incoming = Object.assign({}, user);
    ['orders', 'ads', 'notifications', 'transactions', 'messages', 'uploadsByDay'].forEach((k) => {
      if (incoming[k] === undefined) delete incoming[k];
    });
    users[key] = normalizeUser({ ...prev, ...incoming, password: incoming.password || prev.password || '' });
    saveUsers(users);
    safeSet('userName', users[key].name);
    safeSet('userEmail', users[key].email);
    safeSet('userPhone', users[key].phone || '');
    safeSet('walletBalance', String(users[key].balance || 0));
    safeSet(SESSION_KEY, key);
  }

  function formatMoney(n) {
    const v = Number(n) || 0;
    if (v < 0) return '-$' + Math.abs(v).toFixed(2);
    return '$' + v.toFixed(2);
  }

  function getInitials(name) {
    const parts = String(name || '')
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (!parts.length) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  function getPlan(user) {
    return PLANS[(user && user.plan) || 'free'] || PLANS.free;
  }

  function getUploadsToday(user) {
    if (!user) return 0;
    return Number((user.uploadsByDay || {})[todayKey()] || 0);
  }

  function getRemainingUploads(user) {
    const plan = getPlan(user);
    return Math.max(0, plan.dailyUploads - getUploadsToday(user));
  }

  function canUploadToday(user) {
    return getRemainingUploads(user) > 0;
  }

  function bumpUploadCount(user) {
    const key = todayKey();
    user.uploadsByDay = user.uploadsByDay || {};
    user.uploadsByDay[key] = (Number(user.uploadsByDay[key]) || 0) + 1;
  }

  function isValidHttpUrl(str) {
    try {
      const u = new URL(str);
      return u.protocol === 'http:' || u.protocol === 'https:';
    } catch (e) {
      return false;
    }
  }

  function linkMatchesAllowed(link, allowedHosts) {
    if (!allowedHosts || !allowedHosts.length) return true;
    try {
      const host = new URL(link).hostname.replace(/^www\./, '').toLowerCase();
      return allowedHosts.some((d) => host === d || host.endsWith('.' + d));
    } catch (e) {
      return false;
    }
  }

  function allowedHostsForCategory(category) {
    const cat = String(category || '');
    if (CATEGORY_LINK_RULES[cat]) return CATEGORY_LINK_RULES[cat];
    if (window.AcctventaCatalog) {
      const hit = window.AcctventaCatalog.findProduct(cat);
      if (hit && hit.domain) return [hit.domain];
      const group = (window.AcctventaCatalog.GROUPS || []).find((g) => g.name === cat || g.id === cat);
      if (group) return group.products.map((p) => p.domain).filter(Boolean);
    }
    const lower = cat.toLowerCase();
    for (const key of Object.keys(CATEGORY_LINK_RULES)) {
      if (lower.includes(key.toLowerCase())) return CATEGORY_LINK_RULES[key];
    }
    return CATEGORY_LINK_RULES['Social Media'];
  }

  /**
   * AI listing review — auto approve/deny based on credentials + preview link quality.
   * Listings start as "pending" (under review), then become "active" or "denied".
   */
  function aiReviewListing(listing) {
    const reasons = [];
    const username = String(listing.username || '').trim();
    const password = String(listing.password || '').trim();
    const preview = String(listing.previewLink || '').trim();
    const title = String(listing.title || '').trim();
    const price = Number(listing.price);

    if (!title) reasons.push('Missing account title');
    if (!price || price <= 0) reasons.push('Invalid price');
    if (!username) reasons.push('Missing account username');
    if (!password || password.length < 3) reasons.push('Missing or weak account password');

    const allowed = allowedHostsForCategory(listing.category || listing.platform);
    const needsPublicLink = allowed && allowed.length > 0;

    if (needsPublicLink) {
      if (!preview) {
        reasons.push('Preview link is required for this account type so buyers can verify before buying');
      } else if (!isValidHttpUrl(preview)) {
        reasons.push('Preview link is not a valid URL');
      } else if (!linkMatchesAllowed(preview, allowed)) {
        reasons.push('Preview link does not match the selected account category — incorrect or fake link');
      }
    } else if (preview && !isValidHttpUrl(preview)) {
      reasons.push('Preview link is not a valid URL');
    }

    // Obvious junk / placeholder rejection
    const junk = ['test', 'asdf', 'xxx', 'fake', 'example.com', 'localhost'];
    const blob = (username + ' ' + password + ' ' + preview + ' ' + title).toLowerCase();
    if (junk.some((j) => blob.includes(j) && j.length > 3 && preview.toLowerCase().includes(j))) {
      // only hard-fail obvious example.com style links
    }
    if (/example\.com|localhost|127\.0\.0\.1/i.test(preview)) {
      reasons.push('Preview link looks like a placeholder, not a real account link');
    }

    if (reasons.length) {
      return {
        status: 'denied',
        reason: reasons.join('. ') + '.',
        reviewedAt: new Date().toISOString(),
        reviewedBy: 'AI Review'
      };
    }

    return {
      status: 'active',
      reason: '',
      reviewedAt: new Date().toISOString(),
      reviewedBy: 'AI Review'
    };
  }

  function runAiReviewOnAd(user, adId) {
    const ad = (user.ads || []).find((a) => a.id === adId);
    if (!ad) return null;
    const result = aiReviewListing(ad);
    ad.status = result.status;
    ad.denyReason = result.reason || '';
    ad.reviewedAt = result.reviewedAt;
    ad.reviewedBy = result.reviewedBy;
    persistUser(user);
    pushNotification(user, {
      title: result.status === 'active' ? 'Ad Approved' : 'Ad Denied',
      body:
        result.status === 'active'
          ? `Your listing "${ad.title}" was approved and is now live.`
          : `Your listing "${ad.title}" was not approved. ${result.reason}`,
      type: 'ad_review'
    });
    return ad;
  }

  function pushNotification(user, note) {
    user.notifications = user.notifications || [];
    user.notifications.unshift({
      id: uid(),
      title: note.title,
      body: note.body,
      type: note.type || 'info',
      createdAt: new Date().toISOString(),
      read: false
    });
  }

  function randomReferralCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
    for (let attempt = 0; attempt < 40; attempt++) {
      let code = '';
      for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)];
      if (!/[A-Za-z]/.test(code) || !/[0-9]/.test(code)) continue;
      const users = getUsers();
      const taken = Object.keys(users).some((k) => String(users[k].referralCode || '') === code);
      if (!taken) return code;
    }
    return ('x' + Date.now().toString(36)).slice(-5);
  }

  function isValidReferralCode(code) {
    return /^(?=.*[A-Za-z])(?=.*[0-9])[A-Za-z0-9]{5}$/.test(String(code || '').trim());
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  /** Public TXID: 4a36412c-0c41-455a-b87d */
  function uuidTxid() {
    const bytes = new Uint8Array(10);
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(bytes);
    else for (let i = 0; i < 10; i++) bytes[i] = Math.floor(Math.random() * 256);
    const h = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20);
  }

  /** All approved marketplace listings across users */
  function getMarketplaceListings() {
    const users = getUsers();
    const list = [];
    Object.keys(users).forEach((email) => {
      const u = normalizeUser(users[email]);
      (u.ads || []).forEach((ad) => {
        if (ad.status === 'active') {
          list.push({
            ...ad,
            sellerEmail: u.email,
            sellerName: u.name,
            sellerInitials: getInitials(u.name)
          });
        }
      });
    });
    list.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    return list;
  }

  function findListingById(id) {
    return getMarketplaceListings().find((a) => a.id === id) || null;
  }

  function findUserByEmail(email) {
    const users = getUsers();
    return normalizeUser(users[String(email || '').toLowerCase()]);
  }

  function createAd(user, draft) {
    // Never write ads only to localStorage when the user is on the live API
    try {
      if (
        global.AcctventaApi &&
        (global.AcctventaApi.getToken() ||
          (global.AcctventaApiSync && global.AcctventaApiSync.usingApi()))
      ) {
        if (global.AcctventaApiSync && typeof global.AcctventaApiSync.patchAcctventaForApi === 'function') {
          global.AcctventaApiSync.patchAcctventaForApi();
        }
        if (global.Acctventa && global.Acctventa.__apiPatched && global.Acctventa.createAd !== createAd) {
          return global.Acctventa.createAd(user, draft);
        }
        return {
          ok: false,
          error: 'Still connecting to the server. Wait a moment and try again, or refresh the page.',
        };
      }
    } catch (e) {}
    if (!canUploadToday(user)) {
      return { ok: false, error: 'Daily upload limit reached. Upgrade your plan to upload more today.' };
    }
    const ad = {
      id: uid(),
      category: draft.category,
      platform: draft.platform || draft.category,
      title: draft.title,
      description: draft.description || '',
      price: Number(draft.price),
      releaseType: draft.releaseType || 'auto',
      username: draft.username,
      password: draft.password,
      previewLink: draft.previewLink || '',
      attachedEmail: draft.attachedEmail || '',
      attachedEmailPassword: draft.attachedEmailPassword || '',
      twoFA: draft.twoFA || '',
      extraInfo: draft.extraInfo || '',
      status: 'pending',
      denyReason: '',
      stock: 1,
      createdAt: new Date().toISOString()
    };
    bumpUploadCount(user);
    user.ads = user.ads || [];
    user.ads.unshift(ad);
    persistUser(user);

    // AI review shortly after submit (under review → active/denied)
    setTimeout(() => {
      const fresh = getCurrentUser();
      if (fresh) runAiReviewOnAd(fresh, ad.id);
      if (typeof global.AcctventaUI !== 'undefined' && global.AcctventaUI.onAdsUpdated) {
        global.AcctventaUI.onAdsUpdated();
      }
    }, 1200);

    return { ok: true, ad };
  }

  function purchaseListing(buyer, listingId) {
    const listing = findListingById(listingId);
    if (!listing) return { ok: false, error: 'Listing not found or no longer available.' };
    if (listing.sellerEmail === buyer.email) return { ok: false, error: 'You cannot buy your own listing.' };
    const price = Number(listing.price);
    if ((buyer.balance || 0) < price) return { ok: false, error: 'Insufficient balance. Minimum deposit is $' + CONFIG.minDeposit + '.' };

    const seller = findUserByEmail(listing.sellerEmail);
    if (!seller) return { ok: false, error: 'Seller account not found.' };

    const prevBal = Number(buyer.balance || 0);
    const buyerWd = Number(buyer.withdrawableBalance || 0);
    buyer.balance = Number((prevBal - price).toFixed(2));
    const depositPortion = Math.max(0, prevBal - buyerWd);
    const fromDeposit = Math.min(price, depositPortion);
    const fromWd = Number((price - fromDeposit).toFixed(2));
    buyer.withdrawableBalance = Number(Math.max(0, buyerWd - fromWd).toFixed(2));
    // Escrow: seller funds locked until complete (auto-complete for auto release)
    const orderTx = uuidTxid();
    const order = {
      id: uid(),
      publicId: orderTx,
      txid: orderTx,
      listingId: listing.id,
      title: listing.title,
      price,
      category: listing.category,
      buyerEmail: buyer.email,
      buyerName: buyer.name,
      sellerEmail: seller.email,
      sellerName: seller.name,
      status: listing.releaseType === 'manual' ? 'pending' : 'completed',
      credentials: {
        username: listing.username,
        password: listing.password,
        previewLink: listing.previewLink,
        attachedEmail: listing.attachedEmail,
        attachedEmailPassword: listing.attachedEmailPassword,
        twoFA: listing.twoFA,
        extraInfo: listing.extraInfo
      },
      createdAt: new Date().toISOString()
    };

    if (order.status === 'completed') {
      const rate = Number(CONFIG.salesCommissionRate != null ? CONFIG.salesCommissionRate : 0.22);
      const commission = Number((price * rate).toFixed(2));
      const net = Number((price - commission).toFixed(2));
      order.platformFee = commission;
      order.sellerNet = net;
      const sellerBal = Number(seller.balance || 0);
      let wdAdd = net;
      if (sellerBal < 0) {
        wdAdd = Math.max(0, Number((net - Math.abs(sellerBal)).toFixed(2)));
      }
      seller.balance = Number((sellerBal + net).toFixed(2));
      seller.withdrawableBalance = Number(((seller.withdrawableBalance || 0) + wdAdd).toFixed(2));
      order.completedAt = new Date().toISOString();
      seller.transactions = seller.transactions || [];
      seller.transactions.unshift({
        id: uid(),
        reference: uuidTxid(),
        type: 'sale',
        amount: net,
        status: 'completed',
        note: 'Sold · AI settlement net after ' + Math.round(rate * 100) + '% fee',
        createdAt: new Date().toISOString(),
      });
      if (commission > 0) {
        seller.transactions.unshift({
          id: uid(),
          reference: uuidTxid(),
          type: 'commission',
          amount: commission,
          status: 'completed',
          note: 'Platform sales commission',
          createdAt: new Date().toISOString(),
        });
      }
    } else {
      seller.escrowBalance = Number(((seller.escrowBalance || 0) + price).toFixed(2));
    }

    buyer.orders = buyer.orders || [];
    seller.orders = seller.orders || [];
    buyer.orders.unshift({ ...order, role: 'buyer' });
    seller.orders.unshift({ ...order, role: 'seller' });

    // Reduce stock / remove listing if sold out
    const sellerAd = (seller.ads || []).find((a) => a.id === listing.id);
    if (sellerAd) {
      sellerAd.stock = Math.max(0, (sellerAd.stock || 1) - 1);
      if (sellerAd.stock <= 0) sellerAd.status = 'removed';
    }

    pushNotification(buyer, {
      title: 'Order placed',
      body: `You purchased "${listing.title}" for ${formatMoney(price)}.`,
      type: 'order'
    });
    pushNotification(seller, {
      title: 'New sale',
      body: `${buyer.name} purchased "${listing.title}".`,
      type: 'order'
    });

    persistUser(buyer);
    persistUser(seller);
    return { ok: true, order };
  }

  function refundOrder(seller, orderId) {
    const sOrder = (seller.orders || []).find((o) => o.id === orderId && o.role === 'seller');
    if (!sOrder) return { ok: false, error: 'Order not found.' };
    if (sOrder.status === 'cancelled') return { ok: false, error: 'Order already cancelled.' };

    const buyer = findUserByEmail(sOrder.buyerEmail);
    if (!buyer) return { ok: false, error: 'Buyer not found.' };

    const price = Number(sOrder.price);
    if (sOrder.status === 'pending') {
      seller.escrowBalance = Math.max(0, Number(((seller.escrowBalance || 0) - price).toFixed(2)));
    } else if (sOrder.status === 'completed') {
      const rate = Number(CONFIG.salesCommissionRate != null ? CONFIG.salesCommissionRate : 0.22);
      const sellerDebit = sOrder.sellerNet != null ? Number(sOrder.sellerNet) : Number((price - Number((price * rate).toFixed(2))).toFixed(2));
      seller.balance = Number(((seller.balance || 0) - sellerDebit).toFixed(2));
      seller.withdrawableBalance = Number(Math.max(0, (seller.withdrawableBalance || 0) - sellerDebit).toFixed(2));
    }

    buyer.balance = Number(((buyer.balance || 0) + price).toFixed(2));
    sOrder.status = 'cancelled';
    sOrder.refundedAt = new Date().toISOString();

    const bOrder = (buyer.orders || []).find((o) => o.id === orderId);
    if (bOrder) {
      bOrder.status = 'cancelled';
      bOrder.refundedAt = sOrder.refundedAt;
    }

    pushNotification(buyer, {
      title: 'Refund received',
      body: `Order "${sOrder.title}" was refunded (${formatMoney(price)}).`,
      type: 'refund'
    });
    persistUser(seller);
    persistUser(buyer);
    return { ok: true };
  }

  function completeManualOrder(seller, orderId) {
    const sOrder = (seller.orders || []).find((o) => o.id === orderId && o.role === 'seller');
    if (!sOrder || sOrder.status !== 'pending') return { ok: false, error: 'Order not pending.' };
    const price = Number(sOrder.price);
    const rate = Number(CONFIG.salesCommissionRate != null ? CONFIG.salesCommissionRate : 0.22);
    const commission = Number((price * rate).toFixed(2));
    const net = Number((price - commission).toFixed(2));
    seller.escrowBalance = Math.max(0, Number(((seller.escrowBalance || 0) - price).toFixed(2)));
    const sellerBal = Number(seller.balance || 0);
    let wdAdd = net;
    if (sellerBal < 0) {
      wdAdd = Math.max(0, Number((net - Math.abs(sellerBal)).toFixed(2)));
    }
    seller.balance = Number((sellerBal + net).toFixed(2));
    seller.withdrawableBalance = Number(((seller.withdrawableBalance || 0) + wdAdd).toFixed(2));
    sOrder.platformFee = commission;
    sOrder.sellerNet = net;
    sOrder.status = 'completed';
    sOrder.completedAt = new Date().toISOString();
    const buyer = findUserByEmail(sOrder.buyerEmail);
    if (buyer) {
      const bOrder = (buyer.orders || []).find((o) => o.id === orderId);
      if (bOrder) {
        bOrder.status = 'completed';
        bOrder.completedAt = sOrder.completedAt;
      }
      persistUser(buyer);
    }
    persistUser(seller);
    return { ok: true };
  }

  function getThreadKey(orderId) {
    return 'order_' + orderId;
  }

  function getMessages(orderId) {
    // messages stored on both users under messages[thread]; merge from either
    const users = getUsers();
    const all = [];
    Object.keys(users).forEach((email) => {
      const u = users[email];
      const thread = (u.messages || {})[getThreadKey(orderId)] || [];
      thread.forEach((m) => all.push(m));
    });
    // dedupe by id
    const map = {};
    all.forEach((m) => {
      map[m.id] = m;
    });
    return Object.values(map).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  }

  function sendMessage(fromUser, orderId, text) {
    const msg = {
      id: uid(),
      orderId,
      fromEmail: fromUser.email,
      fromName: fromUser.name,
      text: String(text || '').trim(),
      createdAt: new Date().toISOString()
    };
    if (!msg.text) return { ok: false, error: 'Empty message' };
    fromUser.messages = fromUser.messages || {};
    const key = getThreadKey(orderId);
    fromUser.messages[key] = fromUser.messages[key] || [];
    fromUser.messages[key].push(msg);
    persistUser(fromUser);

    // notify counterparty
    const order = (fromUser.orders || []).find((o) => o.id === orderId);
    if (order) {
      const otherEmail = order.role === 'buyer' ? order.sellerEmail : order.buyerEmail;
      const other = findUserByEmail(otherEmail);
      if (other) {
        other.messages = other.messages || {};
        other.messages[key] = other.messages[key] || [];
        // keep a copy so both can read
        if (!other.messages[key].some((m) => m.id === msg.id)) other.messages[key].push(msg);
        pushNotification(other, {
          title: 'New message',
          body: `${fromUser.name}: ${msg.text.slice(0, 80)}`,
          type: 'message'
        });
        persistUser(other);
      }
    }
    return { ok: true, msg };
  }

  function deposit(user, amount) {
    amount = Number(amount);
    if (!amount || amount < CONFIG.minDeposit) {
      return { ok: false, error: 'Minimum deposit is $' + CONFIG.minDeposit.toFixed(2) + '.' };
    }
    const fee = Number((amount * CONFIG.depositFeeRate).toFixed(2));
    const credited = Number((amount - fee).toFixed(2));
    user.balance = Number(((user.balance || 0) + credited).toFixed(2));
    user.totalDeposits = Number(((user.totalDeposits || 0) + credited).toFixed(2));
    user.transactions = user.transactions || [];
    user.transactions.unshift({
      id: uid(),
      reference: uuidTxid(),
      type: 'deposit',
      amount: credited,
      fee,
      status: 'completed',
      note: 'Deposit (payment gateway pending integration)',
      createdAt: new Date().toISOString()
    });
    persistUser(user);
    return { ok: true, credited };
  }

  function withdraw(user, amount, method, extra) {
    amount = Number(amount);
    if (!amount || amount < CONFIG.minWithdraw) {
      return { ok: false, error: 'Minimum withdrawal is $' + CONFIG.minWithdraw.toFixed(2) + '.' };
    }
    const feeFromAmount = Number((amount * CONFIG.withdrawCommissionRate).toFixed(2));
    const payout = Number((amount - feeFromAmount).toFixed(2));
    const wd = Number(user.withdrawableBalance || 0);
    if (wd < amount) {
      return { ok: false, error: 'Insufficient withdrawable balance. Only sales and referral earnings can be withdrawn.' };
    }
    if ((user.balance || 0) < amount) {
      return { ok: false, error: 'Insufficient available balance.' };
    }
    extra = extra || {};
    let destination = String(extra.destination || '').trim();
    let accountName = String(extra.accountName || '').trim();
    let bankName = String(extra.bankName || '').trim();
    const currency = String(extra.currency || user.payoutCurrency || 'NGN').toUpperCase();
    const isBank = (method || 'bank') === 'bank';
    if (isBank && user.payoutBankLocked) {
      destination = user.payoutAccount || destination;
      accountName = user.payoutAccountName || accountName;
      bankName = user.payoutBank || bankName;
    }
    if (!destination) {
      return { ok: false, error: isBank ? 'Enter account number' : 'Enter wallet address' };
    }
    if (isBank && !user.payoutBankLocked) {
      user.payoutBank = bankName;
      user.payoutAccount = destination;
      user.payoutAccountName = accountName;
      user.payoutCurrency = currency;
    }
    user.balance = Number(((user.balance || 0) - amount).toFixed(2));
    user.withdrawableBalance = Number(Math.max(0, (user.withdrawableBalance || 0) - amount).toFixed(2));
    user.totalWithdrawals = Number(((user.totalWithdrawals || 0) + amount).toFixed(2));
    user.transactions = user.transactions || [];
    user.transactions.unshift({
      id: uid(),
      reference: uuidTxid(),
      type: 'withdrawal',
      amount,
      fee: feeFromAmount,
      payout,
      method: method || 'bank',
      status: 'pending',
      note: 'Withdrawal requested — pending approval.',
      createdAt: new Date().toISOString()
    });
    persistUser(user);
    return { ok: true, payout, fee: feeFromAmount, message: 'Withdrawal submitted. Pending approval.' };
  }

  function setPlan(user, planId, opts) {
    if (!PLANS[planId]) return { ok: false, error: 'Unknown plan' };
    const plan = PLANS[planId];
    const price = Number(plan.price) || 0;
    const method = (opts && opts.method) || (price > 0 ? 'wallet' : 'free');

    // Prefer live API whenever a token exists (Flutterwave checkout needs the server).
    try {
      const Api = global.AcctventaApi;
      if (Api && typeof Api.getToken === 'function' && Api.getToken() && typeof Api.upgradePlan === 'function') {
        return Api.upgradePlan({ planId: String(planId), method: method === 'free' ? 'wallet' : method }).then(function (res) {
          if (res && res.paymentLink) {
            global.location.href = res.paymentLink;
            return { ok: true, checkout: true, paymentLink: res.paymentLink };
          }
          if (global.AcctventaApiSync && typeof global.AcctventaApiSync.hydrateFromApi === 'function') {
            return global.AcctventaApiSync.hydrateFromApi().then(function () {
              return {
                ok: true,
                plan: res.plan || planId,
                dailyUploads: res.dailyUploads != null ? res.dailyUploads : plan.dailyUploads,
                message: res.message || 'Plan updated to ' + plan.name,
              };
            });
          }
          return {
            ok: true,
            plan: res.plan || planId,
            dailyUploads: res.dailyUploads != null ? res.dailyUploads : plan.dailyUploads,
            message: res.message || 'Plan updated to ' + plan.name,
          };
        }).catch(function (e) {
          return { ok: false, error: (e && e.message) || 'Plan upgrade failed', code: (e && e.code) || '' };
        });
      }
    } catch (e) {}

    if (price > 0 && method === 'wallet') {
      if ((user.balance || 0) < price) {
        return { ok: false, error: 'Insufficient funds. Please deposit money into your wallet.', code: 'insufficient_funds' };
      }
      const prevBal = Number(user.balance || 0);
      const buyerWd = Number(user.withdrawableBalance || 0);
      user.balance = Number((prevBal - price).toFixed(2));
      const depositPortion = Math.max(0, prevBal - buyerWd);
      const fromDeposit = Math.min(price, depositPortion);
      const fromWd = Number((price - fromDeposit).toFixed(2));
      user.withdrawableBalance = Number(Math.max(0, buyerWd - fromWd).toFixed(2));
      user.transactions = user.transactions || [];
      user.transactions.unshift({
        id: uid(),
        reference: uuidTxid(),
        type: 'plan',
        amount: price,
        status: 'completed',
        note: 'Plan upgrade · ' + planId,
        createdAt: new Date().toISOString(),
      });
    } else if (price > 0 && method === 'flutterwave') {
      return { ok: false, error: 'Please log in again to enable live Flutterwave checkout.', code: 'api_required' };
    }
    user.plan = planId;
    persistUser(user);
    return { ok: true, plan: planId, dailyUploads: plan.dailyUploads, message: 'Plan updated to ' + plan.name };
  }

  function listAllUsersSummary() {
    const users = getUsers();
    return Object.keys(users).map((email) => {
      const u = normalizeUser(users[email]);
      return {
        email: u.email,
        name: u.name,
        phone: u.phone || '',
        balance: u.balance || 0,
        plan: u.plan || 'free',
        ads: (u.ads || []).length,
        orders: (u.orders || []).length,
        pendingAds: (u.ads || []).filter((a) => a.status === 'pending').length,
        createdAt: u.createdAt || ''
      };
    });
  }

  function adminSetAdStatus(sellerEmail, adId, status, reason) {
    const user = findUserByEmail(sellerEmail);
    if (!user) return { ok: false, error: 'User not found' };
    const ad = (user.ads || []).find((a) => a.id === adId);
    if (!ad) return { ok: false, error: 'Ad not found' };
    ad.status = status;
    ad.denyReason = reason || '';
    ad.reviewedAt = new Date().toISOString();
    ad.reviewedBy = 'Admin';
    pushNotification(user, {
      title: status === 'active' ? 'Ad Approved by Admin' : status === 'denied' ? 'Ad Denied by Admin' : 'Ad updated',
      body: status === 'denied' ? reason || 'Your listing was denied.' : `Your listing "${ad.title}" is now ${status}.`,
      type: 'ad_review'
    });
    persistUser(user);
    return { ok: true, ad };
  }

  function listPendingWithdrawals() {
    const users = getUsers();
    const list = [];
    Object.keys(users).forEach((email) => {
      const u = normalizeUser(users[email]);
      (u.transactions || []).forEach((t) => {
        if (String(t.type).toLowerCase() === 'withdrawal' && String(t.status).toLowerCase() === 'pending') {
          list.push({ ...t, userEmail: u.email, userName: u.name });
        }
      });
    });
    return list.sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
  }

  function adminSetTxStatus(userEmail, txId, status, noteEdit) {
    const user = findUserByEmail(userEmail);
    if (!user) return { ok: false, error: 'User not found' };
    const tx = (user.transactions || []).find((t) => String(t.id) === String(txId));
    if (!tx) return { ok: false, error: 'Transaction not found' };
    const old = String(tx.status || '').toLowerCase();
    const next = String(status || '').toLowerCase();
    if (String(tx.type).toLowerCase() === 'withdrawal' && old === 'pending' && (next === 'cancelled' || next === 'failed')) {
      user.balance = Number(((user.balance || 0) + Number(tx.amount || 0)).toFixed(2));
      user.totalWithdrawals = Math.max(0, Number(((user.totalWithdrawals || 0) - Number(tx.amount || 0)).toFixed(2)));
      pushNotification(user, {
        title: 'Withdrawal declined',
        body: 'Your withdrawal of $' + Number(tx.amount || 0).toFixed(2) + ' was declined and refunded.',
        type: 'wallet'
      });
    }
    if (String(tx.type).toLowerCase() === 'withdrawal' && old === 'pending' && next === 'completed') {
      pushNotification(user, {
        title: 'Withdrawal paid',
        body: 'Your withdrawal was marked completed.',
        type: 'wallet'
      });
      if (String(tx.method || '').toLowerCase() === 'bank' && user.payoutAccount) {
        user.payoutBankLocked = true;
      }
    }
    if (String(tx.type).toLowerCase() === 'deposit' && old === 'pending' && next === 'completed') {
      user.balance = Number(((user.balance || 0) + Number(tx.amount || 0)).toFixed(2));
      user.totalDeposits = Number(((user.totalDeposits || 0) + Number(tx.amount || 0)).toFixed(2));
      pushNotification(user, {
        title: 'Deposit credited',
        body: 'Your deposit of $' + Number(tx.amount || 0).toFixed(2) + ' was credited.',
        type: 'wallet'
      });
    }
    tx.status = next;
    if (noteEdit != null && String(noteEdit).trim() !== '') tx.note = String(noteEdit).trim();
    persistUser(user);
    return { ok: true, tx };
  }

  function listPendingAds() {
    const users = getUsers();
    const list = [];
    Object.keys(users).forEach((email) => {
      const u = normalizeUser(users[email]);
      (u.ads || []).forEach((ad) => {
        if (ad.status === 'pending' || ad.status === 'denied') {
          list.push({
            ...ad,
            sellerEmail: u.email,
            sellerName: u.name
          });
        }
      });
    });
    return list.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  }

  global.Acctventa = {
    CONFIG,
    PLANS,
    GATEWAYS,
    DEFAULT_CONFIG,
    DEFAULT_PLANS,
    getSettings,
    saveSettings,
    applySettings,
    getAdminRecord,
    ensureAdminInitialized,
    adminLogin,
    adminLogout,
    isAdminLoggedIn,
    changeAdminPassword,
    setAdminPasswordLocal,
    listAllUsersSummary,
    listPendingAds,
    listPendingWithdrawals,
    adminSetAdStatus,
    adminSetTxStatus,
    getUsers,
    saveUsers,
    getCurrentUser,
    persistUser,
    normalizeUser,
    formatMoney,
    getInitials,
    getPlan,
    getUploadsToday,
    getRemainingUploads,
    canUploadToday,
    aiReviewListing,
    runAiReviewOnAd,
    createAd,
    getMarketplaceListings,
    findListingById,
    purchaseListing,
    refundOrder,
    completeManualOrder,
    getMessages,
    sendMessage,
    deposit,
    withdraw,
    setPlan,
    pushNotification,
    uid,
    todayKey,
    randomReferralCode,
    isValidReferralCode
  };

  // refresh exported refs after settings apply (never crash boot)
  try {
    applySettings(getSettings());
    ensureAdminInitialized();
  } catch (e) {
    console.warn('Acctventa boot warning:', e);
  }
})(window);

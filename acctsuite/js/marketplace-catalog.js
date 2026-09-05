/**
 * Marketplace category catalog — acctbazaar-style groups + products with logos.
 */
(function (global) {
  function P(name, domain) {
    return { name: name, domain: domain || '' };
  }

  var GROUPS = [
    {
      id: 'social',
      name: 'Social Media',
      icon: 'fa-solid fa-heart',
      products: [
        P('Facebook', 'facebook.com'),
        P('Twitter', 'x.com'),
        P('Instagram', 'instagram.com'),
        P('LinkedIn', 'linkedin.com'),
        P('Pinterest', 'pinterest.com'),
        P('Snapchat', 'snapchat.com'),
        P('TikTok', 'tiktok.com'),
        P('Threads', 'threads.net'),
        P('Tinder', 'tinder.com'),
        P('Bumble', 'bumble.com'),
        P('Reddit', 'reddit.com'),
        P('Discord', 'discord.com'),
        P('Pof', 'pof.com'),
        P('Hinge', 'hinge.co'),
        P('Grindr', 'grindr.com'),
        P('Viber', 'viber.com'),
        P('GMX', 'gmx.com'),
        P('Quora', 'quora.com'),
        P('Match', 'match.com'),
        P('Ourtime', 'ourtime.com'),
        P('Hellotalk', 'hellotalk.com'),
        P('Zoosk', 'zoosk.com'),
        P('Okcupid', 'okcupid.com'),
        P('SMSmode', 'smsmode.com'),
        P('Noplace', 'noplace.com'),
        P('TenTen', 'tenten.app'),
        P('BeReal', 'bereal.com'),
        P('Airchat', 'aircha.com'),
        P('YikYak', 'yikyak.com'),
        P('SubstackNotes', 'substack.com'),
        P('Coverstar', 'coverstar.app'),
        P('Jagat', 'jagat.io'),
        P('Fizz', 'fizzsocial.app'),
        P('Lemon8', 'lemon8-app.com'),
        P('Lapse', 'lapse.com'),
      ],
    },
    {
      id: 'email',
      name: 'Emails & Messaging Service',
      icon: 'fa-solid fa-envelope',
      products: [
        P('Gmail', 'gmail.com'),
        P('Ymail', 'yahoo.com'),
        P('Hotmail', 'hotmail.com'),
        P('MailRu', 'mail.ru'),
        P('Outlook', 'outlook.com'),
        P('WhatsApp', 'whatsapp.com'),
        P('Google Voice', 'voice.google.com'),
        P('Telegram', 'telegram.org'),
        P('WeChat', 'wechat.com'),
        P('TextNow', 'textnow.com'),
        P('TextPlus', 'textplus.com'),
        P('Signal', 'signal.org'),
      ],
    },
    {
      id: 'giftcards',
      name: 'Giftcards',
      icon: 'fa-solid fa-gift',
      products: [
        P('Amazon', 'amazon.com'),
        P('Amex', 'americanexpress.com'),
        P('Ebay', 'ebay.com'),
        P('Google Play', 'play.google.com'),
        P('Nike', 'nike.com'),
        P('NordStrom', 'nordstrom.com'),
        P('Playstation', 'playstation.com'),
        P('Sephora', 'sephora.com'),
        P('Steam', 'steampowered.com'),
      ],
    },
    {
      id: 'vpn',
      name: 'VPN & PROXYs',
      icon: 'fa-solid fa-globe',
      products: [
        P('Windscribe', 'windscribe.com'),
        P('Nord', 'nordvpn.com'),
        P('911 Proxy', '911proxy.com'),
        P('Pia', 'privateinternetaccess.com'),
        P('Express', 'expressvpn.com'),
        P('IP VANISH', 'ipvanish.com'),
        P('CyberGhost', 'cyberghostvpn.com'),
        P('Private', 'privatevpn.com'),
        P('Total', 'totalvpn.com'),
        P('Surfshark', 'surfshark.com'),
      ],
    },
    {
      id: 'websites',
      name: 'Websites',
      icon: 'fa-solid fa-earth-americas',
      products: [P('Website', 'example.com'), P('Onlyfans', 'onlyfans.com')],
    },
    {
      id: 'ecommerce',
      name: 'E-commerce Platforms',
      icon: 'fa-solid fa-cart-shopping',
      products: [
        P('Aliexpress', 'aliexpress.com'),
        P('Alibaba', 'alibaba.com'),
        P('Amazon', 'amazon.com'),
        P('Shopify', 'shopify.com'),
        P('Ebay', 'ebay.com'),
        P('Shopee', 'shopee.com'),
        P('OZON', 'ozon.ru'),
        P('RedBook', 'xiaohongshu.com'),
        P('OLX', 'olx.com'),
        P('Vinted', 'vinted.com'),
        P('youla.ru', 'youla.ru'),
        P('JDcom', 'jd.com'),
        P('Magicbricks', 'magicbricks.com'),
        P('Wish', 'wish.com'),
      ],
    },
    {
      id: 'gaming',
      name: 'Gaming',
      icon: 'fa-solid fa-gamepad',
      products: [
        P('Playstation', 'playstation.com'),
        P('Call of Duty', 'callofduty.com'),
        P('PUBG', 'pubg.com'),
        P('Steam', 'steampowered.com'),
        P('GTA', 'rockstargames.com'),
        P('Fortnite', 'fortnite.com'),
        P('Epic', 'epicgames.com'),
      ],
    },
    {
      id: 'accounts',
      name: 'Accounts & Subscriptions',
      icon: 'fa-solid fa-id-card',
      products: [
        P('Netflix', 'netflix.com'),
        P('Apple', 'apple.com'),
        P('TrustWallet', 'trustwallet.com'),
        P('Prime Videos', 'primevideo.com'),
        P('Apple Music', 'music.apple.com'),
        P('Apple TV', 'tv.apple.com'),
        P('Spotify', 'spotify.com'),
        P('Audiomack', 'audiomack.com'),
        P('YouTube', 'youtube.com'),
        P('GitHub', 'github.com'),
        P('Canva', 'canva.com'),
        P('ChatGPT', 'openai.com'),
        P('Office365', 'office.com'),
        P('Paypal', 'paypal.com'),
        P('Bluesky', 'bsky.app'),
        P('QQ', 'qq.com'),
        P('Kick', 'kick.com'),
        P('Damus', 'damus.io'),
        P('RTRO', 'rtro.app'),
        P('Gowalla', 'gowalla.com'),
        P('Yandex', 'yandex.com'),
        P('Uber', 'uber.com'),
        P('Grab', 'grab.com'),
        P('Bolt', 'bolt.eu'),
        P('BlaBlaCar', 'blablacar.com'),
        P('inDriver', 'indriver.com'),
        P('Careem', 'careem.com'),
        P('OnTaxi', 'ontaxi.com'),
        P('Gett', 'gett.com'),
      ],
    },
    {
      id: 'others',
      name: 'Others',
      icon: 'fa-regular fa-face-smile',
      products: [
        P('Other', ''),
        P('VPS', ''),
        P('RDP', ''),
        P('SSH / Server', ''),
        P('Hosting / cPanel', ''),
      ],
    },
  ];

  var LOGO_CACHE_KEY = 'av_logo_ok_v5_violet';
  var logoOkCache = {};
  try {
    logoOkCache = JSON.parse(sessionStorage.getItem(LOGO_CACHE_KEY) || '{}') || {};
  } catch (e) {
    logoOkCache = {};
  }

  function hashColor(str) {
    var h = 0;
    var s = String(str || '');
    var i;
    for (i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    var palette = ['#7C3AED', '#7C3AED', '#059669', '#d97706', '#db2777', '#7C3AED', '#0d9488', '#e11d48'];
    return palette[Math.abs(h) % palette.length];
  }

  function letterLogoDataUri(name) {
    var letter = String(name || '?').trim().charAt(0).toUpperCase() || '?';
    var bg = hashColor(String(name || letter));
    return (
      'data:image/svg+xml,' +
      encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">' +
          '<rect width="64" height="64" rx="12" fill="' +
          bg +
          '"/>' +
          '<text x="32" y="42" text-anchor="middle" fill="#fff" font-size="32" font-weight="700" font-family="system-ui,sans-serif">' +
          letter +
          '</text></svg>'
      )
    );
  }

  function productLogoSlug(name, domain) {
    var base = String(domain || name || '')
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .split('/')[0];
    if (base.indexOf('.') !== -1) base = base.split('.')[0];
    base = base.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    return base || 'product';
  }

  function localLogoUrl(product) {
    if (!product) return '';
    var slug = productLogoSlug(product.name, product.domain);
    if (!slug) return '';
    // Cache-busted local high-res app icons (modern squircle / glass style where available).
    return '/img/products/' + slug + '.png?v=20260905violet1';
  }

  function remoteLogoCandidates(domain) {
    var d = String(domain || '')
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .split('/')[0];
    if (!d) return [];
    // Prefer full-color brand marks, then high-res favicons.
    return [
      'https://logo.clearbit.com/' + d,
      'https://icon.horse/icon/' + d,
      'https://www.google.com/s2/favicons?domain=' + encodeURIComponent(d) + '&sz=256',
      'https://icons.duckduckgo.com/ip3/' + d + '.ico',
    ];
  }

  function rememberLogo(domain, url) {
    var d = String(domain || '').trim().toLowerCase();
    if (!d || !url) return;
    logoOkCache[d] = url;
    try {
      sessionStorage.setItem(LOGO_CACHE_KEY, JSON.stringify(logoOkCache));
    } catch (e) {}
  }

  function remoteLogoUrl(product) {
    if (!product) return '';
    var local = localLogoUrl(product);
    if (local) return local;
    var domain = String(product.domain || '').trim().toLowerCase();
    if (!domain) return '';
    if (logoOkCache[domain]) return logoOkCache[domain];
    var cands = remoteLogoCandidates(domain);
    return cands[0] || '';
  }

  /**
   * Brand logo URL — local modern icons first, then Clearbit / icon.horse / Google.
   */
  function logoUrl(product) {
    if (!product) return letterLogoDataUri('?');
    if (product.logo && (/^https?:\/\//i.test(String(product.logo)) || String(product.logo).indexOf('/img/') === 0)) {
      return product.logo;
    }
    var remote = remoteLogoUrl(product);
    if (remote) return remote;
    return letterLogoDataUri(product.name || '?');
  }

  /**
   * Listing/market logo markup: modern local app icon with CDN fallbacks.
   */
  function logoMarkHtml(product, className) {
    var name = (product && product.name) || '?';
    var domain = String((product && product.domain) || '')
      .trim()
      .toLowerCase();
    var letter = letterLogoDataUri(name);
    var cls = className || 'av-prod-logo av-app-icon';
    if (cls.indexOf('av-app-icon') === -1) cls += ' av-app-icon';
    var local = localLogoUrl(product);
    var cands = [];
    if (local) cands.push(local);
    cands = cands.concat(remoteLogoCandidates(domain));
    if (logoOkCache[domain]) {
      cands = [logoOkCache[domain]].concat(cands.filter(function (u) { return u !== logoOkCache[domain]; }));
    }
    var src = cands[0] || letter;
    var fallback = cands[1] || '';
    var rest = cands.slice(2).join('|');
    var domainAttr = domain.replace(/"/g, '');
    return (
      '<img class="' +
      cls +
      '" src="' +
      src +
      '" alt="" width="48" height="48" decoding="async" loading="lazy" data-domain="' +
      domainAttr +
      '" data-letter="' +
      letter.replace(/"/g, '&quot;') +
      '" data-fb="' +
      String(fallback).replace(/"/g, '&quot;') +
      '" data-rest="' +
      String(rest).replace(/"/g, '&quot;') +
      '" onload="try{var d=this.getAttribute(\'data-domain\');if(d&&window.AcctSuiteCatalog&&window.AcctSuiteCatalog.rememberLogo&&this.src.indexOf(\'data:\')!==0)window.AcctSuiteCatalog.rememberLogo(d,this.src);}catch(e){}" onerror="var fb=this.getAttribute(\'data-fb\');if(fb){this.setAttribute(\'data-fb\',\'\');this.src=fb;return;}var rest=this.getAttribute(\'data-rest\')||\'\';if(rest){var parts=rest.split(\'|\');this.setAttribute(\'data-rest\',parts.slice(1).join(\'|\'));this.src=parts[0];return;}var L=this.getAttribute(\'data-letter\');if(L){this.onerror=null;this.src=L;}">'
    );
  }

  function allProducts() {
    var out = [];
    GROUPS.forEach(function (g) {
      (g.products || []).forEach(function (p) {
        out.push({
          name: p.name,
          domain: p.domain,
          groupId: g.id,
          groupName: g.name,
          logo: logoUrl(p),
          remoteLogo: remoteLogoUrl(p),
        });
      });
    });
    return out;
  }

  function findProduct(name) {
    var n = String(name || '')
      .trim()
      .toLowerCase();
    if (!n) return null;
    var list = allProducts();
    for (var i = 0; i < list.length; i++) {
      if (list[i].name.toLowerCase() === n) return list[i];
    }
    for (var j = 0; j < list.length; j++) {
      if (list[j].name.toLowerCase().indexOf(n) !== -1) return list[j];
    }
    return null;
  }

  function searchProducts(q) {
    var needle = String(q || '')
      .trim()
      .toLowerCase();
    var list = allProducts();
    if (!needle) return list;
    return list.filter(function (p) {
      return (
        p.name.toLowerCase().indexOf(needle) !== -1 ||
        p.groupName.toLowerCase().indexOf(needle) !== -1
      );
    });
  }

  function chipGroups() {
    return [
      { id: 'trending', name: 'Trending', icon: 'fa-solid fa-fire' },
    ].concat(
      GROUPS.filter(function (g) {
        return g.id !== 'others';
      }).map(function (g) {
        return { id: g.id, name: g.name, icon: g.icon };
      })
    );
  }

  /**
   * Only Social Media listings need a public profile/preview link.
   * WhatsApp, Telegram, email, VPN/VPS, gift cards, gaming, etc. are credential-only.
   */
  var NO_PREVIEW_GROUP_IDS = ['email', 'vpn', 'giftcards', 'accounts', 'gaming', 'ecommerce', 'websites', 'others'];
  var NO_PREVIEW_PRODUCTS = [
    'whatsapp', 'telegram', 'signal', 'wechat', 'google voice', 'textnow', 'textplus',
    'gmail', 'ymail', 'hotmail', 'mailru', 'outlook', 'yahoo',
    'vps', 'rdp', 'ssh', 'server', 'hosting', 'cpanel',
  ];

  function resolveCategory(name) {
    var cat = String(name || '').trim();
    if (!cat) return null;
    var lower = cat.toLowerCase();
    var gi;
    for (gi = 0; gi < GROUPS.length; gi++) {
      var g = GROUPS[gi];
      if (g.id === lower || g.name.toLowerCase() === lower) {
        return { groupId: g.id, groupName: g.name, productName: '' };
      }
    }
    var hit = findProduct(cat);
    if (hit) return { groupId: hit.groupId, groupName: hit.groupName, productName: hit.name };
    return null;
  }

  function categoryRequiresPreviewLink(name) {
    var resolved = resolveCategory(name);
    var lower = String(name || '').toLowerCase();
    var productLower = resolved && resolved.productName ? String(resolved.productName).toLowerCase() : lower;
    var i;
    for (i = 0; i < NO_PREVIEW_PRODUCTS.length; i++) {
      var p = NO_PREVIEW_PRODUCTS[i];
      if (productLower === p || productLower.indexOf(p) !== -1 || lower === p || lower.indexOf(p) !== -1) {
        return false;
      }
    }
    if (resolved && NO_PREVIEW_GROUP_IDS.indexOf(resolved.groupId) !== -1) return false;
    if (/\b(vpn|vps|rdp|proxy|proxies|giftcard|gift card|whatsapp|telegram|signal|wechat)\b/.test(lower)) {
      return false;
    }
    // Only Social Media group (Facebook, Instagram, TikTok, etc.)
    if (resolved && resolved.groupId === 'social') return true;
    var socialOnly = [
      'facebook', 'instagram', 'tiktok', 'twitter', 'x.com', 'snapchat', 'linkedin',
      'pinterest', 'threads', 'discord', 'reddit', 'tinder', 'bumble', 'hinge',
      'bereal', 'lemon8', 'quora',
    ];
    for (i = 0; i < socialOnly.length; i++) {
      if (lower === socialOnly[i] || lower.indexOf(socialOnly[i]) !== -1) return true;
    }
    return false;
  }

  global.AcctSuiteCatalog = {
    GROUPS: GROUPS,
    NO_PREVIEW_GROUP_IDS: NO_PREVIEW_GROUP_IDS,
    logoUrl: logoUrl,
    letterLogoDataUri: letterLogoDataUri,
    remoteLogoUrl: remoteLogoUrl,
    logoMarkHtml: logoMarkHtml,
    rememberLogo: rememberLogo,
    allProducts: allProducts,
    findProduct: findProduct,
    searchProducts: searchProducts,
    chipGroups: chipGroups,
    resolveCategory: resolveCategory,
    categoryRequiresPreviewLink: categoryRequiresPreviewLink,
  };
})(window);

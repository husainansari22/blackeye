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
      products: [P('Other', '')],
    },
  ];

  var LOGO_CACHE_KEY = 'acctsuite_logo_ok_v2';
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
    var palette = ['#4f46e5', '#0284c7', '#059669', '#d97706', '#db2777', '#7c3aed', '#0d9488', '#e11d48'];
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

  function remoteLogoCandidates(domain) {
    var d = String(domain || '')
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .split('/')[0];
    if (!d) return [];
    // Google first (reliable for many brands), DuckDuckGo as fallback.
    return [
      'https://www.google.com/s2/favicons?domain=' + encodeURIComponent(d) + '&sz=64',
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
    var domain = String(product.domain || '').trim().toLowerCase();
    if (!domain) return '';
    if (logoOkCache[domain]) return logoOkCache[domain];
    var cands = remoteLogoCandidates(domain);
    return cands[0] || '';
  }

  /** Instant letter avatar (no network). Use for first paint. */
  function logoUrl(product) {
    if (!product) return letterLogoDataUri('?');
    if (product.logo && String(product.logo).indexOf('data:image/svg+xml') === 0) return product.logo;
    return letterLogoDataUri(product.name || '?');
  }

  /**
   * Smart logo markup: letter shows instantly, brand favicon fades in when ready.
   * Falls back through candidate URLs; caches successes in sessionStorage.
   */
  function logoMarkHtml(product, className) {
    var name = (product && product.name) || '?';
    var domain = String((product && product.domain) || '')
      .trim()
      .toLowerCase();
    var letter = letterLogoDataUri(name);
    var cls = className || 'av-prod-logo';
    var cands = remoteLogoCandidates(domain);
    if (logoOkCache[domain]) cands = [logoOkCache[domain]].concat(cands.filter(function (u) { return u !== logoOkCache[domain]; }));
    if (!cands.length) {
      return (
        '<img class="' +
        cls +
        '" src="' +
        letter +
        '" alt="" width="20" height="20" decoding="async">'
      );
    }
    var primary = cands[0];
    var fallback = cands[1] || '';
    var domainAttr = domain.replace(/"/g, '');
    return (
      '<span class="av-logo-slot" title="' +
      String(name).replace(/"/g, '&quot;') +
      '">' +
      '<img class="' +
      cls +
      ' av-logo-letter" src="' +
      letter +
      '" alt="" width="20" height="20" decoding="async">' +
      '<img class="' +
      cls +
      ' av-logo-remote" src="' +
      primary +
      '" alt="" width="20" height="20" loading="lazy" decoding="async" data-domain="' +
      domainAttr +
      '" data-fb="' +
      String(fallback).replace(/"/g, '&quot;') +
      '" onload="this.classList.add(\'is-ready\');try{var d=this.getAttribute(\'data-domain\');if(d&&window.AcctSuiteCatalog&&window.AcctSuiteCatalog.rememberLogo)window.AcctSuiteCatalog.rememberLogo(d,this.src);}catch(e){}" onerror="var fb=this.getAttribute(\'data-fb\');if(fb){this.setAttribute(\'data-fb\',\'\');this.src=fb;}else{this.remove();}">' +
      '</span>'
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

  /** Credential-only groups — no public profile link to verify (VPN, gift cards, etc.) */
  var NO_PREVIEW_GROUP_IDS = ['vpn', 'giftcards', 'accounts', 'gaming', 'ecommerce', 'websites', 'others'];

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
    if (resolved && NO_PREVIEW_GROUP_IDS.indexOf(resolved.groupId) !== -1) return false;
    var lower = String(name || '').toLowerCase();
    if (/\b(vpn|proxy|proxies|giftcard|gift card)\b/.test(lower)) return false;
    if (resolved && (resolved.groupId === 'social' || resolved.groupId === 'email')) return true;
    var socialEmail = [
      'facebook', 'instagram', 'tiktok', 'twitter', 'gmail', 'telegram', 'whatsapp',
      'snapchat', 'linkedin', 'pinterest', 'threads', 'discord', 'reddit', 'hotmail',
      'outlook', 'yahoo', 'signal', 'wechat', 'tinder', 'bumble',
    ];
    var i;
    for (i = 0; i < socialEmail.length; i++) {
      if (lower === socialEmail[i] || lower.indexOf(socialEmail[i]) !== -1) return true;
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

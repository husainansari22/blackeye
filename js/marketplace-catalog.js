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

  function logoUrl(product) {
    if (!product) return '';
    if (product.logo) return product.logo;
    var domain = String(product.domain || '').trim();
    if (!domain) {
      return (
        'data:image/svg+xml,' +
        encodeURIComponent(
          '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" rx="12" fill="#0ea5e9"/><text x="32" y="40" text-anchor="middle" fill="#fff" font-size="28" font-family="sans-serif">?</text></svg>'
        )
      );
    }
    return 'https://www.google.com/s2/favicons?domain=' + encodeURIComponent(domain) + '&sz=64';
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

  global.AcctventaCatalog = {
    GROUPS: GROUPS,
    logoUrl: logoUrl,
    allProducts: allProducts,
    findProduct: findProduct,
    searchProducts: searchProducts,
    chipGroups: chipGroups,
  };
})(window);

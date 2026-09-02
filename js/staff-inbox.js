/**
 * Shared staff inbox helpers — Owner + Admin support chats.
 */
(function (global) {
  function esc(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function initials(name) {
    const parts = String(name || 'U')
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (!parts.length) return 'U';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }

  function relativeTime(iso) {
    if (!iso) return '';
    const t = new Date(iso).getTime();
    if (!t) return '';
    const diff = Math.max(0, Date.now() - t);
    const m = Math.floor(diff / 60000);
    if (m < 1) return 'now';
    if (m < 60) return m + 'm';
    const h = Math.floor(m / 60);
    if (h < 24) return h + 'h';
    const d = Math.floor(h / 24);
    if (d < 7) return d + 'd';
    try {
      return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    } catch (e) {
      return '';
    }
  }

  function clockTime(iso) {
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    } catch (e) {
      return '';
    }
  }

  function filterThreads(threads, q) {
    const list = Array.isArray(threads) ? threads.slice() : [];
    const needle = String(q || '')
      .trim()
      .toLowerCase();
    if (!needle) return list;
    return list.filter(function (t) {
      return (
        String(t.id || '')
          .toLowerCase()
          .indexOf(needle) !== -1 ||
        String(t.userId || t.user_id || '')
          .toLowerCase()
          .indexOf(needle) !== -1 ||
        String(t.userName || '')
          .toLowerCase()
          .indexOf(needle) !== -1 ||
        String(t.userEmail || '')
          .toLowerCase()
          .indexOf(needle) !== -1 ||
        String(t.lastBody || '')
          .toLowerCase()
          .indexOf(needle) !== -1 ||
        String(t.public_id || t.txid || '')
          .toLowerCase()
          .indexOf(needle) !== -1 ||
        String(t.title || '')
          .toLowerCase()
          .indexOf(needle) !== -1 ||
        String(t.buyer_name || '')
          .toLowerCase()
          .indexOf(needle) !== -1 ||
        String(t.seller_name || '')
          .toLowerCase()
          .indexOf(needle) !== -1
      );
    });
  }

  function sortThreads(threads) {
    return (threads || []).slice().sort(function (a, b) {
      const au = Number(a.unreadCount) || 0;
      const bu = Number(b.unreadCount) || 0;
      if (bu !== au) return bu - au;
      const at = new Date(a.lastMessageAt || a.createdAt || 0).getTime();
      const bt = new Date(b.lastMessageAt || b.createdAt || 0).getTime();
      return bt - at;
    });
  }

  function counts(threads) {
    const list = threads || [];
    let unread = 0;
    let online = 0;
    list.forEach(function (t) {
      unread += Number(t.unreadCount) || 0;
      if (t.userOnline) online += 1;
    });
    return { total: list.length, unread: unread, online: online };
  }

  function renderThreadList(opts) {
    const box = opts.box;
    const threads = sortThreads(filterThreads(opts.threads, opts.query));
    const activeId = opts.activeId;
    const onOpen = opts.onOpen;
    if (!box) return threads;
    if (!threads.length) {
      box.innerHTML =
        '<div class="av-empty-chat"><i class="fa-regular fa-comments"></i><p>No conversations match.</p><p class="text-[11px]" style="opacity:.8">New user chats appear here automatically.</p></div>';
      return threads;
    }
    box.innerHTML = threads
      .map(function (t) {
        const unread = Number(t.unreadCount) || 0;
        const preview =
          (t.lastRole === 'staff' ? 'You: ' : '') + (t.lastBody || 'No messages yet');
        return (
          '<button type="button" class="av-thread ' +
          (String(activeId) === String(t.id) ? 'is-active ' : '') +
          (unread ? 'has-unread ' : '') +
          '" data-thread-id="' +
          esc(t.id) +
          '">' +
          '<span class="av-avatar">' +
          esc(initials(t.userName)) +
          '<span class="dot ' +
          (t.userOnline ? 'on' : '') +
          '"></span></span>' +
          '<span class="mid min-w-0">' +
          '<p class="name truncate">' +
          esc(t.userName || 'User') +
          '</p>' +
          '<p class="meta truncate">' +
          esc(t.userEmail || '') +
          '</p>' +
          '<p class="preview">' +
          esc(preview) +
          '</p>' +
          '</span>' +
          '<span class="side">' +
          '<span class="time">' +
          esc(relativeTime(t.lastMessageAt)) +
          '</span>' +
          (unread ? '<span class="av-badge">' + (unread > 99 ? '99+' : unread) + '</span>' : '') +
          '</span>' +
          '</button>'
        );
      })
      .join('');
    box.querySelectorAll('[data-thread-id]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (typeof onOpen === 'function') onOpen(Number(btn.getAttribute('data-thread-id')));
      });
    });
    return threads;
  }

  function renderStats(el, threads) {
    if (!el) return;
    const c = counts(threads);
    el.innerHTML =
      '<span class="av-chip"><strong>' +
      c.total +
      '</strong> chats</span>' +
      '<span class="av-chip ' +
      (c.unread ? 'is-hot' : '') +
      '"><strong>' +
      c.unread +
      '</strong> unread</span>' +
      '<span class="av-chip"><strong>' +
      c.online +
      '</strong> online</span>';
  }

  function setChatOpen(shell, open) {
    if (!shell) return;
    shell.classList.toggle('is-chat-open', !!open);
  }

  function isImageAttachment(m) {
    if (!m) return false;
    const mime = String(m.attachmentMime || m.attachment_mime || '');
    const url = String(m.attachmentUrl || m.attachment_url || '');
    const name = String(m.attachmentName || m.attachment_name || '');
    if (mime.indexOf('image/') === 0) return true;
    return /\.(png|jpe?g|gif|webp|heic|heif|bmp)$/i.test(url) || /\.(png|jpe?g|gif|webp|heic|heif|bmp)$/i.test(name);
  }

  function attachmentBodyIsPlaceholder(m) {
    const body = String(m.body || m.text || '').trim();
    const name = String(m.attachmentName || m.attachment_name || '').trim();
    if (!body) return true;
    if (name && (body === name || body === '📎 ' + name)) return true;
    return /^📎\s+\S+\.(png|jpe?g|gif|webp|heic|heif|bmp)$/i.test(body);
  }

  function attachHtml(m) {
    const rawUrl = m && (m.attachmentUrl || m.attachment_url);
    if (!rawUrl) return '';
    const url = esc(rawUrl);
    if (isImageAttachment(m)) {
      return (
        '<a href="' +
        url +
        '" target="_blank" rel="noopener"><img class="av-attach" src="' +
        url +
        '" alt="' +
        esc(m.attachmentName || m.attachment_name || 'image') +
        '" loading="lazy"></a>'
      );
    }
    return (
      '<a class="av-file" href="' +
      url +
      '" target="_blank" rel="noopener">📎 ' +
      esc(m.attachmentName || m.attachment_name || 'file') +
      '</a>'
    );
  }

  function messageBodyHtml(m) {
    const body = String(m.body || m.text || '').trim();
    if (!body) return '';
    if ((m.attachmentUrl || m.attachment_url) && attachmentBodyIsPlaceholder(m)) return '';
    return esc(body);
  }

  function renderMessages(box, messages, thread, opts) {
    opts = opts || {};
    if (!box) return;
    const msgs = messages || [];
    const userName = (thread && thread.userName) || 'User';
    const prevScroll = box.scrollTop;
    const prevHeight = box.scrollHeight;
    const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 90;
    if (!msgs.length) {
      box.innerHTML = '<div class="av-empty-chat"><i class="fa-regular fa-comment-dots"></i><p>No messages yet. Say hello.</p></div>';
      return;
    }
    box.innerHTML = msgs
      .map(function (m) {
        const mine = m.role === 'staff';
        const body = messageBodyHtml(m);
        return (
          '<div class="av-bubble ' +
          (mine ? 'av-bubble-out' : 'av-bubble-in') +
          '"><p class="who">' +
          esc(mine ? m.staffName || 'Support' : userName) +
          '</p>' +
          (body ? '<p class="body">' + body + '</p>' : '') +
          attachHtml(m) +
          '<p class="when">' +
          esc(clockTime(m.createdAt)) +
          '</p></div>'
        );
      })
      .join('');
    if (opts.preserveScroll && !nearBottom) {
      box.scrollTop = prevScroll + (box.scrollHeight - prevHeight);
    } else {
      box.scrollTop = box.scrollHeight;
    }
  }

  function headerHtml(thread, opts) {
    opts = opts || {};
    if (!thread) {
      return (
        (opts.showBack
          ? '<button type="button" class="av-back-chat" data-inbox-back aria-label="Back">←</button>'
          : '') +
        '<div class="head-main"><div class="head-title">Select a conversation</div><div class="head-sub">Pick a chat from the left</div></div>'
      );
    }
    return (
      (opts.showBack
        ? '<button type="button" class="av-back-chat" data-inbox-back aria-label="Back">←</button>'
        : '') +
      '<span class="av-avatar">' +
      esc(initials(thread.userName)) +
      '<span class="dot ' +
      (thread.userOnline ? 'on' : '') +
      '"></span></span>' +
      '<div class="head-main"><div class="head-title truncate">' +
      esc(thread.userName || 'User') +
      '</div><div class="head-sub truncate">' +
      esc(thread.userEmail || '') +
      (thread.userOnline ? ' · Online' : '') +
      (thread.userPlan ? ' · ' + esc(thread.userPlan) : '') +
      '</div></div>'
    );
  }

  global.AcctventaStaffInbox = {
    esc: esc,
    initials: initials,
    relativeTime: relativeTime,
    filterThreads: filterThreads,
    sortThreads: sortThreads,
    counts: counts,
    renderThreadList: renderThreadList,
    renderStats: renderStats,
    setChatOpen: setChatOpen,
    renderMessages: renderMessages,
    headerHtml: headerHtml,
    attachHtml: attachHtml,
  };
})(window);

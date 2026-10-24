(function () {
  const sidebar = document.getElementById("sidebar");
  const backdrop = document.getElementById("backdrop");
  const menuBtn = document.getElementById("menu-btn");
  const messagesInner = document.getElementById("messages-inner");
  const messagesEl = document.getElementById("messages");
  const chatList = document.getElementById("chat-list");
  const promptEl = document.getElementById("prompt");
  const sendBtn = document.getElementById("send");
  const form = document.getElementById("composer");
  const attachStrip = document.getElementById("attach-strip");
  const fileInput = document.getElementById("file-input");
  const btnAttach = document.getElementById("btn-attach");

  /** @type {{ id: string, name: string, type: string, dataUrl: string }[]} */
  let pendingAttachments = [];

  VidChatGpuPanel.inject();

  function openSidebar() {
    sidebar.classList.add("open");
    backdrop.classList.add("show");
  }
  function closeSidebar() {
    sidebar.classList.remove("open");
    backdrop.classList.remove("show");
  }
  menuBtn.addEventListener("click", openSidebar);
  backdrop.addEventListener("click", closeSidebar);

  function updateSendEnabled() {
    sendBtn.disabled = !(promptEl.value.trim() || pendingAttachments.length);
  }

  promptEl.addEventListener("input", () => {
    promptEl.style.height = "auto";
    promptEl.style.height = Math.min(promptEl.scrollHeight, 160) + "px";
    updateSendEnabled();
  });

  promptEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!sendBtn.disabled) form.requestSubmit();
    }
  });

  function syncModeUi() {
    const mode = VidChatStore.getGenMode();
    document.getElementById("mode-video").classList.toggle("active", mode === "video");
    document.getElementById("mode-photo").classList.toggle("active", mode === "photo");
    promptEl.placeholder =
      mode === "photo"
        ? "Describe the photo to generate…"
        : "Describe the video to generate…";
  }

  document.getElementById("mode-video").onclick = () => {
    VidChatStore.setGenMode("video");
    syncModeUi();
  };
  document.getElementById("mode-photo").onclick = () => {
    VidChatStore.setGenMode("photo");
    syncModeUi();
  };

  function renderAttachments() {
    if (!pendingAttachments.length) {
      attachStrip.classList.remove("show");
      attachStrip.innerHTML = "";
      updateSendEnabled();
      return;
    }
    attachStrip.classList.add("show");
    attachStrip.innerHTML = pendingAttachments
      .map((a) => {
        const media = a.type.startsWith("video/")
          ? `<video src="${a.dataUrl}" muted></video>`
          : `<img src="${a.dataUrl}" alt="" />`;
        return `<div class="attach-chip" data-id="${a.id}">${media}<button type="button" class="rm" aria-label="Remove">✕</button></div>`;
      })
      .join("");
    attachStrip.querySelectorAll(".attach-chip").forEach((chip) => {
      chip.querySelector(".rm").onclick = () => {
        pendingAttachments = pendingAttachments.filter((x) => x.id !== chip.dataset.id);
        renderAttachments();
      };
    });
    updateSendEnabled();
  }

  btnAttach.onclick = () => fileInput.click();
  fileInput.addEventListener("change", async () => {
    const files = Array.from(fileInput.files || []);
    fileInput.value = "";
    for (const file of files) {
      if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) continue;
      if (file.size > 25 * 1024 * 1024) {
        VidChatGpuPanel.toast("File too large (max 25MB)");
        continue;
      }
      const dataUrl = await VidChatStore.fileToDataUrl(file);
      pendingAttachments.push({
        id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()),
        name: file.name,
        type: file.type,
        dataUrl,
      });
    }
    renderAttachments();
  });

  function ensureChat() {
    let chat = VidChatStore.getActiveChat();
    if (!chat) chat = VidChatStore.newChat();
    return chat;
  }

  function startNewChat() {
    VidChatStore.newChat();
    pendingAttachments = [];
    renderAttachments();
    promptEl.value = "";
    promptEl.style.height = "auto";
    updateSendEnabled();
    renderAll();
    closeSidebar();
    promptEl.focus();
    VidChatGpuPanel.toast("New chat");
  }

  document.getElementById("btn-new-chat").onclick = startNewChat;
  document.getElementById("btn-new-chat-top").onclick = startNewChat;
  document.getElementById("nav-chat").onclick = () => {
    closeSidebar();
  };

  function renderChatList() {
    const chats = VidChatStore.listChats();
    const active = VidChatStore.getActiveChat();
    chatList.innerHTML =
      '<div class="chat-list-label">Chats</div>' +
      (chats.length
        ? chats
            .map(
              (c) => `
          <div class="chat-item ${active && active.id === c.id ? "active" : ""}" data-id="${c.id}">
            <button class="chat-item-title" type="button" data-open="${c.id}">${escapeHtml(c.title)}</button>
            <button class="chat-item-del" type="button" data-del="${c.id}" title="Delete chat" aria-label="Delete chat">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>
            </button>
          </div>`
            )
            .join("")
        : '<p style="padding:8px 12px;font-size:13px;color:var(--text-dim)">No chats yet — tap <strong>New chat</strong></p>');

    chatList.querySelectorAll("[data-open]").forEach((btn) => {
      btn.onclick = () => {
        VidChatStore.setActiveChat(btn.getAttribute("data-open"));
        renderAll();
        closeSidebar();
      };
    });
    chatList.querySelectorAll("[data-del]").forEach((btn) => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const id = btn.getAttribute("data-del");
        const title = VidChatStore.listChats().find((c) => c.id === id)?.title || "chat";
        if (!confirm('Delete "' + title + '"?')) return;
        VidChatStore.deleteChat(id);
        if (!VidChatStore.getActiveChat()) {
          // stay on empty state
        }
        renderAll();
        VidChatGpuPanel.toast("Chat deleted");
      };
    });
  }

  function emptyState() {
    const mode = VidChatStore.getGenMode();
    return `
      <div class="empty-state">
        <div class="empty-logo">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 100 20 10 10 0 000-20z"/></svg>
        </div>
        <h1>What can I help with?</h1>
        <p>Upload a photo or video, choose <strong>Photo</strong> or <strong>Video</strong>, then describe what you want. Use <strong>New chat</strong> in the sidebar (or the pencil on mobile).</p>
        <div class="suggestions">
          <button class="sug" type="button" data-prompt="Cinematic drone shot over a misty mountain lake at sunrise" data-set-mode="video"><strong>Drone sunrise</strong><span>Video · misty lake</span></button>
          <button class="sug" type="button" data-prompt="Portrait photo of a person in soft window light, 85mm look" data-set-mode="photo"><strong>Soft portrait</strong><span>Photo · natural light</span></button>
          <button class="sug" type="button" data-prompt="Transform my upload into neon Tokyo night style" data-set-mode="video"><strong>Restyle upload</strong><span>Attach a file first, then send</span></button>
          <button class="sug" type="button" data-open-gpu><strong>Connect GPU</strong><span>Paste rented server URL &amp; Deploy</span></button>
        </div>
      </div>`;
  }

  function renderMessages() {
    const chat = VidChatStore.getActiveChat();
    if (!chat || !chat.messages.length) {
      messagesInner.innerHTML = emptyState();
      messagesInner.querySelectorAll("[data-prompt]").forEach((btn) => {
        btn.onclick = () => {
          const m = btn.getAttribute("data-set-mode");
          if (m) {
            VidChatStore.setGenMode(m);
            syncModeUi();
          }
          promptEl.value = btn.getAttribute("data-prompt");
          promptEl.dispatchEvent(new Event("input"));
          form.requestSubmit();
        };
      });
      messagesInner.querySelectorAll("[data-open-gpu]").forEach((btn) => {
        btn.onclick = () => VidChatGpuPanel.open();
      });
      return;
    }

    messagesInner.innerHTML = chat.messages
      .map((m) => {
        const isUser = m.role === "user";
        let media = "";
        if (m.attachments && m.attachments.length) {
          media +=
            '<div class="msg-attachments">' +
            m.attachments
              .map((a) =>
                a.type && a.type.startsWith("video/")
                  ? `<video src="${escapeAttr(a.dataUrl)}" controls playsinline></video>`
                  : `<img src="${escapeAttr(a.dataUrl)}" alt="" />`
              )
              .join("") +
            "</div>";
        }
        if (m.videoUrl) {
          media += `<div class="video-card"><video src="${escapeAttr(m.videoUrl)}" controls playsinline></video>
            <div class="video-meta"><span class="badge">Video</span><span>Clean export</span></div></div>`;
        }
        if (m.imageUrl) {
          media += `<div class="photo-card"><img class="square" src="${escapeAttr(m.imageUrl)}" alt="Generated" />
            <div class="video-meta"><span class="badge">Photo</span><span>Clean export</span></div></div>`;
        } else if (m.preview) {
          const kind = m.previewKind === "photo" ? "photo" : "video";
          media += `<div class="${kind === "photo" ? "photo-card" : "video-card"}"><canvas class="preview-canvas ${kind === "photo" ? "square" : ""}" data-seed="${escapeAttr(m.preview)}" data-kind="${kind}" width="360" height="${kind === "photo" ? 360 : 640}"></canvas>
            <div class="video-meta"><span class="badge">Local preview</span><span>Connect GPU for real render</span></div></div>`;
        }
        return `
          <div class="msg ${isUser ? "user" : "assistant"}">
            <div class="msg-avatar">${isUser ? "U" : "V"}</div>
            <div class="msg-body">
              <p>${escapeHtml(m.content).replace(/\n/g, "<br>")}</p>
              ${media}
            </div>
          </div>`;
      })
      .join("");

    messagesInner.querySelectorAll(".preview-canvas").forEach(drawPreview);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function drawPreview(canvas) {
    const ctx = canvas.getContext("2d");
    const seed = canvas.getAttribute("data-seed") || "preview";
    const kind = canvas.getAttribute("data-kind") || "video";
    const w = canvas.width;
    const h = canvas.height;
    let t = 0;
    const colors = ["#0f766e", "#134e4a", "#115e59", "#042f2e"];
    function frame() {
      t += 0.02;
      const g = ctx.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, colors[Math.floor(t) % colors.length]);
      g.addColorStop(1, "#111");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.font = "600 18px sans-serif";
      ctx.fillText(kind === "photo" ? "Photo preview" : "Video preview", 24, 48);
      ctx.font = "13px sans-serif";
      ctx.fillStyle = "rgba(255,255,255,0.55)";
      wrapText(ctx, seed, 24, 80, w - 48, 18);
      ctx.beginPath();
      ctx.arc(w / 2 + Math.sin(t) * 40, h / 2 + Math.cos(t * 0.8) * 30, 48, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(16,163,127,0.35)";
      ctx.fill();
      canvas._raf = requestAnimationFrame(frame);
    }
    cancelAnimationFrame(canvas._raf);
    frame();
  }

  function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
    const words = String(text).split(" ");
    let line = "";
    for (let n = 0; n < words.length; n++) {
      const test = line + words[n] + " ";
      if (ctx.measureText(test).width > maxWidth && n > 0) {
        ctx.fillText(line, x, y);
        line = words[n] + " ";
        y += lineHeight;
      } else line = test;
    }
    ctx.fillText(line, x, y);
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }
  function escapeAttr(str) {
    return escapeHtml(str).replace(/"/g, "&quot;");
  }

  function renderAll() {
    renderChatList();
    renderMessages();
    syncModeUi();
    VidChatGpuPanel.refresh();
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = promptEl.value.trim();
    if (!text && !pendingAttachments.length) return;

    const mode = VidChatStore.getGenMode();
    const attachments = pendingAttachments.slice();
    const chat = ensureChat();

    const userContent =
      text ||
      (attachments.length
        ? "Use my upload" + (attachments.length > 1 ? "s" : "") + " as reference."
        : "");

    VidChatStore.appendMessage(chat.id, {
      role: "user",
      content: userContent,
      attachments: attachments.map((a) => ({
        name: a.name,
        type: a.type,
        dataUrl: a.dataUrl,
      })),
      genMode: mode,
    });

    promptEl.value = "";
    promptEl.style.height = "auto";
    pendingAttachments = [];
    renderAttachments();
    updateSendEnabled();
    renderAll();

    VidChatStore.appendMessage(chat.id, {
      role: "assistant",
      content:
        mode === "photo"
          ? "Generating photo on your deployed GPU…"
          : "Generating video on your deployed GPU…",
    });
    renderAll();

    try {
      const active = VidChatStore.getActiveServer();
      if (!active) {
        const s = VidChatStore.get();
        const c = s.chats.find((x) => x.id === chat.id);
        if (c && c.messages.length) {
          const last = c.messages[c.messages.length - 1];
          last.content =
            "No GPU server is deployed yet.\n\nOpen GPU Servers → paste your rented GPU URL → Save & Deploy, then send again.\n\nShowing a local preview so you can check the UI.";
          last.preview = userContent;
          last.previewKind = mode;
          localStorage.setItem("vidchat.v1", JSON.stringify(s));
        }
        VidChatGpuPanel.toast("Import & deploy a GPU server first");
        renderAll();
        return;
      }

      const result = await VidChatStore.generate({
        prompt: userContent,
        mode,
        attachments,
      });
      const s = VidChatStore.get();
      const c = s.chats.find((x) => x.id === chat.id);
      if (c && c.messages.length) {
        const last = c.messages[c.messages.length - 1];
        if (result.url) {
          last.content =
            mode === "photo"
              ? "Here’s your photo from " + active.name + ". Clean export — no app watermark."
              : "Here’s your video from " + active.name + ". Clean export — no app watermark.";
          if (mode === "photo") last.imageUrl = result.url;
          else last.videoUrl = result.url;
        } else {
          last.content =
            "GPU responded but no media URL was returned. Check /v1/generate or /v1/image response shape.";
          last.preview = userContent;
          last.previewKind = mode;
        }
        localStorage.setItem("vidchat.v1", JSON.stringify(s));
      }
      renderAll();
    } catch (err) {
      const s = VidChatStore.get();
      const c = s.chats.find((x) => x.id === chat.id);
      if (c && c.messages.length) {
        const last = c.messages[c.messages.length - 1];
        last.content =
          "Could not reach your GPU: " +
          (err.message || "error") +
          "\n\nTips: enable CORS, confirm generate/image paths, and that the Deployed URL is reachable.";
        last.preview = userContent;
        last.previewKind = mode;
        localStorage.setItem("vidchat.v1", JSON.stringify(s));
      }
      renderAll();
      VidChatGpuPanel.toast("GPU request failed");
    }
  });

  syncModeUi();
  renderAll();
})();

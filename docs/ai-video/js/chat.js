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
  const fileInputImage = document.getElementById("file-input-image");
  const btnAttach = document.getElementById("btn-attach");

  /** @type {{ id: string, name: string, type: string, dataUrl: string }[]} */
  let pendingAttachments = [];
  let awaitingImageToVideo = false;

  VidChatGpuPanel.inject();
  VidChatAnimate.inject({ onGenerate: handleAnimateGenerate });

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

  async function addFiles(files, { imagesOnly = false } = {}) {
    for (const file of files) {
      if (imagesOnly && !file.type.startsWith("image/")) {
        VidChatGpuPanel.toast("Image to Video needs a photo");
        continue;
      }
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
  }

  btnAttach.onclick = () => {
    awaitingImageToVideo = false;
    fileInput.click();
  };
  fileInput.addEventListener("change", async () => {
    const files = Array.from(fileInput.files || []);
    fileInput.value = "";
    await addFiles(files);
  });
  fileInputImage?.addEventListener("change", async () => {
    const files = Array.from(fileInputImage.files || []);
    fileInputImage.value = "";
    pendingAttachments = [];
    await addFiles(files, { imagesOnly: true });
    if (pendingAttachments.length) {
      VidChatStore.setGenMode("video");
      syncModeUi();
      promptEl.placeholder = "Describe the video you want from this image…";
      promptEl.focus();
      VidChatGpuPanel.toast("Image added — describe your video");
    }
    awaitingImageToVideo = false;
  });

  function startImageToVideo() {
    VidChatStore.setGenMode("video");
    syncModeUi();
    awaitingImageToVideo = true;
    fileInputImage.click();
  }

  function startTextToVideo() {
    VidChatStore.setGenMode("video");
    syncModeUi();
    pendingAttachments = [];
    renderAttachments();
    promptEl.placeholder = "Describe the video to generate…";
    promptEl.focus();
    VidChatGpuPanel.toast("Text to Video — type your prompt");
  }

  async function handleAnimateGenerate(payload) {
    const chat = ensureChat();
    const label =
      (payload.mode === "replace" ? "Replace" : "Animate") +
      " · " +
      payload.resolution +
      (payload.prompt ? " — " + payload.prompt : "");

    VidChatStore.appendMessage(chat.id, {
      role: "user",
      content: "Realistic Animate — " + label,
      attachments: [
        { name: payload.sourceImage.name, type: payload.sourceImage.type, dataUrl: payload.sourceImage.dataUrl },
        { name: payload.referenceVideo.name, type: payload.referenceVideo.type, dataUrl: payload.referenceVideo.dataUrl },
      ],
      genMode: "animate",
    });
    VidChatStore.appendMessage(chat.id, {
      role: "assistant",
      content: "Running realistic " + (payload.mode === "replace" ? "Replace" : "Animate") + " on your GPU…",
    });
    renderAll();

    try {
      const active = VidChatStore.getActiveServer();
      if (!active) {
        const s = VidChatStore.get();
        const c = s.chats.find((x) => x.id === chat.id);
        if (c?.messages?.length) {
          const last = c.messages[c.messages.length - 1];
          last.content =
            "No GPU deployed yet. Open GPU Servers → paste your rented URL → Save & Deploy, then run Animate again.\n\nShowing a local preview.";
          last.preview = label;
          last.previewKind = "video";
          localStorage.setItem("vidchat.v1", JSON.stringify(s));
        }
        VidChatGpuPanel.toast("Deploy a GPU server first");
        renderAll();
        return;
      }

      const result = await VidChatStore.animate(payload);
      const s = VidChatStore.get();
      const c = s.chats.find((x) => x.id === chat.id);
      if (c?.messages?.length) {
        const last = c.messages[c.messages.length - 1];
        if (result.url) {
          last.content =
            "Here’s your " +
            (payload.mode === "replace" ? "Replace" : "Animate") +
            " result from " +
            active.name +
            ". Clean export — no app watermark.";
          last.videoUrl = result.url;
        } else {
          last.content = "GPU responded but no video URL was returned. Check /v1/animate response shape.";
          last.preview = label;
          last.previewKind = "video";
        }
        localStorage.setItem("vidchat.v1", JSON.stringify(s));
      }
      renderAll();
    } catch (err) {
      const s = VidChatStore.get();
      const c = s.chats.find((x) => x.id === chat.id);
      if (c?.messages?.length) {
        const last = c.messages[c.messages.length - 1];
        last.content =
          "Animate could not reach your GPU: " +
          (err.message || "error") +
          "\n\nEnable CORS and expose POST /v1/animate on the worker.";
        last.preview = label;
        last.previewKind = "video";
        localStorage.setItem("vidchat.v1", JSON.stringify(s));
      }
      renderAll();
      VidChatGpuPanel.toast("Animate failed");
    }
  }

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
    return `
      <div class="empty-state">
        <div class="empty-logo">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 100 20 10 10 0 000-20z"/></svg>
        </div>
        <h1>What can I help with?</h1>
        <p>Pick a feature to start — or type below. Upload references anytime with <strong>+</strong>.</p>
        <div class="suggestions">
          <button class="feature-card" type="button" data-feature="image-to-video">
            <div class="feature-ico i2v" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="14" height="14" rx="2"/><path d="M17 9l4 3-4 3V9z"/></svg>
            </div>
            <div class="body">
              <strong>Image to Video</strong>
              <span>Upload a photo, then describe the motion and scene you want.</span>
            </div>
            <svg class="chev" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 6l6 6-6 6"/></svg>
          </button>
          <button class="feature-card" type="button" data-feature="text-to-video">
            <div class="feature-ico t2v" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6h16M4 12h10M4 18h14"/><path d="M17 10l4 2-4 2v-4z"/></svg>
            </div>
            <div class="body">
              <strong>Text to Video</strong>
              <span>Write a prompt and generate a clip from words alone.</span>
            </div>
            <svg class="chev" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 6l6 6-6 6"/></svg>
          </button>
          <button class="feature-card" type="button" data-feature="animate">
            <div class="feature-ico anim" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3l3 6 6 .5-4.5 4 1.5 6.5L12 17l-6 3.5L7.5 14 3 9.5 9 9z"/></svg>
            </div>
            <div class="body">
              <strong>Realistic Animate</strong>
              <span>Source image + reference video · Animate or Replace · motion control.</span>
            </div>
            <svg class="chev" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 6l6 6-6 6"/></svg>
          </button>
        </div>
      </div>`;
  }

  function renderMessages() {
    const chat = VidChatStore.getActiveChat();
    if (!chat || !chat.messages.length) {
      messagesInner.innerHTML = emptyState();
      messagesInner.querySelectorAll("[data-feature]").forEach((btn) => {
        btn.onclick = () => {
          const f = btn.getAttribute("data-feature");
          if (f === "image-to-video") startImageToVideo();
          else if (f === "text-to-video") startTextToVideo();
          else if (f === "animate") VidChatAnimate.open();
        };
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

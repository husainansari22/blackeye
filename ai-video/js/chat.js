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

  promptEl.addEventListener("input", () => {
    promptEl.style.height = "auto";
    promptEl.style.height = Math.min(promptEl.scrollHeight, 160) + "px";
    sendBtn.disabled = !promptEl.value.trim();
  });

  promptEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      form.requestSubmit();
    }
  });

  function ensureChat() {
    let chat = VidChatStore.getActiveChat();
    if (!chat) chat = VidChatStore.newChat();
    return chat;
  }

  function renderChatList() {
    const chats = VidChatStore.listChats();
    const active = VidChatStore.getActiveChat();
    chatList.innerHTML =
      '<div class="chat-list-label">Chats</div>' +
      (chats.length
        ? chats
            .map(
              (c) =>
                `<button class="chat-item ${active && active.id === c.id ? "active" : ""}" data-id="${c.id}" type="button">${escapeHtml(c.title)}</button>`
            )
            .join("")
        : '<p style="padding:8px 12px;font-size:13px;color:var(--text-dim)">No chats yet</p>');

    chatList.querySelectorAll(".chat-item").forEach((btn) => {
      btn.onclick = () => {
        VidChatStore.setActiveChat(btn.dataset.id);
        renderAll();
        closeSidebar();
      };
    });
  }

  function emptyState() {
    return `
      <div class="empty-state">
        <div class="empty-logo">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 100 20 10 10 0 000-20zm-1 5h2v6h-2V7zm0 8h2v2h-2v-2z"/></svg>
        </div>
        <h1>What video will you create?</h1>
        <p>ChatGPT-style prompts → your rented GPU. Import a server link, Deploy, then generate.</p>
        <div class="suggestions">
          <button class="sug" type="button" data-prompt="Cinematic drone shot over a misty mountain lake at sunrise, 4 seconds, vertical"><strong>Drone sunrise</strong><span>Misty lake · vertical · cinematic</span></button>
          <button class="sug" type="button" data-prompt="Handheld street fashion walk in Tokyo neon rain, shallow depth of field, vertical phone video"><strong>Tokyo neon walk</strong><span>Fashion · rain · vertical</span></button>
          <button class="sug" type="button" data-prompt="Macro shot of coffee pour into ceramic cup, steam rising, warm kitchen light, vertical"><strong>Coffee pour</strong><span>Macro · cozy · vertical</span></button>
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
        if (m.videoUrl) {
          media = `<div class="video-card"><video src="${escapeAttr(m.videoUrl)}" controls playsinline></video>
            <div class="video-meta"><span class="badge">Clean export</span><span>No app watermark</span></div></div>`;
        } else if (m.preview) {
          media = `<div class="video-card"><canvas class="preview-canvas" data-seed="${escapeAttr(m.preview)}" width="360" height="640"></canvas>
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
    let t = 0;
    const colors = ["#0f766e", "#134e4a", "#115e59", "#042f2e"];
    function frame() {
      t += 0.02;
      const g = ctx.createLinearGradient(0, 0, 360, 640);
      g.addColorStop(0, colors[Math.floor(t) % colors.length]);
      g.addColorStop(1, "#111");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 360, 640);
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.font = "600 18px sans-serif";
      ctx.fillText("Preview", 24, 48);
      ctx.font = "13px sans-serif";
      ctx.fillStyle = "rgba(255,255,255,0.55)";
      wrapText(ctx, seed, 24, 80, 300, 18);
      // soft moving orb — not a social “AI label”
      ctx.beginPath();
      ctx.arc(180 + Math.sin(t) * 40, 320 + Math.cos(t * 0.8) * 30, 48, 0, Math.PI * 2);
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
    VidChatGpuPanel.refresh();
  }

  document.getElementById("btn-new-chat").onclick = () => {
    VidChatStore.newChat();
    renderAll();
    closeSidebar();
    promptEl.focus();
  };

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = promptEl.value.trim();
    if (!text) return;

    const chat = ensureChat();
    VidChatStore.appendMessage(chat.id, { role: "user", content: text });
    promptEl.value = "";
    promptEl.style.height = "auto";
    sendBtn.disabled = true;
    renderAll();

    const thinkingId = "thinking";
    VidChatStore.appendMessage(chat.id, {
      role: "assistant",
      content: "Sending prompt to your deployed GPU…",
      _tmp: thinkingId,
    });
    renderAll();

    try {
      const active = VidChatStore.getActiveServer();
      if (!active) {
        // Keep last assistant msg as guidance + local preview
        const s = VidChatStore.get();
        const c = s.chats.find((x) => x.id === chat.id);
        if (c && c.messages.length) {
          const last = c.messages[c.messages.length - 1];
          last.content =
            "No GPU server is deployed yet.\n\nOpen GPU Servers → paste your rented GPU URL → Save & Deploy, then send this prompt again.\n\nShowing a local motion preview so you can check the UI on your phone.";
          last.preview = text;
          delete last._tmp;
          localStorage.setItem("vidchat.v1", JSON.stringify(s));
        }
        VidChatGpuPanel.toast("Import & deploy a GPU server first");
        renderAll();
        return;
      }

      const result = await VidChatStore.generateVideo({ prompt: text });
      const s = VidChatStore.get();
      const c = s.chats.find((x) => x.id === chat.id);
      if (c && c.messages.length) {
        const last = c.messages[c.messages.length - 1];
        last.content = result.url
          ? "Here’s your clip from " + active.name + ". Clean export is on — this app does not burn in watermarks or AI labels."
          : "GPU responded but no video URL was returned. Check your worker’s /v1/generate JSON shape (url / video_url / output).";
        if (result.url) last.videoUrl = result.url;
        else last.preview = text;
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
          "\n\nTips: enable CORS on the worker, confirm the generate path, and that the Deployed URL is reachable from this phone.";
        last.preview = text;
        localStorage.setItem("vidchat.v1", JSON.stringify(s));
      }
      renderAll();
      VidChatGpuPanel.toast("GPU request failed");
    }
  });

  renderAll();
})();

/**
 * GPU server + chat persistence (local only).
 */
(function (global) {
  const KEY = "vidchat.v1";

  const defaults = {
    servers: [],
    activeId: null,
    cleanExport: true,
    chats: [],
    activeChatId: null,
    genMode: "video", // video | photo
  };

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return structuredClone(defaults);
      return { ...structuredClone(defaults), ...JSON.parse(raw) };
    } catch {
      return structuredClone(defaults);
    }
  }

  function save(state) {
    localStorage.setItem(KEY, JSON.stringify(state));
  }

  function uid() {
    return crypto.randomUUID
      ? crypto.randomUUID()
      : "id-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8);
  }

  function normalizeUrl(url) {
    let u = (url || "").trim();
    if (!u) return "";
    if (!/^https?:\/\//i.test(u)) u = "https://" + u;
    return u.replace(/\/+$/, "");
  }

  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  const Store = {
    get() {
      return load();
    },

    getGenMode() {
      return load().genMode === "photo" ? "photo" : "video";
    },

    setGenMode(mode) {
      const s = load();
      s.genMode = mode === "photo" ? "photo" : "video";
      save(s);
    },

    getActiveServer() {
      const s = load();
      return s.servers.find((x) => x.id === s.activeId) || null;
    },

    listServers() {
      return load().servers;
    },

    upsertServer({ id, name, url, token, healthPath, generatePath, imagePath, streamPath }) {
      const s = load();
      const entry = {
        id: id || uid(),
        name: (name || "GPU Server").trim() || "GPU Server",
        url: normalizeUrl(url),
        token: (token || "").trim(),
        healthPath: (healthPath || "/health").trim() || "/health",
        generatePath: (generatePath || "/v1/generate").trim() || "/v1/generate",
        imagePath: (imagePath || "/v1/image").trim() || "/v1/image",
        streamPath: (streamPath || "/v1/stream").trim() || "/v1/stream",
        savedAt: Date.now(),
      };
      if (!entry.url) throw new Error("GPU server URL is required");

      const idx = s.servers.findIndex((x) => x.id === entry.id);
      if (idx >= 0) s.servers[idx] = { ...s.servers[idx], ...entry };
      else s.servers.unshift(entry);
      save(s);
      return entry;
    },

    removeServer(id) {
      const s = load();
      s.servers = s.servers.filter((x) => x.id !== id);
      if (s.activeId === id) s.activeId = s.servers[0]?.id || null;
      save(s);
    },

    deploy(id) {
      const s = load();
      const found = s.servers.find((x) => x.id === id);
      if (!found) throw new Error("Server not found");
      s.activeId = id;
      save(s);
      return found;
    },

    setCleanExport(on) {
      const s = load();
      s.cleanExport = !!on;
      save(s);
    },

    getCleanExport() {
      return !!load().cleanExport;
    },

    async ping(server) {
      const path = server.healthPath.startsWith("/")
        ? server.healthPath
        : "/" + server.healthPath;
      const headers = {};
      if (server.token) headers.Authorization = "Bearer " + server.token;
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 8000);
      try {
        const res = await fetch(server.url + path, {
          method: "GET",
          headers,
          signal: ctrl.signal,
          mode: "cors",
        });
        return { ok: res.ok, status: res.status };
      } catch (err) {
        return { ok: false, status: 0, error: err.message || "unreachable" };
      } finally {
        clearTimeout(t);
      }
    },

    /**
     * Generate photo or video via deployed GPU.
     * attachments: [{ name, type, dataUrl }]
     */
    async generate({ prompt, mode = "video", attachments = [], duration = 4, aspect = "9:16" }) {
      const server = Store.getActiveServer();
      if (!server) throw new Error("No GPU server deployed. Open GPU Servers and Deploy one.");

      const isPhoto = mode === "photo";
      const rawPath = isPhoto
        ? server.imagePath || "/v1/image"
        : server.generatePath || "/v1/generate";
      const path = rawPath.startsWith("/") ? rawPath : "/" + rawPath;

      const headers = { Accept: "application/json, image/*, video/*" };
      if (server.token) headers.Authorization = "Bearer " + server.token;

      let res;
      if (attachments.length) {
        const form = new FormData();
        form.append("prompt", prompt);
        form.append("mode", isPhoto ? "photo" : "video");
        form.append("duration", String(duration));
        form.append("aspect_ratio", isPhoto ? "1:1" : aspect);
        form.append("watermark", "false");
        form.append("add_ai_label", "false");
        form.append("clean_export", Store.getCleanExport() ? "true" : "false");
        for (let i = 0; i < attachments.length; i++) {
          const a = attachments[i];
          const blob = await (await fetch(a.dataUrl)).blob();
          form.append("files", blob, a.name || "upload-" + i);
          form.append("reference", blob, a.name || "upload-" + i);
        }
        res = await fetch(server.url + path, {
          method: "POST",
          headers,
          body: form,
          mode: "cors",
        });
      } else {
        headers["Content-Type"] = "application/json";
        res = await fetch(server.url + path, {
          method: "POST",
          headers,
          body: JSON.stringify({
            prompt,
            mode: isPhoto ? "photo" : "video",
            duration,
            aspect_ratio: isPhoto ? "1:1" : aspect,
            watermark: false,
            add_ai_label: false,
            clean_export: Store.getCleanExport(),
          }),
          mode: "cors",
        });
      }

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error("GPU generate failed (" + res.status + "): " + (text || res.statusText));
      }

      const ct = res.headers.get("content-type") || "";
      if (ct.includes("application/json")) {
        const data = await res.json();
        return {
          kind: isPhoto ? "photo" : "video",
          url: data.url || data.video_url || data.image_url || data.output || null,
          data,
        };
      }
      const blob = await res.blob();
      return { kind: isPhoto ? "photo" : "video", url: URL.createObjectURL(blob), data: null };
    },

    // legacy alias
    generateVideo(opts) {
      return Store.generate({ ...opts, mode: "video" });
    },

    fileToDataUrl,

    listChats() {
      return load().chats;
    },

    getActiveChat() {
      const s = load();
      return s.chats.find((c) => c.id === s.activeChatId) || null;
    },

    newChat() {
      const s = load();
      const chat = {
        id: uid(),
        title: "New chat",
        createdAt: Date.now(),
        messages: [],
      };
      s.chats.unshift(chat);
      s.activeChatId = chat.id;
      save(s);
      return chat;
    },

    setActiveChat(id) {
      const s = load();
      s.activeChatId = id;
      save(s);
    },

    deleteChat(id) {
      const s = load();
      s.chats = s.chats.filter((c) => c.id !== id);
      if (s.activeChatId === id) {
        s.activeChatId = s.chats[0]?.id || null;
      }
      save(s);
    },

    appendMessage(chatId, msg) {
      const s = load();
      const chat = s.chats.find((c) => c.id === chatId);
      if (!chat) return null;
      chat.messages.push({ id: uid(), createdAt: Date.now(), ...msg });
      if ((chat.title === "New chat" || chat.title === "New video chat") && msg.role === "user") {
        chat.title = String(msg.content || "Chat").slice(0, 42) || "Chat";
      }
      save(s);
      return chat;
    },
  };

  global.VidChatStore = Store;
})(window);

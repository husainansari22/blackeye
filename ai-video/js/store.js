/**
 * GPU server + chat persistence (local only).
 * Paste your rented GPU base URL, save, then Deploy to make it active.
 */
(function (global) {
  const KEY = "vidchat.v1";

  const defaults = {
    servers: [],
    activeId: null,
    cleanExport: true,
    chats: [],
    activeChatId: null,
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

  const Store = {
    get() {
      return load();
    },

    getActiveServer() {
      const s = load();
      return s.servers.find((x) => x.id === s.activeId) || null;
    },

    listServers() {
      return load().servers;
    },

    upsertServer({ id, name, url, token, healthPath, generatePath, streamPath }) {
      const s = load();
      const entry = {
        id: id || uid(),
        name: (name || "GPU Server").trim() || "GPU Server",
        url: normalizeUrl(url),
        token: (token || "").trim(),
        healthPath: (healthPath || "/health").trim() || "/health",
        generatePath: (generatePath || "/v1/generate").trim() || "/v1/generate",
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

    /** Deploy = mark as active endpoint for generation */
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

    async generateVideo({ prompt, duration = 4, aspect = "9:16" }) {
      const server = Store.getActiveServer();
      if (!server) throw new Error("No GPU server deployed. Open GPU Servers and Deploy one.");

      const path = server.generatePath.startsWith("/")
        ? server.generatePath
        : "/" + server.generatePath;
      const headers = {
        "Content-Type": "application/json",
        Accept: "application/json",
      };
      if (server.token) headers.Authorization = "Bearer " + server.token;

      const body = {
        prompt,
        duration,
        aspect_ratio: aspect,
        // Clean export: do not request watermark / AI label overlays from your worker
        watermark: false,
        add_ai_label: false,
        clean_export: Store.getCleanExport(),
      };

      const res = await fetch(server.url + path, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        mode: "cors",
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error("GPU generate failed (" + res.status + "): " + (text || res.statusText));
      }

      const ct = res.headers.get("content-type") || "";
      if (ct.includes("application/json")) {
        const data = await res.json();
        return {
          url: data.url || data.video_url || data.output || null,
          data,
        };
      }
      const blob = await res.blob();
      return { url: URL.createObjectURL(blob), data: null };
    },

    streamUrl() {
      const server = Store.getActiveServer();
      if (!server) return null;
      const path = server.streamPath.startsWith("/")
        ? server.streamPath
        : "/" + server.streamPath;
      return server.url + path;
    },

    // —— chats ——
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
        title: "New video chat",
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

    appendMessage(chatId, msg) {
      const s = load();
      const chat = s.chats.find((c) => c.id === chatId);
      if (!chat) return null;
      chat.messages.push({ id: uid(), createdAt: Date.now(), ...msg });
      if (chat.title === "New video chat" && msg.role === "user") {
        chat.title = String(msg.content || "").slice(0, 42) || "Video chat";
      }
      save(s);
      return chat;
    },
  };

  global.VidChatStore = Store;
})(window);

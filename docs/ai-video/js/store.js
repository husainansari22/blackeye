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

    upsertServer({ id, name, url, token, healthPath, generatePath, imagePath, animatePath, streamPath }) {
      const s = load();
      const entry = {
        id: id || uid(),
        name: (name || "GPU Server").trim() || "GPU Server",
        url: normalizeUrl(url),
        token: (token || "").trim(),
        healthPath: (healthPath || "/health").trim() || "/health",
        generatePath: (generatePath || "/generate").trim() || "/generate",
        imagePath: (imagePath || "/generate/sync").trim() || "/generate/sync",
        animatePath: (animatePath || "/v1/animate").trim() || "/v1/animate",
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

    isMixedContentUrl(url) {
      const base = (url || "").trim();
      return (
        typeof location !== "undefined" &&
        location.protocol === "https:" &&
        /^http:\/\//i.test(base)
      );
    },

    /** user:pass → Basic, otherwise Bearer */
    authHeader(token) {
      const t = (token || "").trim();
      if (!t) return "";
      if (t.includes(":") && !/^Bearer\s/i.test(t) && !/^Basic\s/i.test(t)) {
        try {
          return "Basic " + btoa(t);
        } catch {
          return "Bearer " + t;
        }
      }
      if (/^Bearer\s|^Basic\s/i.test(t)) return t;
      return "Bearer " + t;
    },

    async ping(server) {
      const base = (server.url || "").replace(/\/+$/, "");
      if (!base) return { ok: false, status: 0, error: "missing_url" };

      // Phone site is HTTPS — browsers block http:// GPU URLs (mixed content)
      if (Store.isMixedContentUrl(base)) {
        return {
          ok: false,
          status: 0,
          error: "mixed_content",
          message:
            "Stop using http://162… — tap Vast → Open and paste the https:// link instead.",
        };
      }

      const candidates = [];
      const custom = (server.healthPath || "/health").trim() || "/health";
      candidates.push(custom.startsWith("/") ? custom : "/" + custom);
      // ComfyUI + common worker fallbacks
      for (const p of ["/", "/system_stats", "/health", "/ready"]) {
        if (!candidates.includes(p)) candidates.push(p);
      }

      const headers = {};
      if (server.token) headers.Authorization = Store.authHeader(server.token);

      let lastErr = "unreachable";
      for (const path of candidates) {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 6000);
        try {
          const res = await fetch(base + path, {
            method: "GET",
            headers,
            signal: ctrl.signal,
            mode: "cors",
          });
          if (res.ok || res.status === 401 || res.status === 403) {
            return { ok: true, status: res.status, path };
          }
          lastErr = "http_" + res.status;
        } catch (err) {
          const msg = String(err && err.message ? err.message : err || "");
          if (
            err.name === "AbortError" ||
            /aborted|abort/i.test(msg) ||
            /Failed to fetch|NetworkError|Load failed/i.test(msg)
          ) {
            lastErr = "timeout";
          } else {
            lastErr = msg || "unreachable";
          }
        } finally {
          clearTimeout(t);
        }
      }
      return { ok: false, status: 0, error: lastErr };
    },

    _headers(server) {
      const headers = {
        Accept: "application/json",
        "Content-Type": "application/json",
      };
      if (server.token) headers.Authorization = Store.authHeader(server.token);
      return headers;
    },

    _outputToUrl(item) {
      if (!item) return null;
      if (item.url) return item.url;
      if (item.data) {
        const mime =
          item.mime ||
          (String(item.filename || "").endsWith(".mp4")
            ? "video/mp4"
            : String(item.filename || "").endsWith(".webp")
              ? "image/webp"
              : "image/png");
        return "data:" + mime + ";base64," + item.data;
      }
      return null;
    },

    async _waitResult(server, requestId, timeoutMs) {
      const base = server.url.replace(/\/+$/, "");
      const headers = Store._headers(server);
      const start = Date.now();
      while (Date.now() - start < timeoutMs) {
        const res = await fetch(base + "/result/" + encodeURIComponent(requestId), {
          method: "GET",
          headers,
          mode: "cors",
        });
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new Error("GPU result failed (" + res.status + "): " + (text || res.statusText));
        }
        const data = await res.json();
        const status = String(data.status || "").toLowerCase();
        if (status === "completed" || status === "success") return data;
        if (status === "failed" || status === "error") {
          throw new Error(data.message || "Generation failed on GPU");
        }
        await new Promise((r) => setTimeout(r, 2000));
      }
      throw new Error("GPU timed out waiting for result");
    },

    _photoSize(aspect) {
      const a = String(aspect || "1:1");
      if (a === "16:9") return { width: 1024, height: 576 };
      if (a === "9:16") return { width: 576, height: 1024 };
      if (a === "4:3") return { width: 896, height: 672 };
      return { width: 768, height: 768 };
    },

    _normPath(raw, fallback) {
      const p = ((raw || fallback || "") + "").trim() || fallback;
      return p.startsWith("/") ? p : "/" + p;
    },

    /**
     * Generate via Vast ComfyUI API Wrapper.
     * Photo → POST /generate/sync (Text2Image). Video → POST /generate + poll /result.
     */
    async generate({ prompt, mode = "video", attachments = [], duration = 4, aspect = "9:16" }) {
      const server = Store.getActiveServer();
      if (!server) throw new Error("No GPU server deployed. Open GPU Servers and Deploy one.");

      const isPhoto = mode === "photo";
      const base = server.url.replace(/\/+$/, "");
      const headers = Store._headers(server);
      const requestId =
        (crypto.randomUUID && crypto.randomUUID()) ||
        "req-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8);

      let payload;
      let path;
      if (isPhoto) {
        const size = Store._photoSize(aspect === "9:16" ? "1:1" : aspect);
        let text = prompt || "a photo";
        if (attachments && attachments[0] && String(attachments[0].type || "").startsWith("image/")) {
          text = (prompt || "same subject") + ", photorealistic";
        }
        path = Store._normPath(server.imagePath, "/generate/sync");
        payload = {
          input: {
            request_id: requestId,
            modifier: "Text2Image",
            modifications: {
              prompt: text,
              negative_prompt: Store.getCleanExport()
                ? "blurry, low quality, watermark, text, logo"
                : "blurry, low quality",
              seed: "__RANDOM_INT__",
              steps: 20,
              cfg_scale: 7.5,
              width: size.width,
              height: size.height,
              sampler_name: "dpmpp_2m",
            },
            return_outputs_as_base64: true,
          },
        };
      } else {
        const wfRes = await fetch("js/wan_t2v_workflow.json?v=6", { cache: "no-store" });
        if (!wfRes.ok) throw new Error("Could not load video workflow");
        const workflow = await wfRes.json();
        if (workflow["6"] && workflow["6"].inputs) {
          workflow["6"].inputs.text = prompt || "cinematic video";
        }
        if (workflow["7"] && workflow["7"].inputs) {
          workflow["7"].inputs.text = Store.getCleanExport()
            ? "watermark, text, logo, blurry, low quality, static"
            : workflow["7"].inputs.text;
        }
        if (workflow["49"] && workflow["49"].inputs && duration) {
          // Wan VACE length ≈ frames; ~16 fps → ~16*seconds (+1 odd)
          const frames = Math.max(17, Math.min(81, Math.round(Number(duration) * 16) | 1));
          workflow["49"].inputs.length = frames;
        }
        path = Store._normPath(server.generatePath, "/generate");
        payload = {
          input: {
            request_id: requestId,
            workflow_json: workflow,
            return_outputs_as_base64: true,
          },
        };
      }

      const res = await fetch(base + path, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
        mode: "cors",
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error("GPU generate failed (" + res.status + "): " + (text || res.statusText));
      }
      let data = await res.json();
      const status = String(data.status || "").toLowerCase();
      if (!isPhoto || (status && status !== "completed" && status !== "success")) {
        const id = data.id || requestId;
        if (!isPhoto || status === "pending" || status === "processing" || status === "queued") {
          data = await Store._waitResult(server, id, isPhoto ? 180000 : 600000);
        }
      }
      const outputs = data.output || [];
      const url = Store._outputToUrl(outputs[0]);
      return { kind: isPhoto ? "photo" : "video", url, data };
    },

    // legacy alias
    generateVideo(opts) {
      return Store.generate({ ...opts, mode: "video" });
    },

    /**
     * Realistic Animate / Replace — source image + reference video.
     */
    async animate({
      sourceImage,
      referenceVideo,
      mode = "animate",
      resolution = "720p",
      seed = -1,
      prompt = "",
    }) {
      const server = Store.getActiveServer();
      if (!server) throw new Error("No GPU server deployed. Open GPU Servers and Deploy one.");

      const rawPath = server.animatePath || "/v1/animate";
      const path = rawPath.startsWith("/") ? rawPath : "/" + rawPath;
      const headers = { Accept: "application/json, video/*" };
      if (server.token) headers.Authorization = Store.authHeader(server.token);

      const form = new FormData();
      form.append("mode", mode === "replace" ? "replace" : "animate");
      form.append("resolution", resolution);
      form.append("seed", String(seed));
      form.append("prompt", prompt || "");
      form.append("watermark", "false");
      form.append("add_ai_label", "false");
      form.append("clean_export", Store.getCleanExport() ? "true" : "false");

      const imgBlob = await (await fetch(sourceImage.dataUrl)).blob();
      const vidBlob = await (await fetch(referenceVideo.dataUrl)).blob();
      form.append("source_image", imgBlob, sourceImage.name || "source.jpg");
      form.append("reference_video", vidBlob, referenceVideo.name || "reference.mp4");

      const res = await fetch(server.url + path, {
        method: "POST",
        headers,
        body: form,
        mode: "cors",
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error("Animate failed (" + res.status + "): " + (text || res.statusText));
      }

      const ct = res.headers.get("content-type") || "";
      if (ct.includes("application/json")) {
        const data = await res.json();
        return {
          kind: "video",
          url: data.url || data.video_url || data.output || null,
          data,
        };
      }
      const blob = await res.blob();
      return { kind: "video", url: URL.createObjectURL(blob), data: null };
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

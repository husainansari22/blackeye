(function (global) {
  function $(sel, root) {
    return (root || document).querySelector(sel);
  }

  function toast(msg) {
    let el = $("#toast");
    if (!el) {
      el = document.createElement("div");
      el.id = "toast";
      el.className = "status-toast";
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove("show"), 2600);
  }

  function renderServerList(listEl) {
    const servers = VidChatStore.listServers();
    const active = VidChatStore.getActiveServer();
    if (!servers.length) {
      listEl.innerHTML =
        '<p style="font-size:13px;color:var(--text-dim);padding:4px 0">No servers saved yet. Paste your rented GPU URL above, Save, then Deploy.</p>';
      return;
    }
    listEl.innerHTML = servers
      .map((s) => {
        const isActive = active && active.id === s.id;
        return `
        <div class="server-card ${isActive ? "active" : ""}" data-id="${s.id}">
          <div class="info">
            <strong>${escapeHtml(s.name)}${isActive ? " · Deployed" : ""}</strong>
            <span>${escapeHtml(s.url)}</span>
          </div>
          <button class="btn btn-secondary" data-act="deploy" style="padding:8px 10px;font-size:12px">Deploy</button>
          <button class="btn btn-danger" data-act="delete" style="padding:8px 10px;font-size:12px">✕</button>
        </div>`;
      })
      .join("");

    listEl.querySelectorAll(".server-card").forEach((card) => {
      const id = card.getAttribute("data-id");
      card.querySelector('[data-act="deploy"]').onclick = async () => {
        try {
          const server = VidChatStore.deploy(id);
          toast("Deployed: " + server.name);
          refreshGpuUi();
          renderServerList(listEl);
          const ping = await VidChatStore.ping(server);
          toast(
            ping.ok
              ? "GPU online · health " + ping.status
              : "Saved & deployed, but health check failed (CORS or offline). You can still try generating."
          );
        } catch (e) {
          toast(e.message);
        }
      };
      card.querySelector('[data-act="delete"]').onclick = () => {
        VidChatStore.removeServer(id);
        refreshGpuUi();
        renderServerList(listEl);
        toast("Server removed");
      };
    });
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function refreshGpuUi() {
    const active = VidChatStore.getActiveServer();
    document.querySelectorAll("[data-gpu-dot]").forEach((el) => {
      el.classList.toggle("on", !!active);
    });
    document.querySelectorAll("[data-gpu-name]").forEach((el) => {
      el.textContent = active ? active.name : "No GPU deployed";
    });
    document.querySelectorAll("[data-gpu-url]").forEach((el) => {
      el.textContent = active ? active.url : "Import a server to start";
    });
  }

  function openModal() {
    const modal = $("#gpu-modal");
    if (!modal) return;
    modal.classList.add("show");
    $("#clean-export").checked = VidChatStore.getCleanExport();
    renderServerList($("#server-list"));
    refreshGpuUi();
  }

  function closeModal() {
    $("#gpu-modal")?.classList.remove("show");
  }

  function wire() {
    document.querySelectorAll("[data-open-gpu]").forEach((btn) => {
      btn.addEventListener("click", openModal);
    });
    $("#gpu-close")?.addEventListener("click", closeModal);
    $("#gpu-modal")?.addEventListener("click", (e) => {
      if (e.target.id === "gpu-modal") closeModal();
    });

    $("#gpu-save")?.addEventListener("click", () => {
      try {
        const entry = VidChatStore.upsertServer({
          name: $("#gpu-name").value,
          url: $("#gpu-url").value,
          token: $("#gpu-token").value,
          healthPath: $("#gpu-health").value || "/health",
          generatePath: $("#gpu-generate").value || "/v1/generate",
          streamPath: $("#gpu-stream").value || "/v1/stream",
        });
        toast("Saved " + entry.name);
        $("#gpu-url").value = entry.url;
        renderServerList($("#server-list"));
        refreshGpuUi();
      } catch (e) {
        toast(e.message);
      }
    });

    $("#gpu-save-deploy")?.addEventListener("click", async () => {
      try {
        const entry = VidChatStore.upsertServer({
          name: $("#gpu-name").value,
          url: $("#gpu-url").value,
          token: $("#gpu-token").value,
          healthPath: $("#gpu-health").value || "/health",
          generatePath: $("#gpu-generate").value || "/v1/generate",
          streamPath: $("#gpu-stream").value || "/v1/stream",
        });
        VidChatStore.deploy(entry.id);
        toast("Saved & deployed");
        renderServerList($("#server-list"));
        refreshGpuUi();
        const ping = await VidChatStore.ping(entry);
        if (ping.ok) toast("GPU online · ready to generate");
        else toast("Deployed. Health unreachable from browser (check CORS on your GPU API).");
      } catch (e) {
        toast(e.message);
      }
    });

    $("#clean-export")?.addEventListener("change", (e) => {
      VidChatStore.setCleanExport(e.target.checked);
      toast(e.target.checked ? "Clean export on" : "Clean export off");
    });

    refreshGpuUi();
  }

  function modalHtml() {
    return `
<div class="modal" id="gpu-modal" role="dialog" aria-modal="true" aria-labelledby="gpu-title">
  <div class="modal-sheet">
    <div class="modal-hdr">
      <h2 id="gpu-title">GPU Servers</h2>
      <button class="icon-btn" id="gpu-close" aria-label="Close">✕</button>
    </div>
    <p class="modal-sub">
      Manually import the link to your rented GPU worker, save it, then Deploy.
      Generation traffic goes only to the server you deploy — nothing is locked to one host.
    </p>

    <div class="field">
      <label for="gpu-name">Display name</label>
      <input id="gpu-name" placeholder="RunPod A100 / Vast / Local 4090" autocomplete="off" />
    </div>
    <div class="field">
      <label for="gpu-url">GPU server URL</label>
      <input id="gpu-url" type="url" inputmode="url" placeholder="https://xxxx-8000.proxy.runpod.net" autocomplete="off" />
      <p class="hint">Base URL only. Paths below are appended when calling health / generate / stream.</p>
    </div>
    <div class="field">
      <label for="gpu-token">Auth token (optional)</label>
      <input id="gpu-token" type="password" placeholder="Bearer token if your API requires it" autocomplete="off" />
    </div>
    <div class="field">
      <label for="gpu-health">Health path</label>
      <input id="gpu-health" placeholder="/health" value="/health" />
    </div>
    <div class="field">
      <label for="gpu-generate">Generate path (Chat)</label>
      <input id="gpu-generate" placeholder="/v1/generate" value="/v1/generate" />
    </div>
    <div class="field">
      <label for="gpu-stream">Stream path (Live Studio)</label>
      <input id="gpu-stream" placeholder="/v1/stream" value="/v1/stream" />
    </div>

    <div class="toggle-row">
      <div>
        <strong style="font-size:14px">Clean export</strong>
        <p>Do not add watermarks or “AI generated” overlays from this app when requesting video from your GPU.</p>
      </div>
      <label class="switch">
        <input type="checkbox" id="clean-export" checked />
        <span></span>
      </label>
    </div>

    <div class="btn-row">
      <button class="btn btn-secondary" id="gpu-save">Save</button>
      <button class="btn btn-primary" id="gpu-save-deploy">Save &amp; Deploy</button>
    </div>

    <div class="chat-list-label" style="padding-left:0;margin-top:8px">Saved servers</div>
    <div class="server-list" id="server-list"></div>
  </div>
</div>`;
  }

  function inject() {
    if (!$("#gpu-modal")) {
      document.body.insertAdjacentHTML("beforeend", modalHtml());
    }
    if (!$("#toast")) {
      document.body.insertAdjacentHTML(
        "beforeend",
        '<div class="status-toast" id="toast"></div>'
      );
    }
    wire();
  }

  global.VidChatGpuPanel = { inject, open: openModal, close: closeModal, refresh: refreshGpuUi, toast };
})(window);

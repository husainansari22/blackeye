(function (global) {
  function $(sel, root) {
    return (root || document).querySelector(sel);
  }

  let sourceImage = null; // { name, type, dataUrl }
  let referenceVideo = null;
  let onGenerate = null;

  function modalHtml() {
    return `
<div class="animate-modal" id="animate-modal" role="dialog" aria-modal="true" aria-labelledby="anim-title">
  <div class="animate-sheet">
    <div class="anim-hdr">
      <div class="anim-logo" aria-hidden="true">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3l3 6 6 .5-4.5 4 1.5 6.5L12 17l-6 3.5L7.5 14 3 9.5 9 9z"/></svg>
      </div>
      <div style="min-width:0;flex:1">
        <h2 id="anim-title">Realistic Animate</h2>
        <div class="anim-tags">
          <span class="anim-tag mc">Motion Control</span>
          <span class="anim-tag dur">5–120s</span>
          <span class="anim-tag fast">Fast</span>
          <span class="anim-tag real">Realistic</span>
          <span class="anim-tag char">Character</span>
        </div>
      </div>
      <button type="button" class="anim-close" id="anim-close" aria-label="Close">✕</button>
    </div>

    <div class="anim-sec">
      <div class="anim-sec-label">Files</div>
      <button type="button" class="upload-tile" id="anim-source-btn">
        <div class="clip" id="anim-source-preview">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
        </div>
        <div class="meta">
          <strong>Source Image<span class="req">*</span></strong>
          <span id="anim-source-hint">JPEG or PNG, clear character image preferred</span>
        </div>
      </button>
      <input type="file" id="anim-source-input" accept="image/jpeg,image/png,image/jpg" hidden />

      <button type="button" class="upload-tile" id="anim-ref-btn">
        <div class="clip" id="anim-ref-preview">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
        </div>
        <div class="meta">
          <strong>Reference Video<span class="req">*</span></strong>
          <span id="anim-ref-hint">MP4 or MOV — motion you want to transfer</span>
        </div>
      </button>
      <input type="file" id="anim-ref-input" accept="video/mp4,video/quicktime,video/*" hidden />
    </div>

    <div class="anim-sec">
      <div class="anim-sec-label">Settings</div>
      <div class="anim-row">
        <label for="anim-mode">Mode</label>
        <select id="anim-mode">
          <option value="animate" selected>Animate</option>
          <option value="replace">Replace</option>
        </select>
      </div>
      <div class="anim-row">
        <label for="anim-res">Resolution</label>
        <select id="anim-res">
          <option value="480p">480p</option>
          <option value="720p" selected>720p</option>
          <option value="1080p">1080p</option>
        </select>
      </div>
      <div class="anim-row">
        <label for="anim-seed">Seed</label>
        <div class="anim-seed-wrap">
          <input id="anim-seed" type="number" value="-1" step="1" />
          <button type="button" class="icon-btn" id="anim-seed-rand" title="Randomize" aria-label="Randomize seed">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 3h5v5M4 20L21 3M21 16v5h-5M4 4l5 5"/></svg>
          </button>
        </div>
      </div>
    </div>

    <div class="anim-sec">
      <div class="anim-sec-label">Prompt</div>
      <textarea id="anim-prompt" class="anim-prompt" placeholder="Optional guidance (e.g. ‘natural expression’, ‘keep face identity’)"></textarea>
    </div>

    <div class="anim-footer">
      <button type="button" class="anim-back" id="anim-back">← Back</button>
      <button type="button" class="anim-gen" id="anim-generate" disabled>
        Generate
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l1.5 5.5L19 9l-5.5 1.5L12 16l-1.5-5.5L5 9l5.5-1.5L12 2z"/></svg>
      </button>
    </div>
  </div>
</div>`;
  }

  function refreshTiles() {
    const srcBtn = $("#anim-source-btn");
    const refBtn = $("#anim-ref-btn");
    const srcPrev = $("#anim-source-preview");
    const refPrev = $("#anim-ref-preview");
    const srcHint = $("#anim-source-hint");
    const refHint = $("#anim-ref-hint");

    if (sourceImage) {
      srcBtn.classList.add("has-file");
      srcPrev.innerHTML = `<img src="${sourceImage.dataUrl}" alt="" />`;
      srcHint.textContent = sourceImage.name;
    } else {
      srcBtn.classList.remove("has-file");
      srcPrev.innerHTML =
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>';
      srcHint.textContent = "JPEG or PNG, clear character image preferred";
    }

    if (referenceVideo) {
      refBtn.classList.add("has-file");
      refPrev.innerHTML = `<video src="${referenceVideo.dataUrl}" muted></video>`;
      refHint.textContent = referenceVideo.name;
    } else {
      refBtn.classList.remove("has-file");
      refPrev.innerHTML =
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>';
      refHint.textContent = "MP4 or MOV — motion you want to transfer";
    }

    $("#anim-generate").disabled = !(sourceImage && referenceVideo);
  }

  function close() {
    $("#animate-modal")?.classList.remove("show");
  }

  function open() {
    $("#animate-modal")?.classList.add("show");
    refreshTiles();
  }

  async function readFile(file, kind) {
    if (kind === "image") {
      if (!/^image\/(jpeg|jpg|png)$/i.test(file.type) && !/\.(jpe?g|png)$/i.test(file.name)) {
        VidChatGpuPanel.toast("Use JPEG or PNG for source image");
        return null;
      }
    }
    if (kind === "video") {
      if (!file.type.startsWith("video/") && !/\.(mp4|mov|webm)$/i.test(file.name)) {
        VidChatGpuPanel.toast("Use MP4 or MOV for reference video");
        return null;
      }
      if (file.size > 100 * 1024 * 1024) {
        VidChatGpuPanel.toast("Reference video max 100MB");
        return null;
      }
    }
    const dataUrl = await VidChatStore.fileToDataUrl(file);
    return { name: file.name, type: file.type, dataUrl };
  }

  function wire() {
    $("#anim-close")?.addEventListener("click", close);
    $("#anim-back")?.addEventListener("click", close);
    $("#animate-modal")?.addEventListener("click", (e) => {
      if (e.target.id === "animate-modal") close();
    });

    $("#anim-source-btn")?.addEventListener("click", () => $("#anim-source-input").click());
    $("#anim-ref-btn")?.addEventListener("click", () => $("#anim-ref-input").click());

    $("#anim-source-input")?.addEventListener("change", async () => {
      const file = $("#anim-source-input").files?.[0];
      $("#anim-source-input").value = "";
      if (!file) return;
      sourceImage = await readFile(file, "image");
      refreshTiles();
    });

    $("#anim-ref-input")?.addEventListener("change", async () => {
      const file = $("#anim-ref-input").files?.[0];
      $("#anim-ref-input").value = "";
      if (!file) return;
      referenceVideo = await readFile(file, "video");
      refreshTiles();
    });

    $("#anim-seed-rand")?.addEventListener("click", () => {
      $("#anim-seed").value = String(Math.floor(Math.random() * 2147483647));
    });

    $("#anim-generate")?.addEventListener("click", async () => {
      if (!sourceImage || !referenceVideo) {
        VidChatGpuPanel.toast("Add source image and reference video");
        return;
      }
      const payload = {
        sourceImage,
        referenceVideo,
        mode: $("#anim-mode").value || "animate",
        resolution: $("#anim-res").value || "720p",
        seed: Number($("#anim-seed").value || -1),
        prompt: ($("#anim-prompt").value || "").trim(),
      };
      close();
      if (typeof onGenerate === "function") await onGenerate(payload);
    });
  }

  function inject(handlers) {
    onGenerate = handlers?.onGenerate || null;
    if (!$("#animate-modal")) {
      document.body.insertAdjacentHTML("beforeend", modalHtml());
      wire();
    }
  }

  global.VidChatAnimate = { inject, open, close };
})(window);

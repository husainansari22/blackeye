/**
 * Acctventa Business KYC — multi-step business verification wizard.
 */
(function (global) {
  const STEPS = ['intro', 'business', 'contact', 'ownership', 'documents', 'review'];
  let step = 0;
  let state = emptyState();
  let statusCache = null;
  let navAbort = null;
  let lastFieldFocusAt = 0;
  let lastValidateToastAt = 0;
  let navLockedUntil = 0;
  let navLockTimer = null;

  function emptyState() {
    return {
      businessName: '',
      businessUsername: '',
      registrationNumber: '',
      businessType: '',
      industry: '',
      businessAddress: '',
      contactPerson: '',
      contactTitle: '',
      contactEmail: '',
      contactPhone: '',
      ownerName: '',
      ownershipPct: '100',
      ownerAddress: '',
      ownerDob: '',
      documents: {},
    };
  }

  function toast(msg, type) {
    if (global.AcctventaToast) global.AcctventaToast.show(msg, { type: type || 'info' });
    else alert(msg);
  }

  function toastOnce(msg, type, cooldownMs) {
    const now = Date.now();
    if (now - lastValidateToastAt < (cooldownMs || 900)) return;
    lastValidateToastAt = now;
    toast(msg, type);
  }

  function overlay() {
    return document.getElementById('kycOverlay');
  }

  function bodyEl() {
    return document.getElementById('kycFlowBody');
  }

  function footerEl() {
    return document.getElementById('kycFlowFooter');
  }

  function stepLabel() {
    return document.getElementById('kycStepText');
  }

  function setFooter(html) {
    const foot = footerEl();
    if (!foot) return;
    if (html) {
      foot.innerHTML = html;
      foot.classList.remove('hidden');
      foot.classList.remove('kyc-flow-footer--locked');
    } else {
      foot.innerHTML = '';
      foot.classList.add('hidden');
      foot.classList.remove('kyc-flow-footer--locked');
    }
  }

  function setFooterLocked(locked) {
    const foot = footerEl();
    if (!foot || foot.classList.contains('hidden')) return;
    foot.classList.toggle('kyc-flow-footer--locked', !!locked);
  }

  /** Block Back/Continue while the keyboard opens (iOS ghost-clicks the footer). */
  function lockNav(ms) {
    const hold = Math.max(800, ms || 1100);
    navLockedUntil = Math.max(navLockedUntil, Date.now() + hold);
    lastFieldFocusAt = Date.now();
    setFooterLocked(true);
    clearTimeout(navLockTimer);
    // Re-enable hit targets after the keyboard/layout shift settles (keep time-guard on click).
    navLockTimer = setTimeout(() => {
      setFooterLocked(false);
    }, hold);
  }

  function navIsLocked() {
    return Date.now() < navLockedUntil;
  }

  function isFieldTarget(t) {
    if (!t || !t.closest) return false;
    return !!(t.closest('.kyc-field') || (t.matches && t.matches('input, textarea, select')));
  }

  async function refreshStatus() {
    statusCache = { isVerified: false, kycStatus: 'none', submission: null };
    try {
      const A = global.Acctventa;
      const u = A && A.getCurrentUser && A.getCurrentUser();
      if (u && u.isVerified) {
        statusCache = { isVerified: true, kycStatus: 'verified', submission: null };
      }
      if (global.AcctventaApi && (await global.AcctventaApi.isAvailable()) && global.AcctventaApi.getToken()) {
        const res = await global.AcctventaApi.kycStatus();
        statusCache = {
          isVerified: !!res.isVerified,
          kycStatus: res.kycStatus || 'none',
          submission: res.submission || null,
        };
        if (u) {
          u.isVerified = statusCache.isVerified;
          u.kycStatus = statusCache.kycStatus;
          if (A.persistUser) A.persistUser(u);
        }
      }
    } catch (e) {}
    updateSidebarButton();
    return statusCache;
  }

  function updateSidebarButton() {
    const btn = document.getElementById('leftBecomeVerifiedBtn');
    if (!btn) return;
    const st = statusCache || {};
    btn.classList.remove('hidden');
    if (st.isVerified || st.kycStatus === 'verified') {
      btn.innerHTML = '<i class="fa-solid fa-circle-check mr-1"></i> Verified business';
      btn.className =
        'kyc-side-btn border border-emerald-500/50 text-emerald-500 text-xs px-4 py-1.5 rounded-md font-medium bg-emerald-500/10';
      btn.onclick = () => openKyc();
    } else if (['needs_review', 'blurry_review', 'pending'].includes(st.kycStatus)) {
      btn.textContent = 'Verification in review';
      btn.className =
        'kyc-side-btn border border-amber-500/50 text-amber-500 text-xs px-4 py-1.5 rounded-md font-medium bg-amber-500/10';
      btn.onclick = () => openKyc();
    } else if (st.kycStatus === 'rejected') {
      btn.textContent = 'Resubmit Business KYC';
      btn.className =
        'kyc-side-btn border border-brandPrimary text-brandPrimary text-xs px-4 py-1.5 rounded-md font-medium bg-transparent hover:bg-brandPrimary/10 transition';
      btn.onclick = () => {
        openKyc(true);
      };
    } else {
      btn.textContent = 'Become Verified';
      btn.className =
        'kyc-side-btn border border-brandPrimary text-brandPrimary text-xs px-4 py-1.5 rounded-md font-medium bg-transparent hover:bg-brandPrimary/10 transition';
      btn.onclick = () => {
        openKyc();
      };
    }
  }

  /** Client DocScan — EXIF + Laplacian blur + screenshot heuristics */
  async function analyzeImageFile(file) {
    const result = {
      fromCameraCapture: false,
      hasExif: false,
      suspectedScreenshot: false,
      blurScore: null,
      width: 0,
      height: 0,
      flags: [],
    };
    if (!file || !file.type.startsWith('image/')) return result;

    // captureInput with capture="environment" sets a hint
    if (file.name && /^(image|IMG_|DSC_|PXL_|MVIMG)/i.test(file.name) && !/screenshot/i.test(file.name)) {
      result.flags.push('Camera-style filename');
    }
    if (/screenshot|screen.?shot|snipping/i.test(file.name || '')) {
      result.suspectedScreenshot = true;
      result.flags.push('Filename suggests screenshot');
    }

    const bitmap = await createImageBitmap(file).catch(() => null);
    if (bitmap) {
      result.width = bitmap.width;
      result.height = bitmap.height;
      const sizes = [
        [1170, 2532],
        [1284, 2778],
        [1125, 2436],
        [1080, 2400],
        [1080, 2340],
        [750, 1334],
      ];
      for (const [sw, sh] of sizes) {
        if ((result.width === sw && result.height === sh) || (result.width === sh && result.height === sw)) {
          result.suspectedScreenshot = true;
          result.flags.push('Screenshot resolution');
          break;
        }
      }
      result.blurScore = await laplacianFromBitmap(bitmap);
      bitmap.close();
    }

    // JPEG EXIF via FileReader + simple APP1 scan for Make/Model
    if (/jpe?g/i.test(file.type) || /\.jpe?g$/i.test(file.name || '')) {
      const buf = await file.arrayBuffer();
      const view = new DataView(buf);
      const text = new TextDecoder('ascii').decode(new Uint8Array(buf.slice(0, Math.min(buf.byteLength, 65536))));
      if (/Exif/i.test(text) && (/Make|Model|DateTimeOriginal/i.test(text) || view.byteLength > 500)) {
        result.hasExif = /Make|Model|DateTimeOriginal/i.test(text);
        if (result.hasExif) result.flags.push('EXIF present');
      }
      if (/Screenshot|Snagit|Lightshot|ShareX/i.test(text)) {
        result.suspectedScreenshot = true;
        result.flags.push('Editor software in metadata');
      }
    }

    return result;
  }

  async function laplacianFromBitmap(bitmap) {
    const tw = Math.min(320, bitmap.width);
    const th = Math.max(8, Math.round((bitmap.height * tw) / bitmap.width));
    const canvas = document.createElement('canvas');
    canvas.width = tw;
    canvas.height = th;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0, tw, th);
    const { data } = ctx.getImageData(0, 0, tw, th);
    const gray = new Float32Array(tw * th);
    for (let i = 0, p = 0; i < data.length; i += 4, p++) {
      gray[p] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    }
    const vals = [];
    for (let y = 1; y < th - 1; y++) {
      for (let x = 1; x < tw - 1; x++) {
        const i = y * tw + x;
        vals.push(-4 * gray[i] + gray[i - 1] + gray[i + 1] + gray[i - tw] + gray[i + tw]);
      }
    }
    if (vals.length < 10) return null;
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    let v = 0;
    for (const n of vals) v += (n - mean) * (n - mean);
    return v / vals.length;
  }

  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(new Error('Could not read file'));
      r.readAsDataURL(file);
    });
  }

  async function onDocPick(key, file, fromCamera) {
    if (!file) return;
    if (file.size > 6 * 1024 * 1024) {
      toast('Max file size is 6MB', 'error');
      return;
    }
    const slot = document.querySelector(`[data-kyc-doc="${key}"]`);
    if (slot) {
      slot.classList.add('kyc-scanning');
      const status = slot.querySelector('.kyc-doc-status');
      if (status) status.textContent = 'Checking photo…';
    }
    try {
      const ai = await analyzeImageFile(file);
      if (fromCamera) {
        ai.fromCameraCapture = true;
        ai.flags.push('Device camera capture');
      }
      const data = await fileToDataUrl(file);
      let verdict = 'ok';
      let message = 'Looks like a camera photo — good for review.';
      if (ai.suspectedScreenshot && !ai.fromCameraCapture && !ai.hasExif) {
        verdict = 'reject';
        message = 'This looks like a screenshot. Please photograph the physical document.';
      } else if (ai.blurScore != null && ai.blurScore < 40) {
        verdict = 'blurry';
        message = 'Authentic but blurry — will go to manual review.';
      } else if (ai.hasExif || ai.fromCameraCapture) {
        message = 'Camera document detected. Ready to submit.';
      }
      state.documents[key] = {
        data,
        name: file.name,
        mime: file.type,
        ai: { ...ai, verdict, message },
      };
      renderDocSlot(key);
      if (verdict === 'reject') toast(message, 'error');
      else if (verdict === 'blurry') toast(message, 'info');
    } catch (e) {
      toast(e.message || 'Could not analyze document', 'error');
    } finally {
      if (slot) slot.classList.remove('kyc-scanning');
    }
  }

  function renderDocSlot(key) {
    const slot = document.querySelector(`[data-kyc-doc="${key}"]`);
    if (!slot) return;
    const doc = state.documents[key];
    const preview = slot.querySelector('.kyc-doc-preview');
    const status = slot.querySelector('.kyc-doc-status');
    const nameEl = slot.querySelector('.kyc-doc-name');
    if (!doc) {
      if (preview) preview.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i>';
      if (status) status.textContent = 'JPEG or PNG · camera photo preferred · max 6MB';
      if (nameEl) nameEl.textContent = 'No file selected';
      slot.classList.remove('kyc-doc-ok', 'kyc-doc-warn', 'kyc-doc-bad');
      return;
    }
    if (preview) {
      if ((doc.mime || '').startsWith('image/')) {
        preview.innerHTML = `<img src="${doc.data}" alt="">`;
      } else {
        preview.innerHTML = '<i class="fa-solid fa-file-pdf"></i>';
      }
    }
    if (nameEl) nameEl.textContent = doc.name || 'Document';
    const v = (doc.ai && doc.ai.verdict) || 'ok';
    slot.classList.remove('kyc-doc-ok', 'kyc-doc-warn', 'kyc-doc-bad');
    if (v === 'reject') slot.classList.add('kyc-doc-bad');
    else if (v === 'blurry') slot.classList.add('kyc-doc-warn');
    else slot.classList.add('kyc-doc-ok');
    if (status) status.textContent = (doc.ai && doc.ai.message) || 'Ready';
  }

  function field(id, label, opts = {}) {
    const req = opts.required ? '<span class="kyc-req">*</span>' : '';
    const type = opts.type || 'text';
    const ph = opts.placeholder || '';
    const val = state[id] != null ? String(state[id]) : '';
    if (type === 'textarea') {
      return `<label class="kyc-field"><span>${label}${req}</span><textarea id="kyc_${id}" rows="2" placeholder="${ph}">${escapeHtml(val)}</textarea></label>`;
    }
    if (type === 'select') {
      const optsHtml = (opts.options || [])
        .map((o) => `<option value="${escapeHtml(o)}" ${val === o ? 'selected' : ''}>${escapeHtml(o)}</option>`)
        .join('');
      return `<label class="kyc-field"><span>${label}${req}</span><select id="kyc_${id}"><option value="">Select…</option>${optsHtml}</select></label>`;
    }
    return `<label class="kyc-field"><span>${label}${req}</span><input type="${type}" id="kyc_${id}" value="${escapeHtml(val)}" placeholder="${ph}" ${opts.capture || ''}></label>`;
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function pullFields(ids) {
    ids.forEach((id) => {
      const el = document.getElementById('kyc_' + id);
      if (el) state[id] = el.value;
    });
  }

  function docCard(key, title, required) {
    return `
      <div class="kyc-doc" data-kyc-doc="${key}">
        <div class="kyc-doc-top">
          <div class="kyc-doc-preview"><i class="fa-solid fa-cloud-arrow-up"></i></div>
          <div class="min-w-0 flex-1">
            <p class="kyc-doc-title">${title}${required ? ' <span class="kyc-req">*</span>' : ''}</p>
            <p class="kyc-doc-name">No file selected</p>
            <p class="kyc-doc-status">JPEG or PNG · camera photo preferred · max 6MB</p>
          </div>
        </div>
        <div class="kyc-doc-actions">
          <label class="kyc-doc-btn">
            <input type="file" accept="image/*,application/pdf" hidden data-kyc-file="${key}">
            Gallery
          </label>
          <label class="kyc-doc-btn kyc-doc-btn-primary">
            <input type="file" accept="image/*" capture="environment" hidden data-kyc-cam="${key}">
            <i class="fa-solid fa-camera"></i> Camera
          </label>
        </div>
      </div>`;
  }

  function render() {
    const el = bodyEl();
    if (!el) return;
    if (navAbort) {
      navAbort.abort();
      navAbort = null;
    }
    setFooter('');
    const name = STEPS[step];
    if (stepLabel) {
      const map = {
        intro: 'Business KYC',
        business: 'Step 1 · Business',
        contact: 'Step 2 · Contact',
        ownership: 'Step 3 · Ownership',
        documents: 'Step 4 · Documents',
        review: 'Review & submit',
      };
      stepLabel().textContent = map[name] || 'Business KYC';
    }

    const st = statusCache || {};
    if ((st.isVerified || st.kycStatus === 'verified') && name === 'intro') {
      el.innerHTML = `
        <div class="kyc-hero">
          <div class="kyc-hero-icon kyc-hero-ok"><i class="fa-solid fa-certificate"></i></div>
          <h2>You're verified</h2>
          <p>Your business passed KYC review. Buyers see a verified badge on your store.</p>
          <button type="button" class="kyc-btn-primary" onclick="window.AcctventaKyc.close()">Done</button>
        </div>`;
      return;
    }
    if (['needs_review', 'blurry_review', 'pending'].includes(st.kycStatus) && name === 'intro') {
      el.innerHTML = `
        <div class="kyc-hero">
          <div class="kyc-hero-icon kyc-hero-pending"><i class="fa-solid fa-hourglass-half"></i></div>
          <h2>Verification in review</h2>
          <p>${st.kycStatus === 'blurry_review' ? 'A blurry upload was flagged — a supervisor is reviewing your documents manually.' : 'Your documents were received. A supervisor will finish verification shortly.'}</p>
          <p class="kyc-muted">${escapeHtml((st.submission && st.submission.businessName) || '')}</p>
          <button type="button" class="kyc-btn-primary" onclick="window.AcctventaKyc.close()">Close</button>
        </div>`;
      return;
    }

    if (name === 'intro') {
      el.innerHTML = `
        <div class="kyc-hero">
          <div class="kyc-hero-icon"><i class="fa-solid fa-building-columns"></i></div>
          <p class="kyc-eyebrow">Business KYC</p>
          <h2>Verify your business account</h2>
          <p>Build buyer trust with a verified seller badge. Upload your CAC papers and your government ID (front and back). Use clear camera photos — screenshots are not accepted.</p>
          <ul class="kyc-bullets">
            <li><i class="fa-solid fa-check"></i> CAC / Certificate of Incorporation</li>
            <li><i class="fa-solid fa-check"></i> Valid government ID — front and back</li>
            <li><i class="fa-solid fa-shield-halved"></i> Camera photos only — screenshots are rejected</li>
            <li><i class="fa-solid fa-user-check"></i> Blurry-but-legit docs go to manual supervisor review</li>
          </ul>
          ${st.kycStatus === 'rejected' ? `<div class="kyc-alert">Previous application was declined${st.submission && st.submission.rejectReason ? ': ' + escapeHtml(st.submission.rejectReason) : ''}. Please resubmit clearer camera photos.</div>` : ''}
          <button type="button" class="kyc-btn-primary" id="kycStartBtn">Start Business KYC</button>
          <button type="button" class="kyc-btn-ghost" onclick="window.AcctventaKyc.close()">I'll do this later</button>
        </div>`;
      document.getElementById('kycStartBtn')?.addEventListener('click', () => {
        step = 1;
        render();
      });
      return;
    }

    if (name === 'business') {
      el.innerHTML = `
        <div class="kyc-section">
          <h3>Business information</h3>
          <p class="kyc-lead">Tell us about the business selling on Acctventa.</p>
          ${field('businessName', 'Business name', { required: true, placeholder: 'Registered business name' })}
          ${field('businessUsername', 'Public username', { placeholder: 'Storefront handle' })}
          ${field('registrationNumber', 'Business registration / CAC number', { required: true, placeholder: 'RC / BN number' })}
          ${field('businessType', 'Business type', { required: true, type: 'select', options: ['Limited Liability', 'Business Name (BN)', 'Enterprise', 'Partnership', 'Other'] })}
          ${field('businessAddress', 'Business address', { required: true, type: 'textarea', placeholder: 'Registered address' })}
          ${field('industry', 'Industry', { required: true, placeholder: 'e.g. Digital goods / Accounts marketplace' })}
        </div>`;
      setFooter(`<div class="kyc-nav">${navButtons()}</div>`);
      bindNav(['businessName', 'businessUsername', 'registrationNumber', 'businessType', 'businessAddress', 'industry']);
      return;
    }

    if (name === 'contact') {
      el.innerHTML = `
        <div class="kyc-section">
          <h3>Contact information</h3>
          <p class="kyc-lead">Primary person we can reach about this business.</p>
          ${field('contactPerson', 'Primary contact person', { required: true, placeholder: 'Full name' })}
          ${field('contactTitle', 'Position / title', { placeholder: 'e.g. Director' })}
          ${field('contactEmail', 'Email address', { required: true, type: 'email', placeholder: 'business@email.com' })}
          ${field('contactPhone', 'Phone number', { required: true, placeholder: '+234…' })}
        </div>`;
      setFooter(`<div class="kyc-nav">${navButtons()}</div>`);
      bindNav(['contactPerson', 'contactTitle', 'contactEmail', 'contactPhone']);
      return;
    }

    if (name === 'ownership') {
      el.innerHTML = `
        <div class="kyc-section">
          <h3>Ownership information</h3>
          <p class="kyc-lead">Beneficial owner details (must match your ID).</p>
          ${field('ownerName', 'Beneficial owner full name', { required: true, placeholder: 'Full legal name' })}
          ${field('ownershipPct', 'Ownership percentage', { required: true, type: 'number', placeholder: '100' })}
          ${field('ownerAddress', 'Owner address', { type: 'textarea', placeholder: 'Residential address' })}
          ${field('ownerDob', 'Date of birth', { type: 'date' })}
        </div>`;
      setFooter(`<div class="kyc-nav">${navButtons()}</div>`);
      bindNav(['ownerName', 'ownershipPct', 'ownerAddress', 'ownerDob']);
      return;
    }

    if (name === 'documents') {
      el.innerHTML = `
        <div class="kyc-section">
          <h3>Documents upload</h3>
          <p class="kyc-lead">Photograph physical papers with your camera. Screenshots and heavily edited images are not accepted.</p>
          ${docCard('cac', 'CAC / Certificate of Incorporation', true)}
          ${docCard('idCardFront', 'ID card — front', true)}
          ${docCard('idCardBack', 'ID card — back', true)}
        </div>`;
      setFooter(`<div class="kyc-nav">${navButtons()}</div>`);
      ['cac', 'idCardFront', 'idCardBack'].forEach(renderDocSlot);
      el.querySelectorAll('[data-kyc-file]').forEach((inp) => {
        inp.addEventListener('change', () => onDocPick(inp.getAttribute('data-kyc-file'), inp.files && inp.files[0], false));
      });
      el.querySelectorAll('[data-kyc-cam]').forEach((inp) => {
        inp.addEventListener('change', () => onDocPick(inp.getAttribute('data-kyc-cam'), inp.files && inp.files[0], true));
      });
      bindNav([]);
      return;
    }

    if (name === 'review') {
      const labelMap = { cac: 'CAC', idCardFront: 'ID front', idCardBack: 'ID back' };
      const docsList = ['cac', 'idCardFront', 'idCardBack']
        .filter((k) => state.documents[k])
        .map((k) => {
          const d = state.documents[k];
          return `<li><strong>${labelMap[k] || k}</strong> — ${escapeHtml(d.name || '')} · ${escapeHtml((d.ai && d.ai.message) || 'Ready')}</li>`;
        })
        .join('');
      el.innerHTML = `
        <div class="kyc-section">
          <h3>Review &amp; submit</h3>
          <p class="kyc-lead">Confirm everything looks right. Submission goes to supervisor review.</p>
          <div class="kyc-summary">
            <p><span>Business</span>${escapeHtml(state.businessName)}</p>
            <p><span>CAC / Reg No.</span>${escapeHtml(state.registrationNumber)}</p>
            <p><span>Contact</span>${escapeHtml(state.contactPerson)} · ${escapeHtml(state.contactEmail)}</p>
            <p><span>Owner</span>${escapeHtml(state.ownerName)}</p>
          </div>
          <ul class="kyc-doc-summary">${docsList || '<li>No documents attached</li>'}</ul>
        </div>`;
      setFooter(`<div class="kyc-nav">
            <button type="button" class="kyc-btn-ghost" id="kycBackBtn">Back</button>
            <button type="button" class="kyc-btn-primary" id="kycSubmitBtn">Submit for verification</button>
          </div>`);
      const reviewAbort = new AbortController();
      navAbort = reviewAbort;
      const signal = reviewAbort.signal;
      document.getElementById('kycBackBtn')?.addEventListener(
        'click',
        (e) => {
          if (navIsLocked()) {
            e.preventDefault();
            return;
          }
          step = Math.max(1, step - 1);
          render();
        },
        { signal }
      );
      document.getElementById('kycSubmitBtn')?.addEventListener('click', submitKyc, { signal });
    }
  }

  function navButtons() {
    return `<button type="button" class="kyc-btn-ghost" id="kycBackBtn">Back</button>
            <button type="button" class="kyc-btn-primary" id="kycNextBtn">Continue</button>`;
  }

  function clearFieldErrors() {
    bodyEl()?.querySelectorAll('.kyc-field-error').forEach((n) => n.classList.remove('kyc-field-error'));
  }

  function markFieldError(id) {
    const input = document.getElementById('kyc_' + id);
    const wrap = input && input.closest('.kyc-field');
    if (wrap) wrap.classList.add('kyc-field-error');
  }

  function goBackFromForm(fieldIds) {
    pullFields(fieldIds);
    // Never dump mid-form users back onto the marketing intro (ghost taps used to do this).
    if (step <= 1) {
      closeKyc();
      return;
    }
    step -= 1;
    render();
  }

  function bindNav(fieldIds) {
    if (navAbort) navAbort.abort();
    navAbort = new AbortController();
    const signal = navAbort.signal;
    const root = overlay() || document;
    const body = bodyEl();
    const foot = footerEl();
    let armedBtn = null;

    const armLock = (e) => {
      if (isFieldTarget(e.target)) {
        armedBtn = null;
        lockNav(1200);
      }
    };

    // pointerdown/touchstart fire before iOS moves the footer under the finger
    if (body) {
      body.addEventListener('pointerdown', armLock, { signal, capture: true });
      body.addEventListener('touchstart', armLock, { signal, capture: true, passive: true });
    }
    root.addEventListener(
      'focusin',
      (e) => {
        if (!isFieldTarget(e.target)) return;
        armedBtn = null;
        lockNav(1200);
        const wrap = e.target.closest && e.target.closest('.kyc-field');
        if (wrap) wrap.classList.remove('kyc-field-error');
      },
      { signal }
    );

    const armFooterBtn = (e) => {
      if (navIsLocked()) {
        armedBtn = null;
        return;
      }
      const btn = e.target && e.target.closest && e.target.closest('#kycBackBtn, #kycNextBtn');
      armedBtn = btn ? btn.id : null;
    };
    if (foot) {
      foot.addEventListener('pointerdown', armFooterBtn, { signal });
      foot.addEventListener('touchstart', armFooterBtn, { signal, passive: true });
    }

    const guardNavClick = (e, expectedId) => {
      if (navIsLocked() || armedBtn !== expectedId) {
        e.preventDefault();
        e.stopPropagation();
        if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
        armedBtn = null;
        return true;
      }
      armedBtn = null;
      return false;
    };

    document.getElementById('kycBackBtn')?.addEventListener(
      'click',
      (e) => {
        if (guardNavClick(e, 'kycBackBtn')) return;
        goBackFromForm(fieldIds);
      },
      { signal }
    );

    document.getElementById('kycNextBtn')?.addEventListener(
      'click',
      (e) => {
        if (guardNavClick(e, 'kycNextBtn')) return;
        pullFields(fieldIds);
        if (!validateStep()) return;
        step = Math.min(STEPS.length - 1, step + 1);
        render();
      },
      { signal }
    );
  }

  function validateStep() {
    clearFieldErrors();
    const name = STEPS[step];
    const need = {
      business: ['businessName', 'registrationNumber', 'businessType', 'businessAddress', 'industry'],
      contact: ['contactPerson', 'contactEmail', 'contactPhone'],
      ownership: ['ownerName', 'ownershipPct'],
      documents: [],
    }[name];
    if (need) {
      const missing = need.filter((id) => !String(state[id] || '').trim());
      if (missing.length) {
        missing.forEach(markFieldError);
        const first = document.getElementById('kyc_' + missing[0]);
        if (first && typeof first.focus === 'function') {
          try {
            first.focus({ preventScroll: false });
          } catch (_) {
            first.focus();
          }
        }
        toastOnce('Please complete all required fields', 'error', 1200);
        return false;
      }
    }
    if (name === 'documents') {
      if (!state.documents.cac) {
        toastOnce('Upload your CAC / Certificate of Incorporation', 'error', 1200);
        return false;
      }
      if (!state.documents.idCardFront) {
        toastOnce('Upload the front of your ID card', 'error', 1200);
        return false;
      }
      if (!state.documents.idCardBack) {
        toastOnce('Upload the back of your ID card', 'error', 1200);
        return false;
      }
      for (const key of ['cac', 'idCardFront', 'idCardBack']) {
        const v = state.documents[key]?.ai?.verdict;
        if (v === 'reject') {
          toastOnce('Replace rejected documents with clear camera photos', 'error', 1200);
          return false;
        }
      }
    }
    return true;
  }

  async function submitKyc() {
    const btn = document.getElementById('kycSubmitBtn');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Submitting…';
    }
    try {
      if (!global.AcctventaApi || !(await global.AcctventaApi.isAvailable())) {
        throw new Error('Verification requires an online connection. Please try again.');
      }
      const payload = {
        ...state,
        documents: {},
      };
      Object.keys(state.documents).forEach((k) => {
        const d = state.documents[k];
        payload.documents[k] = {
          data: d.data,
          name: d.name,
          mime: d.mime,
          ai: d.ai,
        };
      });
      const res = await global.AcctventaApi.kycSubmit(payload);
      statusCache = {
        isVerified: !!res.isVerified,
        kycStatus: res.kycStatus || 'needs_review',
        submission: res.submission || null,
      };
      updateSidebarButton();
      if (res.user && global.AcctventaApi.applySessionUser) {
        global.AcctventaApi.applySessionUser(res.user);
      }
      toast('Business KYC submitted for review', 'success');
      step = 0;
      state = emptyState();
      render();
    } catch (e) {
      toast(e.message || 'Submission failed', 'error');
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Submit for verification';
      }
    }
  }

  async function openKyc(forceForm) {
    const ov = overlay();
    if (!ov) return;
    try {
      ['appModal','walletFlowOverlay','sellWizardOverlay','chatOverlay','filterDrawer','leftMenu','rightMenu'].forEach(function(id){
        var el=document.getElementById(id); if(!el)return; el.classList.add('hidden'); el.classList.remove('flex');
      });
    } catch (e) {}
    await refreshStatus();
    if (forceForm) {
      step = 1;
      state = emptyState();
    } else if (step < 1) {
      step = 0;
    }
    // else resume the in-progress step (do not kick users back to intro)
    ov.classList.remove('hidden');
    ov.classList.add('flex');
    document.body.style.overflow = 'hidden';
    render();
  }

  function closeKyc() {
    const ov = overlay();
    if (!ov) return;
    if (navAbort) {
      navAbort.abort();
      navAbort = null;
    }
    setFooter('');
    ov.classList.add('hidden');
    ov.classList.remove('flex');
    document.body.style.overflow = '';
  }

  global.openBecomeVerified = function () {
    openKyc();
  };

  global.AcctventaKyc = {
    open: openKyc,
    close: closeKyc,
    refreshStatus,
    updateSidebarButton,
  };

  document.addEventListener('DOMContentLoaded', () => {
    refreshStatus();
  });
})(window);

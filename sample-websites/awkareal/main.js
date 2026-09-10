(() => {
  const FALLBACK_LISTINGS = [
  {
    "id": 39,
    "title": "DOMINICAN-CITY ESTATE",
    "state": "Anambra",
    "area": "Amansea",
    "location": "behind Holyfamily Amansea Awka- Anambra state",
    "price": 1000000,
    "price_subsequent": 800000,
    "image": "https://res.cloudinary.com/dsqerxpak/video/upload/so_0.5/v1/awkarealestate_uploads/deexperience/srp5qadpoksa2dzdjz3n.jpg",
    "amenities": [
      "Waderobe Provisions",
      "Guest convinence",
      "Spacious kitchen",
      "Bore-hole facilities"
    ],
    "available": true
  },
  {
    "id": 38,
    "title": "Uncompleted Hostel Structure with 8-Room Bungalow - Ifite-Awka",
    "state": "Anambra",
    "area": "Ifite",
    "location": "Ifite-Awka Anambra state",
    "price": 75000000,
    "price_subsequent": null,
    "image": "https://res.cloudinary.com/dsqerxpak/video/upload/so_0.5/v1/awkarealestate_uploads/deexperience/vonniyikdgkuzbixoq94.jpg",
    "amenities": [
      "Fully occupied with tenants",
      "Strategically sited with different access routes",
      "Documents are verified and available",
      "Standard spacious Rooms for the bungalow"
    ],
    "available": true
  },
  {
    "id": 37,
    "title": "GRACEFIELD RESIDENCE",
    "state": "Anambra",
    "area": "Ifite",
    "location": "Nathan Nweke street-marvelous junction ifite-Awka Anambra state",
    "price": 600000,
    "price_subsequent": 550000,
    "image": "https://res.cloudinary.com/dsqerxpak/video/upload/so_0.5/v1/awkarealestate_uploads/deexperience/p4ktnftsmxcj7gvimknh.jpg",
    "amenities": [
      "Spacious Rooms",
      "Secured and serene environment",
      "Bore-hole facilities",
      "Prepaid meters"
    ],
    "available": true
  },
  {
    "id": 36,
    "title": "AJAGU RESIDENCE",
    "state": "Anambra",
    "area": "Ifite",
    "location": "Next level junction after Nwando Estate ifite Awka-south LGA Anambra state",
    "price": 950000,
    "price_subsequent": 700000,
    "image": "https://res.cloudinary.com/dsqerxpak/video/upload/so_0.5/v1/awkarealestate_uploads/deexperience/h0abbgxcukaso7s3i2ex.jpg",
    "amenities": [
      "Spacious Rooms",
      "Waderobe Provisions",
      "Guest convinence",
      "Spacious kitchen"
    ],
    "available": true
  },
  {
    "id": 35,
    "title": "2-plots of Land fenced with gate @ Nwando Estate Next level\u2026",
    "state": "Anambra",
    "area": "Ifite",
    "location": "Nwando Estate Next level street ifite Awka-south LGA, Anambra state",
    "price": 30000000,
    "price_subsequent": null,
    "image": "https://res.cloudinary.com/dsqerxpak/video/upload/so_0.5/v1/awkarealestate_uploads/deexperience/expgoec5zd4r0hkpfemv.jpg",
    "amenities": [
      "Buy & Build",
      "Level Land with complete measurements",
      "Proximate distance from school and major landmark areas",
      "Suitable for all kinds of investments"
    ],
    "available": true
  },
  {
    "id": 34,
    "title": "STANDARD THREE BEDROOM APARTMENT",
    "state": "Anambra",
    "area": "Amansea",
    "location": "306 street off holy family Youth village Road Amansea-Awka Anambra state",
    "price": 1750000,
    "price_subsequent": 1500000,
    "image": "https://res.cloudinary.com/dsqerxpak/video/upload/so_0.5/v1/awkarealestate_uploads/deexperience/lzzmh7g6f0ldvgyqqvbt.jpg",
    "amenities": [
      "Super-spacious Rooms",
      "Waderobe Cabinets",
      "Spacious cabineted kitchen",
      "POP ceilings"
    ],
    "available": true
  },
  {
    "id": 33,
    "title": "STANDARD THREE BEDROOM FLAT",
    "state": "Anambra",
    "area": "GRA",
    "location": "GRA by Unizik Enugu-onitsha Express Agu Awka-Anambra state",
    "price": 1700000,
    "price_subsequent": 1500000,
    "image": "https://res.cloudinary.com/dsqerxpak/video/upload/so_0.5/v1/awkarealestate_uploads/deexperience/wfg8kdg5xlcagk6kjgcy.jpg",
    "amenities": [
      "Super-spacious Rooms",
      "Waderobe Provisions",
      "Guest convinence",
      "Spacious kitchen"
    ],
    "available": true
  },
  {
    "id": 29,
    "title": "LEKKI CONCEPT ONE BEDROOM APARTMENT",
    "state": "Enugu",
    "area": "Independence Layout",
    "location": "Independence Layout, Enugu",
    "price": 1250000,
    "price_subsequent": 1000000,
    "image": "https://res.cloudinary.com/dsqerxpak/video/upload/so_0.5/v1/awkarealestate_uploads/deexperience/bm8ylmrqhlqsmpq72l3t.jpg",
    "amenities": [
      "Super-spacious Rooms",
      "Waderobe Cabinets",
      "Spacious cabineted kitchen",
      "POP ceilings"
    ],
    "available": true
  },
  {
    "id": 28,
    "title": "STANDARD TWO & ONE BEDROOM FLATS",
    "state": "Imo",
    "area": "Owerri",
    "location": "New Owerri, Imo",
    "price": 1000000,
    "price_subsequent": 800000,
    "image": "https://res.cloudinary.com/dsqerxpak/video/upload/so_0.5/v1/awkarealestate_uploads/deexperience/pk79vpzwk678fkvgnrkf.jpg",
    "amenities": [
      "Waderobe and kitchen cabinets",
      "Super-spacious P.O.P Rooms",
      "Water heaters and chandeliers",
      "Guest convinence"
    ],
    "available": true
  },
  {
    "id": 26,
    "title": "STANDARD TWO BEDROOM APARTMENT",
    "state": "Delta",
    "area": "Asaba",
    "location": "Asaba, Delta",
    "price": 1500000,
    "price_subsequent": 1200000,
    "image": "https://res.cloudinary.com/dsqerxpak/video/upload/so_0.5/v1/awkarealestate_uploads/deexperience/yryeuvsk5te4lwgyfex1.jpg",
    "amenities": [
      "Waderobe Cabinets",
      "CCTV and DStv connection",
      "Parking lot with increte compound",
      "Spacious cabineted kitchen"
    ],
    "available": true
  },
  {
    "id": 25,
    "title": "LIKA\u2019s APARTMENT",
    "state": "Abia",
    "area": "Umuahia",
    "location": "Umuahia, Abia",
    "price": 1200000,
    "price_subsequent": 800000,
    "image": "https://res.cloudinary.com/dsqerxpak/video/upload/so_0.5/v1/awkarealestate_uploads/deexperience/hdvfasb1qadyhkjd9vzf.jpg",
    "amenities": [
      "Super-spacious Rooms",
      "Parking Space",
      "Waderobe Cabinets",
      "Spacious cabineted kitchen"
    ],
    "available": true
  },
  {
    "id": 27,
    "title": "ONE BEDROOM APARTMENT",
    "state": "Lagos",
    "area": "Lekki",
    "location": "Lekki Phase 1, Lagos",
    "price": 1200000,
    "price_subsequent": 800000,
    "image": "https://res.cloudinary.com/dsqerxpak/video/upload/so_0.5/v1/awkarealestate_uploads/deexperience/tc2xgcxtq2w42nmalnsw.jpg",
    "amenities": [
      "Spacious Rooms",
      "cabineted kitchen",
      "Waderobe Cabinets",
      "Water heater"
    ],
    "available": true
  },
  {
    "id": 30,
    "title": "STANDARD TWO BEDROOM APARTMENT",
    "state": "Ebonyi",
    "area": "Abakaliki",
    "location": "Abakaliki, Ebonyi",
    "price": 1100000,
    "price_subsequent": 850000,
    "image": "https://res.cloudinary.com/dsqerxpak/video/upload/so_0.5/v1/awkarealestate_uploads/deexperience/hgku3db5woast8cigh4o.jpg",
    "amenities": [
      "Super-spacious Rooms",
      "Waderobe Provisions",
      "Guest convinence",
      "Spacious kitchen"
    ],
    "available": true
  }
];

  const els = {
    grid: document.getElementById("listingsGrid"),
    empty: document.getElementById("emptyState"),
    search: document.getElementById("searchInput"),
    area: document.getElementById("areaFilter"),
    state: document.getElementById("stateFilter"),
    form: document.getElementById("searchForm"),
    liveCount: document.getElementById("liveCount"),
    stateCount: document.getElementById("stateCount"),
    navToggle: document.getElementById("navToggle"),
    mobileNav: document.getElementById("mobileNav"),
    year: document.getElementById("year"),
  };

  let listings = [];

  function formatPrice(naira) {
    if (typeof naira !== "number" || Number.isNaN(naira)) return "Price on request";
    return `₦${naira.toLocaleString("en-NG")}`;
  }

  function uniqueSorted(values) {
    return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
  }

  function fillSelect(select, values, allLabel) {
    const current = select.value;
    select.innerHTML = `<option value="">${allLabel}</option>`;
    values.forEach((value) => {
      const opt = document.createElement("option");
      opt.value = value;
      opt.textContent = value;
      select.appendChild(opt);
    });
    if (values.includes(current)) select.value = current;
  }

  function pinIcon() {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M12 21s7-5.2 7-11a7 7 0 1 0-14 0c0 5.8 7 11 7 11Z"/><circle cx="12" cy="10" r="2.5"/></svg>`;
  }

  function cardHTML(item, index) {
    const amenities = (item.amenities || []).slice(0, 3);
    const subsequent = item.price_subsequent
      ? `<small>then ${formatPrice(item.price_subsequent)}</small>`
      : "";
    const delay = Math.min(index * 0.04, 0.28);
    return `
      <article class="listing-card" style="animation-delay:${delay}s" data-id="${item.id}">
        <div class="listing-media">
          <img src="${item.image}" alt="${escapeAttr(item.title)}" loading="lazy" onerror="this.onerror=null;this.src='https://images.unsplash.com/photo-1560518883-ce09059eeffa?auto=format&fit=crop&w=900&q=80';" />
          <span class="state-badge">${escapeHtml(item.state)}</span>
        </div>
        <div class="listing-body">
          <h3>${escapeHtml(item.title)}</h3>
          <p class="listing-location">${pinIcon()}<span>${escapeHtml(item.location)}</span></p>
          <div class="amenity-row">
            ${amenities.map((a) => `<span class="amenity-chip">${escapeHtml(a)}</span>`).join("")}
          </div>
          <p class="listing-price">${formatPrice(item.price)}${subsequent}</p>
        </div>
      </article>
    `;
  }

  function escapeHtml(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function escapeAttr(str) {
    return escapeHtml(str).replace(/'/g, "&#39;");
  }

  function getFilters() {
    return {
      q: (els.search.value || "").trim().toLowerCase(),
      area: els.area.value,
      state: els.state.value,
    };
  }

  function applyFilters() {
    const { q, area, state } = getFilters();
    const filtered = listings.filter((item) => {
      if (area && item.area !== area) return false;
      if (state && item.state !== state) return false;
      if (!q) return true;
      const hay = `${item.title} ${item.location} ${item.area} ${item.state} ${(item.amenities || []).join(" ")}`.toLowerCase();
      return hay.includes(q);
    });

    els.grid.innerHTML = filtered.map(cardHTML).join("");
    els.empty.hidden = filtered.length > 0;
    els.liveCount.textContent = String(filtered.length);
    els.stateCount.textContent = String(uniqueSorted(filtered.map((i) => i.state)).length || uniqueSorted(listings.map((i) => i.state)).length);
  }

  function syncStatsAll() {
    els.liveCount.textContent = String(listings.length);
    els.stateCount.textContent = String(uniqueSorted(listings.map((i) => i.state)).length);
  }

  function initFilters() {
    fillSelect(els.area, uniqueSorted(listings.map((i) => i.area)), "All areas");
    fillSelect(els.state, uniqueSorted(listings.map((i) => i.state)), "All states");
  }

  function bindEvents() {
    els.form.addEventListener("submit", (e) => {
      e.preventDefault();
      applyFilters();
      document.getElementById("listings")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });

    ["input", "change"].forEach((evt) => {
      els.search.addEventListener(evt, applyFilters);
      els.area.addEventListener(evt, applyFilters);
      els.state.addEventListener(evt, applyFilters);
    });

    els.navToggle?.addEventListener("click", () => {
      const open = els.mobileNav.hasAttribute("hidden");
      if (open) els.mobileNav.removeAttribute("hidden");
      else els.mobileNav.setAttribute("hidden", "");
      els.navToggle.setAttribute("aria-expanded", String(open));
    });

    els.mobileNav?.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", () => {
        els.mobileNav.setAttribute("hidden", "");
        els.navToggle.setAttribute("aria-expanded", "false");
      });
    });
  }

  async function loadListings() {
    try {
      const res = await fetch("lodges.json", { cache: "no-store" });
      if (!res.ok) throw new Error("lodges.json missing");
      const data = await res.json();
      if (!Array.isArray(data) || !data.length) throw new Error("empty lodges");
      listings = data.map((item) => ({
        ...item,
        state: item.state || "Anambra",
        area: item.area || "Awka",
      }));
    } catch {
      listings = FALLBACK_LISTINGS;
    }
  }

  async function boot() {
    if (els.year) els.year.textContent = String(new Date().getFullYear());
    await loadListings();
    initFilters();
    syncStatsAll();
    applyFilters();
    bindEvents();
  }

  boot();
})();

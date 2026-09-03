const citiesByState = {
  Lagos: ["Lekki", "Ikeja", "Yaba", "Ajah", "Surulere", "Victoria Island"],
  "Abuja (FCT)": ["Maitama", "Wuse", "Gwarinpa", "Asokoro", "Kubwa"],
  Rivers: ["Port Harcourt", "Obio-Akpor", "Eleme"],
  Delta: ["Warri", "Asaba", "Ughelli"],
  Edo: ["Benin City", "Auchi", "Ekpoma"],
  Oyo: ["Ibadan", "Ogbomosho", "Iseyin"],
  Ogun: ["Abeokuta", "Sango", "Ifo"],
  Anambra: ["Awka", "Onitsha", "Nnewi"],
};

const listings = [
  {
    title: "4-Bed Duplex with BQ",
    state: "Lagos",
    city: "Lekki",
    intent: "buy",
    type: "Duplex",
    beds: 4,
    price: "₦185,000,000",
    image: "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=800&q=80",
  },
  {
    title: "Serviced 2-Bed Flat",
    state: "Lagos",
    city: "Yaba",
    intent: "rent",
    type: "Flat / Apartment",
    beds: 2,
    price: "₦3,200,000 / yr",
    image: "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=800&q=80",
  },
  {
    title: "Detached Bungalow",
    state: "Edo",
    city: "Benin City",
    intent: "buy",
    type: "Bungalow",
    beds: 3,
    price: "₦48,000,000",
    image: "https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=800&q=80",
  },
  {
    title: "3-Bed Terrace Home",
    state: "Abuja (FCT)",
    city: "Gwarinpa",
    intent: "rent",
    type: "Terrace",
    beds: 3,
    price: "₦6,500,000 / yr",
    image: "https://images.unsplash.com/photo-1600585154526-990dced4db0d?w=800&q=80",
  },
  {
    title: "Residential Plot 600sqm",
    state: "Delta",
    city: "Warri",
    intent: "buy",
    type: "Land",
    beds: 0,
    price: "₦12,500,000",
    image: "https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=800&q=80",
  },
  {
    title: "Waterfront Apartment",
    state: "Rivers",
    city: "Port Harcourt",
    intent: "rent",
    type: "Flat / Apartment",
    beds: 3,
    price: "₦4,800,000 / yr",
    image: "https://images.unsplash.com/photo-1493809842364-78817add7ffb?w=800&q=80",
  },
  {
    title: "Mini Flat near Campus",
    state: "Oyo",
    city: "Ibadan",
    intent: "rent",
    type: "Flat / Apartment",
    beds: 1,
    price: "₦850,000 / yr",
    image: "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=800&q=80",
  },
  {
    title: "5-Bed Family Home",
    state: "Ogun",
    city: "Abeokuta",
    intent: "buy",
    type: "Duplex",
    beds: 5,
    price: "₦72,000,000",
    image: "https://images.unsplash.com/photo-1600047509807-ba8f99d2cd00?w=800&q=80",
  },
];

let intent = "buy";

const stateSelect = document.getElementById("stateSelect");
const citySelect = document.getElementById("citySelect");
const grid = document.getElementById("listingGrid");
const note = document.getElementById("resultNote");

function fillCities() {
  const state = stateSelect.value;
  citySelect.innerHTML = '<option value="">Select city</option>';
  (citiesByState[state] || []).forEach((city) => {
    const opt = document.createElement("option");
    opt.value = city;
    opt.textContent = city;
    citySelect.appendChild(opt);
  });
}

function render(items) {
  grid.innerHTML = items
    .map(
      (item) => `
      <article class="card">
        <div class="card-media">
          <span class="badge ${item.intent === "rent" ? "rent" : ""}">${item.intent === "rent" ? "FOR RENT" : "FOR SALE"}</span>
          <img src="${item.image}" alt="${item.title}" loading="lazy" />
        </div>
        <div class="card-body">
          <h3>${item.title}</h3>
          <p class="meta">${item.city}, ${item.state} · ${item.type}</p>
          <p class="price">${item.price}</p>
        </div>
      </article>`
    )
    .join("");
}

function applyFilters(formData) {
  const type = formData.get("type");
  const state = formData.get("state");
  const city = formData.get("city");
  const beds = formData.get("beds");
  const filtered = listings.filter((item) => {
    if (item.intent !== intent) return false;
    if (type && item.type !== type) return false;
    if (state && item.state !== state) return false;
    if (city && item.city !== city) return false;
    if (beds) {
      const min = Number(beds.replace("+", ""));
      if (item.beds < min) return false;
    }
    return true;
  });
  note.textContent = `${filtered.length} ${intent} listing${filtered.length === 1 ? "" : "s"} matched`;
  render(filtered.length ? filtered : listings.filter((l) => l.intent === intent));
  if (!filtered.length) note.textContent = `No exact matches — showing latest ${intent} listings`;
}

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((t) => {
      t.classList.remove("active");
      t.setAttribute("aria-selected", "false");
    });
    tab.classList.add("active");
    tab.setAttribute("aria-selected", "true");
    intent = tab.dataset.intent;
    applyFilters(new FormData(document.getElementById("searchForm")));
  });
});

stateSelect.addEventListener("change", fillCities);
document.getElementById("searchForm").addEventListener("submit", (e) => {
  e.preventDefault();
  applyFilters(new FormData(e.target));
  document.getElementById("listings").scrollIntoView({ behavior: "smooth" });
});

render(listings.filter((l) => l.intent === "buy"));

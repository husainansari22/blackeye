const menuData = {
  restaurant: {
    title: "Restaurant",
    chips: ["All", "Locals", "Grills", "Rice", "Sides"],
    items: [
      { name: "Egusi & Semo", cat: "Locals", price: "₦5,500", img: "https://images.unsplash.com/photo-1547592180-85f173990554?w=400&q=80" },
      { name: "Ofada Special", cat: "Locals", price: "₦6,200", img: "https://images.unsplash.com/photo-1604908176997-125f25cc6f3d?w=400&q=80" },
      { name: "Suya Platter", cat: "Grills", price: "₦7,000", img: "https://images.unsplash.com/photo-1529042410759-befb1204b468?w=400&q=80" },
      { name: "Chicken Barbecue", cat: "Grills", price: "₦6,800", img: "https://images.unsplash.com/photo-1598515214211-89d3fb549f87?w=400&q=80" },
      { name: "Coconut Rice", cat: "Rice", price: "₦4,800", img: "https://images.unsplash.com/photo-1603133872878-684f208fb84b?w=400&q=80" },
      { name: "Fried Rice Combo", cat: "Rice", price: "₦5,200", img: "https://images.unsplash.com/photo-1512058564366-18510be2db19?w=400&q=80" },
      { name: "Plantain & Sauce", cat: "Sides", price: "₦2,000", img: "https://images.unsplash.com/photo-1467003909585-2f8a72700288?w=400&q=80" },
      { name: "Coleslaw Cup", cat: "Sides", price: "₦1,500", img: "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=400&q=80" },
    ],
  },
  lounge: {
    title: "Lounge",
    chips: ["All", "Drinks", "Sharers", "Bites"],
    items: [
      { name: "Mandela Spritz", cat: "Drinks", price: "₦4,500", img: "https://images.unsplash.com/photo-1514362545857-3bc16c4c7d1b?w=400&q=80" },
      { name: "Whiskey Sour", cat: "Drinks", price: "₦5,000", img: "https://images.unsplash.com/photo-1470337458703-46ad1756a187?w=400&q=80" },
      { name: "Loaded Nachos", cat: "Sharers", price: "₦6,500", img: "https://images.unsplash.com/photo-1513456852971-30c0b8199d4d?w=400&q=80" },
      { name: "Wings Bucket", cat: "Sharers", price: "₦7,200", img: "https://images.unsplash.com/photo-1567620832904-9fe5cf710ca6?w=400&q=80" },
      { name: "Sliders Trio", cat: "Bites", price: "₦5,800", img: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=400&q=80" },
      { name: "Truffle Fries", cat: "Bites", price: "₦3,500", img: "https://images.unsplash.com/photo-1573080496219-bb080dd4f877?w=400&q=80" },
    ],
  },
  zanzibar: {
    title: "Zanzibar",
    chips: ["All", "Seafood", "Coastal", "Drinks"],
    items: [
      { name: "Grilled Prawns", cat: "Seafood", price: "₦9,500", img: "https://images.unsplash.com/photo-1559339352-11d035aa65de?w=400&q=80" },
      { name: "Fisherman Stew", cat: "Seafood", price: "₦8,200", img: "https://images.unsplash.com/photo-1534766555764-ce878a5e3a2b?w=400&q=80" },
      { name: "Coconut Fish Curry", cat: "Coastal", price: "₦7,800", img: "https://images.unsplash.com/photo-1455619452474-d2be8b1e70cd?w=400&q=80" },
      { name: "Zanzibar Pilau", cat: "Coastal", price: "₦6,000", img: "https://images.unsplash.com/photo-1585937421612-70a008356fbe?w=400&q=80" },
      { name: "Passion Cooler", cat: "Drinks", price: "₦2,800", img: "https://images.unsplash.com/photo-1546173159-315724a31696?w=400&q=80" },
    ],
  },
};

let currentVenue = null;
let currentChip = "All";

const venuesEl = document.getElementById("venues");
const menuView = document.getElementById("menuView");
const chipsEl = document.getElementById("chips");
const itemsEl = document.getElementById("items");
const venueTitle = document.getElementById("venueTitle");
const toTop = document.getElementById("toTop");

function renderItems() {
  const data = menuData[currentVenue];
  const list = data.items.filter((i) => currentChip === "All" || i.cat === currentChip);
  itemsEl.innerHTML = list
    .map(
      (i) => `
      <article class="item">
        <img src="${i.img}" alt="${i.name}" loading="lazy" />
        <div class="item-body">
          <span class="tag">${i.cat}</span>
          <h3>${i.name}</h3>
          <p class="price">${i.price}</p>
        </div>
      </article>`
    )
    .join("");
}

function openVenue(key) {
  currentVenue = key;
  currentChip = "All";
  const data = menuData[key];
  venueTitle.textContent = data.title;
  chipsEl.innerHTML = data.chips
    .map((c) => `<button class="chip ${c === "All" ? "active" : ""}" data-chip="${c}">${c}</button>`)
    .join("");
  venuesEl.hidden = true;
  menuView.hidden = false;
  renderItems();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

document.querySelectorAll(".venue").forEach((btn) => {
  btn.addEventListener("click", () => openVenue(btn.dataset.venue));
});

document.getElementById("backBtn").addEventListener("click", () => {
  menuView.hidden = true;
  venuesEl.hidden = false;
});

chipsEl.addEventListener("click", (e) => {
  const chip = e.target.closest(".chip");
  if (!chip) return;
  currentChip = chip.dataset.chip;
  chipsEl.querySelectorAll(".chip").forEach((c) => c.classList.toggle("active", c === chip));
  renderItems();
});

window.addEventListener("scroll", () => {
  toTop.classList.toggle("show", window.scrollY > 400);
});
toTop.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));

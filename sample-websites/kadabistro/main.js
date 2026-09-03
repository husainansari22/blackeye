const dishes = [
  {
    name: "Black Soup & Pounded Yam",
    desc: "Smoky bitter-leaf depth with soft yam.",
    price: "₦6,500",
    img: "https://images.unsplash.com/photo-1547592180-85f173990554?w=800&q=80",
  },
  {
    name: "Owoh Soup Platter",
    desc: "Palm-oil rich broth, assorted proteins.",
    price: "₦7,200",
    img: "https://images.unsplash.com/photo-1604908176997-125f25cc6f3d?w=800&q=80",
  },
  {
    name: "Grilled Catfish",
    desc: "Pepper marinade, plantain, garden salad.",
    price: "₦8,000",
    img: "https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2?w=800&q=80",
  },
  {
    name: "Jollof Party Rice",
    desc: "Party-smoky base with chicken skewers.",
    price: "₦5,800",
    img: "https://images.unsplash.com/photo-1603133872878-684f208fb84b?w=800&q=80",
  },
  {
    name: "Asun Bites",
    desc: "Charred spicy goat, lime, chili oil.",
    price: "₦4,500",
    img: "https://images.unsplash.com/photo-1529042410759-befb1204b468?w=800&q=80",
  },
  {
    name: "Chapman & Bitterleaf Cooler",
    desc: "House drinks for long tables.",
    price: "₦2,200",
    img: "https://images.unsplash.com/photo-1514362545857-3bc16c4c7d1b?w=800&q=80",
  },
];

document.getElementById("menuGrid").innerHTML = dishes
  .map(
    (d) => `
    <article class="dish">
      <img src="${d.img}" alt="${d.name}" loading="lazy" />
      <div class="dish-body">
        <h3>${d.name}</h3>
        <p>${d.desc}</p>
        <p class="price">${d.price}</p>
      </div>
    </article>`
  )
  .join("");

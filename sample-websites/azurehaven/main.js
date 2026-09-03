document.getElementById("bookForm").addEventListener("submit", (e) => {
  e.preventDefault();
  document.getElementById("bookNote").hidden = false;
});

// Soft reveal for room cards on scroll
const rooms = document.querySelectorAll(".room");
rooms.forEach((room, i) => {
  room.style.opacity = "0";
  room.style.transform = "translateY(16px)";
  room.style.transition = `opacity .5s ease ${i * 0.08}s, transform .5s ease ${i * 0.08}s`;
});

const io = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.style.opacity = "1";
        entry.target.style.transform = "none";
        io.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.2 }
);
rooms.forEach((r) => io.observe(r));

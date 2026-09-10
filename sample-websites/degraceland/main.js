(() => {
  const toggle = document.querySelector(".menu-toggle");
  const nav = document.querySelector(".primary-nav");
  const header = document.querySelector(".site-header");

  if (toggle && nav) {
    toggle.addEventListener("click", () => {
      const open = nav.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", String(open));
      toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    });

    nav.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", () => {
        nav.classList.remove("is-open");
        toggle.setAttribute("aria-expanded", "false");
        toggle.setAttribute("aria-label", "Open menu");
      });
    });
  }

  if (header) {
    const onScroll = () => {
      header.style.boxShadow =
        window.scrollY > 10
          ? "0 8px 24px rgb(3 23 51 / 10%)"
          : "none";
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }

  const cards = document.querySelectorAll(
    ".property-card, .blog-card, .why-copy, .hero-panel"
  );
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-visible");
          io.unobserve(entry.target);
        });
      },
      { threshold: 0.12 }
    );

    cards.forEach((card) => {
      card.style.opacity = "0";
      card.style.transform = "translateY(16px)";
      card.style.transition = "opacity 0.55s ease, transform 0.55s ease";
      io.observe(card);
    });

    const style = document.createElement("style");
    style.textContent =
      ".is-visible{opacity:1!important;transform:none!important}";
    document.head.appendChild(style);
  }
})();

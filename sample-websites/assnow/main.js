(() => {
  const header = document.getElementById("siteHeader");
  const nav = document.getElementById("mainNav");
  const toggle = document.getElementById("navToggle");
  const year = document.getElementById("year");
  const form = document.getElementById("contactForm");
  const formNote = document.getElementById("formNote");
  const showMore = document.getElementById("showMoreGallery");
  const gallerySection = document.querySelector(".gallery-section");

  document.documentElement.classList.add("reveal-ready");

  if (year) year.textContent = String(new Date().getFullYear());

  const onScroll = () => {
    if (!header) return;
    header.classList.toggle("scrolled", window.scrollY > 40);
  };
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });

  if (toggle && nav) {
    toggle.addEventListener("click", () => {
      const open = nav.classList.toggle("open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    });
    nav.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", () => {
        nav.classList.remove("open");
        toggle.setAttribute("aria-expanded", "false");
      });
    });
  }

  if (showMore && gallerySection) {
    showMore.addEventListener("click", () => {
      const expanded = gallerySection.classList.toggle("is-expanded");
      showMore.textContent = expanded ? "Show Less" : "Show More";
    });
  }

  const observeTargets = document.querySelectorAll(
    ".service-card, .gallery-grid figure, .testimonial-grid blockquote, .about-panel, .promo-content"
  );

  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -30px 0px" }
    );
    observeTargets.forEach((el) => io.observe(el));
  } else {
    observeTargets.forEach((el) => el.classList.add("is-visible"));
  }

  if (form) {
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      if (formNote) formNote.hidden = false;
      form.reset();
    });
  }
})();

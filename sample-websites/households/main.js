(() => {
  const header = document.querySelector(".site-header");
  const toggle = document.querySelector(".menu-toggle");
  const nav = document.querySelector(".primary-nav");
  const form = document.querySelector(".book-form");

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
        window.scrollY > 8
          ? "0 6px 20px rgb(0 0 0 / 18%)"
          : "0 2px 12px rgb(0 0 0 / 12%)";
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }

  if (form) {
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      let toast = form.parentElement.querySelector(".form-toast");
      if (!toast) {
        toast = document.createElement("p");
        toast.className = "form-toast";
        form.parentElement.appendChild(toast);
      }
      toast.textContent =
        "Thanks — Samples received your booking request. A coordinator will call you shortly.";
      form.reset();
    });
  }

  const revealItems = document.querySelectorAll(
    ".service-card, .feature-tile, .pro, .become-copy"
  );
  if ("IntersectionObserver" in window) {
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
      { threshold: 0.15 }
    );
    revealItems.forEach((el) => {
      el.style.opacity = "0";
      el.style.transform = "translateY(14px)";
      el.style.transition = "opacity 0.55s ease, transform 0.55s ease";
      io.observe(el);
    });
  }
})();

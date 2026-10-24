(function () {
  const KEY = "vidchat.theme";

  function current() {
    return document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
  }

  function apply(theme) {
    const t = theme === "light" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", t);
    try {
      localStorage.setItem(KEY, t);
    } catch (e) {}
    const meta = document.getElementById("theme-color");
    if (meta) meta.setAttribute("content", t === "light" ? "#ffffff" : "#212121");
    document.querySelectorAll("[data-theme-set]").forEach((btn) => {
      btn.classList.toggle("active", btn.getAttribute("data-theme-set") === t);
    });
  }

  function wire() {
    document.querySelectorAll("[data-theme-set]").forEach((btn) => {
      btn.addEventListener("click", () => apply(btn.getAttribute("data-theme-set")));
    });
    apply(localStorage.getItem(KEY) || current());
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", wire);
  } else {
    wire();
  }

  window.VidChatTheme = { apply, current };
})();

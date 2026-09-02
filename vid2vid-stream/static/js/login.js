document.getElementById("login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = document.getElementById("login-btn");
  const err = document.getElementById("login-error");
  err.classList.add("hidden");
  btn.disabled = true;
  btn.textContent = "Signing in…";

  try {
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: document.getElementById("password").value }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || "Login failed");
    window.location.href = data.redirect;
  } catch (error) {
    err.textContent = error.message;
    err.classList.remove("hidden");
    btn.disabled = false;
    btn.textContent = "Enter studio";
  }
});

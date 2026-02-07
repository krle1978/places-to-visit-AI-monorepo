document.addEventListener("DOMContentLoaded", () => {
  const nameEl = document.getElementById("profile-name");
  const emailEl = document.getElementById("profile-email");
  const planEl = document.getElementById("profile-plan");
  const tokensEl = document.getElementById("profile-tokens");
  const errorEl = document.getElementById("profile-error");
  const changePlanBtn = document.getElementById("change-plan-btn");
  const logoutBtn = document.getElementById("logout-btn");

  const planLabels = {
    free: "Free",
    basic: "Basic",
    premium: "Premium",
    premium_plus: "Premium Plus"
  };

  const token = localStorage.getItem("token");
  if (!token) {
    window.location.href = "/";
    return;
  }

  changePlanBtn.addEventListener("click", () => {
    window.location.href = "/subscription.html";
  });

  logoutBtn.addEventListener("click", () => {
    localStorage.removeItem("token");
    window.location.href = "/";
  });

  fetch("/api/auth/me", {
    headers: { Authorization: `Bearer ${token}` }
  })
    .then(async (res) => {
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Failed to load profile.");
      }
      return data;
    })
    .then((data) => {
      const planKey = data.plan || "free";
      nameEl.textContent = data.name || "-";
      emailEl.textContent = data.email || "-";
      planEl.textContent = planLabels[planKey] || "Free";
      tokensEl.textContent = Number.isFinite(data.tokens) ? String(data.tokens) : "0";
    })
    .catch((err) => {
      errorEl.textContent = err.message || "Failed to load profile.";
    });
});

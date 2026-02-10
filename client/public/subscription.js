document.addEventListener("DOMContentLoaded", () => {
  // Progress Bar Animation with Milestones
  const progress = document.querySelector(".progress-bar .progress");
  if (progress) {
    let width = 0;
    const target = 64;
    const interval = setInterval(() => {
      if (width >= target) {
        clearInterval(interval);
      } else {
        width += 1;
        progress.style.width = width + "%";
      }
    }, 20);
  }

  // Hamburger Menu Toggle with Slide Animation
  const hamburger = document.querySelector(".hamburger");
  const mobileMenu = document.querySelector(".menu_mobile");

  if (hamburger && mobileMenu) {
    hamburger.addEventListener("click", () => {
      if (mobileMenu.classList.contains("open")) {
        mobileMenu.style.maxHeight = mobileMenu.scrollHeight + "px";
        requestAnimationFrame(() => {
          mobileMenu.style.maxHeight = "0";
        });
        mobileMenu.classList.remove("open");
      } else {
        mobileMenu.classList.add("open");
        mobileMenu.style.maxHeight = "0";
        requestAnimationFrame(() => {
          mobileMenu.style.maxHeight = mobileMenu.scrollHeight + "px";
        });
      }
    });

    mobileMenu.addEventListener("transitionend", () => {
      if (!mobileMenu.classList.contains("open")) {
        mobileMenu.style.maxHeight = "";
      } else {
        mobileMenu.style.maxHeight = "";
      }
    });
  }

  // Copy Buttons for Crypto and IBAN
  const copyButtons = document.querySelectorAll(".copy-btn");
  copyButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const text = btn.getAttribute("data-copy");
      navigator.clipboard
        .writeText(text || "")
        .then(() => {
          btn.textContent = "Copied!";
          setTimeout(() => {
            btn.textContent = "Copy";
          }, 1500);
        })
        .catch(() => {});
    });
  });

  // Top Nav Hide/Show on Scroll
  const topNav = document.querySelector(".main-nav");
  if (topNav) {
    let lastScroll = 0;
    window.addEventListener("scroll", () => {
      const currentScroll = window.pageYOffset;

      if (currentScroll <= 0) {
        topNav.style.transform = "translateY(0)";
        return;
      }

      if (currentScroll > lastScroll) {
        topNav.style.transform = "translateY(-100%)";
      } else {
        topNav.style.transform = "translateY(0)";
      }

      lastScroll = currentScroll;
    });
  }

  function decodeTokenPayload(token) {
    if (!token) return null;
    const parts = token.split(".");
    if (parts.length < 2) return null;
    try {
      const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
      const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
      const json = atob(padded);
      return JSON.parse(json);
    } catch {
      return null;
    }
  }

  function getPlanFromToken(token) {
    const plan = decodeTokenPayload(token)?.plan || "free";
    return plan === "trial" ? "free" : plan;
  }

  function getAuthToken() {
    return localStorage.getItem("token");
  }

  function setSelectedPlan(planKey) {
    const cards = document.querySelectorAll(".plan-card");
    cards.forEach((card) => {
      const key = card.dataset.plan;
      const radio = card.querySelector('input[type="radio"]');
      const isSelected = key === planKey;
      if (radio) {
        radio.checked = isSelected;
      }
      card.classList.toggle("selected", isSelected);
    });
  }

  const PLAN_RANK = {
    free: 0,
    basic: 1,
    premium: 2,
    premium_plus: 3
  };

  const PLAN_CONFIG = {
    basic: { amount: 5, containerId: "#paypal-button-container-5" },
    premium: { amount: 10, containerId: "#paypal-button-container-10" },
    premium_plus: { amount: 20, containerId: "#paypal-button-container-20" }
  };

  async function fetchJson(url, options) {
    const res = await fetch(url, options);
    const text = await res.text();
    let data;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }

    if (!res.ok) {
      const isHtml = /^\s*</.test(text);
      const message =
        data?.error || (isHtml ? `Request failed (HTTP ${res.status}).` : text) || `HTTP ${res.status}`;
      const err = new Error(message);
      err.status = res.status;
      throw err;
    }

    return data ?? {};
  }

  function showPayPalFallback(message, { showAuthAction = false } = {}) {
    Object.values(PLAN_CONFIG).forEach((config) => {
      const container = document.querySelector(config.containerId);
      if (!container) return;
      const existing = container.querySelector(".paypal-fallback");
      if (existing) {
        const messageEl = existing.querySelector(".paypal-fallback-message");
        if (messageEl) {
          messageEl.textContent = message;
        } else {
          existing.textContent = message;
        }
        const action = existing.querySelector(".paypal-fallback-action");
        if (showAuthAction) {
          if (!action) {
            const link = document.createElement("a");
            link.className = "paypal-fallback-action";
            link.href = "/?auth=1&next=/subscription.html";
            link.textContent = "Login / Signup";
            existing.appendChild(link);
          }
        } else if (action) {
          action.remove();
        }
        return;
      }
      const el = document.createElement("div");
      el.className = "paypal-fallback";
      const messageEl = document.createElement("div");
      messageEl.className = "paypal-fallback-message";
      messageEl.textContent = message;
      el.appendChild(messageEl);
      if (showAuthAction) {
        const link = document.createElement("a");
        link.className = "paypal-fallback-action";
        link.href = "/?auth=1&next=/subscription.html";
        link.textContent = "Login / Signup";
        el.appendChild(link);
      }
      container.appendChild(el);
    });
  }

  function loadPayPalSdk() {
    if (window.paypal?.Buttons) {
      return Promise.resolve(true);
    }

    return fetchJson("/api/payments/paypal/config").then((data) => {
      const clientId = data?.clientId;
        if (!clientId) {
          throw new Error("PayPal client ID missing.");
        }
        return new Promise((resolve, reject) => {
          if (document.querySelector('script[data-paypal-sdk="true"]')) {
            return resolve(true);
          }
          const script = document.createElement("script");
          script.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(
            clientId
          )}&currency=EUR`;
          script.async = true;
          script.dataset.paypalSdk = "true";
          script.onload = () => resolve(true);
          script.onerror = () => reject(new Error("Failed to load PayPal SDK."));
          document.body.appendChild(script);
        });
      });
  }

  function updatePlanAvailability(currentPlan, tokens) {
    const rank = PLAN_RANK[currentPlan] ?? 0;
    const hasTokens = Number(tokens || 0) > 0;

    planRadios.forEach((radio) => {
      const key = radio.value;
      const keyRank = PLAN_RANK[key] ?? 0;
      const shouldDisable = hasTokens && keyRank < rank;
      radio.disabled = shouldDisable;
      const card = radio.closest(".plan-card");
      if (card) {
        card.classList.toggle("disabled", shouldDisable);
      }
    });

    if (hasTokens && rank > 0) {
      setSelectedPlan(currentPlan);
      renderPayPalButtonForPlan(currentPlan);
    }
  }

  const planRadios = document.querySelectorAll('input[name="plan"]');
  planRadios.forEach((radio) => {
    radio.addEventListener("change", () => {
      setSelectedPlan(radio.value);
      renderPayPalButtonForPlan(radio.value);
    });
  });

  const storedToken = localStorage.getItem("token");
  const initialPlan = getPlanFromToken(storedToken);
  setSelectedPlan(initialPlan);
  renderPayPalButtonForPlan(initialPlan);

  if (!storedToken) {
    showPayPalFallback("Please log in to pay with PayPal.", { showAuthAction: true });
  }

  if (storedToken) {
    fetch("/api/auth/me", {
      headers: { Authorization: `Bearer ${storedToken}` }
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data.error || "Failed to load profile.");
        }
        return data;
      })
      .then((data) => {
        if (data?.plan) {
          setSelectedPlan(data.plan);
          renderPayPalButtonForPlan(data.plan);
        }
        updatePlanAvailability(data?.plan || initialPlan, data?.tokens);
      })
      .catch(() => {});
  }

  function clearPayPalButtons() {
    Object.values(PLAN_CONFIG).forEach((config) => {
      const el = document.querySelector(config.containerId);
      if (el) {
        el.innerHTML = "";
      }
    });
  }

  function renderPayPalButtonForPlan(planKey) {
    const config = PLAN_CONFIG[planKey];
    if (!config) {
      clearPayPalButtons();
      return;
    }

    const token = getAuthToken();
    if (!token) {
      clearPayPalButtons();
      showPayPalFallback("Please log in to pay with PayPal.", { showAuthAction: true });
      return;
    }

    const container = document.querySelector(config.containerId);
    if (!container) return;

    loadPayPalSdk()
      .then(() => {
        if (!window.paypal?.Buttons) {
          showPayPalFallback("PayPal is currently unavailable. Please try again later.");
          return;
        }

        clearPayPalButtons();

        window.paypal
          .Buttons({
            style: {
              shape: "pill",
              color: "gold",
              layout: "vertical",
              label: "pay"
            },
            onClick: function () {
              setSelectedPlan(planKey);
            },
            createOrder: function () {
              setSelectedPlan(planKey);
              return createPayPalOrder(config.amount).then((result) => {
                if (!result?.ok || !result.orderId) {
                  throw new Error(result?.error || "Failed to create PayPal order.");
                }
                return result.orderId;
              });
            },
            onApprove: function (data) {
              return capturePayPalOrder(data.orderID).then((captureResult) => {
                if (!captureResult?.ok) {
                  throw new Error(captureResult?.error || "Failed to capture PayPal order.");
                }
                const planToApply = captureResult?.plan || planKey;
                setSelectedPlan(planToApply);
                window.location.href =
                  "thankyou.html?amount=" +
                  config.amount +
                  "&plan=" +
                  encodeURIComponent(planToApply);
              });
            },
            onError: function (err) {
              console.error(err);
              showPayPalFallback(
                err?.message || "There was an error processing the payment. Please try again."
              );
              alert(err?.message || "There was an error processing the payment.");
            }
          })
          .render(config.containerId);
      })
      .catch((err) => {
        console.error(err);
        if (err?.status === 404) {
          showPayPalFallback(
            "Payments are unavailable on this deployment (API not found). Please try again later."
          );
          return;
        }
        showPayPalFallback("PayPal failed to load. Please check your connection and try again.");
      });
  }

  async function createPayPalOrder(amount) {
    const token = getAuthToken();
    if (!token) return { ok: false, error: "Not authenticated. Please log in and try again." };

    try {
      const res = await fetch("/api/payments/paypal/create-order", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ amount })
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          localStorage.removeItem("token");
        }
        console.warn("Failed to create PayPal order", data);
        return { ok: false, error: data?.error || `Failed to create order (HTTP ${res.status}).` };
      }

      return {
        ok: true,
        orderId: data.id
      };
    } catch (err) {
      console.warn("Order create request failed", err);
      return { ok: false, error: "Order create request failed. Please try again." };
    }
  }

  async function capturePayPalOrder(orderId) {
    const token = getAuthToken();
    if (!token) return { ok: false, error: "Not authenticated. Please log in and try again." };
    if (!orderId) return { ok: false, error: "Missing PayPal order ID." };

    try {
      const res = await fetch("/api/payments/paypal/capture-order", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ orderId })
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          localStorage.removeItem("token");
        }
        console.warn("Failed to capture PayPal order", data);
        return { ok: false, error: data?.error || `Failed to capture order (HTTP ${res.status}).` };
      }

      if (data.token) {
        localStorage.setItem("token", data.token);
      }

      return {
        ok: true,
        plan: data.plan,
        totalTokens: data.totalTokens,
        tokensAdded: data.tokensAdded
      };
    } catch (err) {
      console.warn("Order capture request failed", err);
      return { ok: false, error: "Order capture request failed. Please try again." };
    }
  }

  // Bank Transfer QR Code with 10 EUR preset
  const bankQR = document.getElementById("bank-qr");
  if (bankQR && window.QRCode) {
    const epcData = [
      "BCD",
      "001",
      "1",
      "SCT",
      "OTPVRS22",
      "RADE KRSTIC",
      "RS35325934170593551847",
      "EUR10.00",
      "",
      "Donation for Diabetis Project"
    ].join("\n");

    new window.QRCode(bankQR, {
      text: epcData,
      width: 220,
      height: 220,
      correctLevel: window.QRCode.CorrectLevel.M
    });

    setTimeout(() => {
      const qrCanvas = bankQR.querySelector("canvas");
      if (qrCanvas) {
        const ctx = qrCanvas.getContext("2d");
        ctx.fillStyle = "rgba(255,255,255,0.8)";
        ctx.beginPath();
        ctx.arc(qrCanvas.width / 2, qrCanvas.height / 2, 30, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "#000";
        ctx.font = "bold 18px Arial";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("10€", qrCanvas.width / 2, qrCanvas.height / 2);
      }
    }, 500);
  }
});

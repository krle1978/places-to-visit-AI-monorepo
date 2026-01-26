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

  const PLAN_BY_AMOUNT = {
    5: "basic",
    10: "premium",
    20: "premium_plus"
  };

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
    return decodeTokenPayload(token)?.plan || "free";
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

  const planRadios = document.querySelectorAll('input[name="plan"]');
  planRadios.forEach((radio) => {
    radio.addEventListener("change", () => setSelectedPlan(radio.value));
  });

  const storedToken = localStorage.getItem("token");
  const initialPlan = getPlanFromToken(storedToken);
  setSelectedPlan(initialPlan);

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
        }
      })
      .catch(() => {});
  }

  async function createPayPalOrder(amount) {
    const token = localStorage.getItem("token");
    if (!token) return { ok: false };

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
        console.warn("Failed to create PayPal order", data);
        return { ok: false };
      }

      return {
        ok: true,
        orderId: data.id
      };
    } catch (err) {
      console.warn("Order create request failed", err);
      return { ok: false };
    }
  }

  async function capturePayPalOrder(orderId) {
    const token = localStorage.getItem("token");
    if (!token || !orderId) return { ok: false };

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
        console.warn("Failed to capture PayPal order", data);
        return { ok: false };
      }

      if (data.token) {
        localStorage.setItem("token", data.token);
      }

      const planKey =
        data.plan ||
        PLAN_BY_AMOUNT[data.amount] ||
        getPlanFromToken(data.token || localStorage.getItem("token")) ||
        "free";

      setSelectedPlan(planKey);

      return {
        ok: true,
        plan: planKey,
        totalTokens: data.totalTokens,
        tokensAdded: data.tokensAdded
      };
    } catch (err) {
      console.warn("Order capture request failed", err);
      return { ok: false };
    }
  }

  // PayPal Buttons
  function renderPayPalButton(containerId, amount, planKey) {
    if (!window.paypal?.Buttons) return;
    window.paypal
      .Buttons({
        style: {
          shape: "pill",
          color: "gold",
          layout: "vertical",
          label: "donate"
        },
        onClick: function () {
          setSelectedPlan(planKey);
        },
        createOrder: function () {
          setSelectedPlan(planKey);
          return createPayPalOrder(amount).then((result) => {
            if (!result?.ok || !result.orderId) {
              throw new Error("Failed to create PayPal order.");
            }
            return result.orderId;
          });
        },
        onApprove: function (data) {
          return capturePayPalOrder(data.orderID).then((captureResult) => {
            if (!captureResult?.ok) {
              throw new Error("Failed to capture PayPal order.");
            }
            const planToApply = captureResult?.plan || planKey;
            setSelectedPlan(planToApply);
            window.location.href =
              "thankyou.html?amount=" +
              amount +
              "&plan=" +
              encodeURIComponent(planToApply);
          });
        },
        onError: function (err) {
          console.error(err);
          alert("There was an error processing the donation.");
        }
      })
      .render(containerId);
  }

  renderPayPalButton("#paypal-button-container-5", 5, "basic");
  renderPayPalButton("#paypal-button-container-10", 10, "premium");
  renderPayPalButton("#paypal-button-container-20", 20, "premium_plus");

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

    const qr = new window.QRCode(bankQR, {
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

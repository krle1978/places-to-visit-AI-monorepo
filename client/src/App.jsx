console.log("NEW APP VERSION LOADED");
import { useEffect, useRef, useState } from "react";
import "./App.css";

const API = import.meta.env.VITE_API_URL;

const countryMap = {
  Albania: "recommendations_Albania_easy.json",
  Andorra: "recommendations_Andorra_easy.json",
  Armenia: "recommendations_Armenia_easy.json",
  Austria: "recommendations_austria_easy.json",
  Azerbaijan: "recommendations_Azerbaijan_easy.json",
  Belarus: "recommendations_Belarus_easy.json",
  Belgium: "recommendations_Belgium_easy.json",
  "Bosnia and Herzegowina": "recommendations_Bosnia_and_Herzegowina_easy.json",
  Bulgaria: "recommendations_bulgaria_easy.json",
  Croatia: "recommendations_croatia_easy.json",
  Cyprus: "recommendations_Cyprus_easy.json",
  "Czech Republic": "recommendations_czech_easy.json",
  Denmark: "recommendations_Denmark_easy.json",
  Estonia: "recommendations_Estonia_easy.json",
  Finland: "recommendations_Finland_easy.json",
  France: "recommendations_France_easy.json",
  Germany: "recommendations_germany_easy.json",
  Greece: "recommendations_greece_easy.json",
  Hungary: "recommendations_hungary_easy.json",
  Iceland: "recommendations_Iceland_easy.json",
  Ireland: "recommendations_Ireland_easy.json",
  Italy: "recommendations_Italy_easy.json",
  Latvia: "recommendations_Latvia_easy.json",
  Lithuania: "recommendations_Lithuania_easy.json",
  Luxembourg: "recommendations_Luxembourg_easy.json",
  Malta: "recommendations_Malta_easy.json",
  Moldova: "recommendations_Moldova_easy.json",
  Monaco: "recommendations_Monaco_easy.json",
  Montenegro: "recommendations_montenegro_easy.json",
  "North Macedonia": "recommendations_North_Macedonia_easy.json",
  Norway: "recommendations_Norway_easy.json",
  Poland: "recommendations_poland_easy.json",
  Portugal: "recommendations_portugal_easy.json",
  Romania: "recommendations_romania_easy.json",
  "Russia (Europe)": "recommendations_Russia_europe_easy.json",
  "San Marino": "recommendations_San_Marino_easy.json",
  Serbia: "recommendations_serbia_easy.json",
  Slovakia: "recommendations_slovakia_easy.json",
  Slovenia: "recommendations_Slovenia_easy.json",
  Spain: "recommendations_spain_easy.json",
  Sweden: "recommendations_Sweden_easy.json",
  Swizerland: "recommendations_Swizerland_easy.json",
  "Turkey (Europe)": "recommendations_Turkey_europe_easy.json",
  "United Kingdom": "recommendations_United_kingdom_easy.json"
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

function isSafeNextPath(value) {
  const next = String(value || "").trim();
  if (!next) return false;
  if (!next.startsWith("/")) return false;
  if (next.startsWith("//")) return false;
  return true;
}

function parseCityQuery(value) {
  const raw = String(value || "").trim();
  if (!raw) return { city: "", countryHint: "" };

  const parens = raw.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  if (parens) {
    const city = parens[1].trim();
    const countryHint = parens[2].trim();
    if (city && countryHint) return { city, countryHint };
  }

  const commaIndex = raw.indexOf(",");
  if (commaIndex >= 0) {
    const city = raw.slice(0, commaIndex).trim();
    const countryHint = raw.slice(commaIndex + 1).trim();
    if (city) return { city, countryHint };
  }

  return { city: raw, countryHint: "" };
}

export default function App() {
  const [email, setEmail] = useState("");
  const [loginName, setLoginName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [name, setName] = useState("");
  const [nameStatus, setNameStatus] = useState("idle");
  const [showPassword, setShowPassword] = useState(false);
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem("token"));
  const [plan, setPlan] = useState(getPlanFromToken(localStorage.getItem("token")));
  const [isServerReady, setIsServerReady] = useState(false);
  const [isServerDataReady, setIsServerDataReady] = useState(false);
  const [activeAuthTab, setActiveAuthTab] = useState("login");
  const [showAuth, setShowAuth] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [authNext, setAuthNext] = useState(null);
  const signupInFlightRef = useRef(false);

  const [error, setError] = useState("");
  const [signupMessage, setSignupMessage] = useState("");
  const [signupError, setSignupError] = useState("");
  const [signupLoading, setSignupLoading] = useState(false);
  const [missingCity, setMissingCity] = useState("");
  const [missingCityMessage, setMissingCityMessage] = useState("");
  const [missingCityCandidates, setMissingCityCandidates] = useState([]);
  const [, setMissingCitySuggestion] = useState(null);
  const [cityGenerateLoading, setCityGenerateLoading] = useState(false);
  const [cityGenerateError, setCityGenerateError] = useState("");
  const [aiInterests, setAiInterests] = useState("");
  const [showInterests, setShowInterests] = useState(false);

  useEffect(() => {
    setMissingCityCandidates([]);
  }, [missingCity]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlToken = params.get("token");
    const authRequested = ["1", "true", "yes"].includes(String(params.get("auth") || "").toLowerCase());
    const nextParam = params.get("next");

    if (authRequested) {
      setActiveAuthTab("login");
      setShowAuth(true);
      if (isSafeNextPath(nextParam)) {
        setAuthNext(nextParam);
      }
      params.delete("auth");
      params.delete("next");
    }

    if (urlToken) {
      localStorage.setItem("token", urlToken);
      setToken(urlToken);
      setPlan(getPlanFromToken(urlToken));
      params.delete("token");
    }

    if (authRequested || urlToken) {
      const next = params.toString();
      const newUrl = window.location.pathname + (next ? `?${next}` : "");
      window.history.replaceState({}, document.title, newUrl);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    let timeoutId = null;

    const pingServer = async () => {
      try {
        const res = await fetch(`${API}/`, { signal: controller.signal, cache: "no-store" });
        if (!res.ok) throw new Error("Server not ready.");
        if (!cancelled) setIsServerReady(true);
      } catch (err) {
        if (err.name === "AbortError") return;
        if (cancelled) return;
        timeoutId = window.setTimeout(pingServer, 900);
      }
    };

    pingServer();

    return () => {
      cancelled = true;
      controller.abort();
      if (timeoutId) window.clearTimeout(timeoutId);
    };
  }, []);

  useEffect(() => {
    if (!token) {
      setUser(null);
      setPlan("free");
      return;
    }

    setPlan(getPlanFromToken(token));

    let cancelled = false;
    const controller = new AbortController();

    async function loadUser() {
      try {
        const res = await fetch(`${API}/api/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "Failed to load user profile.");
        }
        if (!cancelled) {
          setUser(data);
          if (data?.plan) {
            setPlan(data.plan);
          }
        }
      } catch (err) {
        if (err.name === "AbortError") return;
        console.error(err);
        if (!cancelled) setUser(null);
      }
    }

    loadUser();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [token, user?.email, showAuth, showUserMenu]);

  useEffect(() => {
    if (activeAuthTab !== "signup") {
      setNameStatus("idle");
      return;
    }

    const trimmed = name.trim();
    if (!trimmed) {
      setNameStatus("idle");
      return;
    }

    let cancelled = false;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `${API}/api/auth/name-check?name=${encodeURIComponent(trimmed)}`,
          { signal: controller.signal }
        );
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "Failed to check name.");
        }
        if (!cancelled) {
          setNameStatus(data.available ? "available" : "taken");
        }
      } catch (err) {
        if (err.name === "AbortError") return;
        console.error(err);
        if (!cancelled) setNameStatus("idle");
      }
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      controller.abort();
    };
  }, [name, activeAuthTab]);

  useEffect(() => {
    const cleanup = [];
    const statefulImages = document.querySelectorAll("img.stateful-btn-image");

    statefulImages.forEach((img) => {
      const defaultSrc = img.dataset.default;
      const hoverSrc = img.dataset.hover;
      const activeSrc = img.dataset.active;
      const isLocked = () => img.dataset.locked === "true";
      const setSrc = (src) => {
        if (src) img.src = src;
      };

      const onEnter = () => {
        if (!isLocked()) setSrc(hoverSrc);
      };
      const onLeave = () => {
        if (!isLocked()) setSrc(defaultSrc);
      };
      const onDown = () => {
        if (!isLocked()) setSrc(activeSrc);
      };
      const onUp = () => {
        if (!isLocked()) setSrc(hoverSrc);
      };
      const onTouchStart = () => {
        if (!isLocked()) setSrc(activeSrc);
      };
      const onTouchEnd = () => {
        if (!isLocked()) setSrc(defaultSrc);
      };
      const onTouchCancel = () => {
        if (!isLocked()) setSrc(defaultSrc);
      };

      img.addEventListener("mouseenter", onEnter);
      img.addEventListener("mouseleave", onLeave);
      img.addEventListener("mousedown", onDown);
      img.addEventListener("mouseup", onUp);
      img.addEventListener("touchstart", onTouchStart);
      img.addEventListener("touchend", onTouchEnd);
      img.addEventListener("touchcancel", onTouchCancel);

      cleanup.push(() => {
        img.removeEventListener("mouseenter", onEnter);
        img.removeEventListener("mouseleave", onLeave);
        img.removeEventListener("mousedown", onDown);
        img.removeEventListener("mouseup", onUp);
        img.removeEventListener("touchstart", onTouchStart);
        img.removeEventListener("touchend", onTouchEnd);
        img.removeEventListener("touchcancel", onTouchCancel);
      });
    });

    return () => cleanup.forEach((fn) => fn());
  }, [token]);

  useEffect(() => {

    const cleanup = [];
    let cancelled = false;

    setIsServerDataReady(false);

    const gpsBtn = document.getElementById("gpsBtn") || document.getElementById("heroGpsBtn");
    const gpsImg = gpsBtn?.querySelector("img.stateful-btn-image");
    const citySearchInput = document.getElementById("city-search-input");
    const citySearchBtn = document.getElementById("city-search-btn");
    const citySearchSuggestions = document.getElementById("city-search-suggestions");

    const panel = document.getElementById("route-planner-panel");
    const openBtn = document.getElementById("toggle-planner-btn");

    if (panel && openBtn) {
      const onOpenClick = (event) => {
        event.stopPropagation();
        openPlannerPanel();
      };

      openBtn.addEventListener("click", onOpenClick);
      cleanup.push(() => openBtn.removeEventListener("click", onOpenClick));
    }

    const countrySelect = document.getElementById("route-country");
    const citySelect = document.getElementById("route-city");
    const submitBtn = document.getElementById("route-submit");
    const errorMsg = document.getElementById("route-error");
    const resultWrapper = document.querySelector(".route-result-wrapper");
    const routeFormWrapper = document.querySelector(".route-form-wrapper");
    const resultDiv = document.getElementById("route-result");
    const savePdfBtn = document.getElementById("save-pdf-btn");
    const geoPrompt = document.getElementById("geo-unknown");
    const geoPromptText = document.getElementById("geo-unknown-text");
    const geoMakeBtn = document.getElementById("geo-make-btn");
    const geoNearestBtn = document.getElementById("geo-nearest-btn");

    if (
      !countrySelect ||
      !citySelect ||
      !submitBtn ||
      !errorMsg ||
      !resultWrapper ||
      !resultDiv ||
      !savePdfBtn
    ) {
      return () => cleanup.forEach((fn) => fn());
    }

    let selectedCountry = null;
    let selectedCityObj = null;
    let pendingSelection = null;
    let countryFileMap = {};
    let countryDataCache = {};
    let isGeoLoading = false;
    let geoContext = null;
    let isNearestLoading = false;
    let isSearchLoading = false;
    const planKey = String(plan || "")
      .toLowerCase()
      .replace(/\s+/g, "_")
      .replace(/-+/g, "_");
    const allowAutoNearest = !["basic", "premium", "premium_plus"].includes(planKey);
    const isPremiumPlan = planKey === "premium" || planKey === "premium_plus";

    let countriesReadyDone = false;
    let resolveCountriesReady;
    const countriesReady = new Promise((resolve) => {
      resolveCountriesReady = resolve;
    });
    const markCountriesReady = () => {
      if (countriesReadyDone) return;
      countriesReadyDone = true;
      if (!cancelled) setIsServerDataReady(true);
      resolveCountriesReady();
      if (gpsImg) {
        gpsImg.dataset.locked = isServerReady ? "false" : "true";
      } else if (gpsBtn) {
        gpsBtn.dataset.locked = isServerReady ? "false" : "true";
      }
    };

    const isPlannerReady = () => isServerReady && countriesReadyDone;

    function parseTextBlock(text) {
      if (!text) return "<p>No data available.</p>";

      const segments = text.split("|").map((s) => s.trim()).filter(Boolean);

      const splitOutsideTags = (seg) => {
        let inTag = false;
        for (let i = 0; i < seg.length; i++) {
          const ch = seg[i];
          if (ch === "<") inTag = true;
          else if (ch === ">") inTag = false;
          else if (ch === ":" && !inTag) {
            return [seg.slice(0, i).trim(), seg.slice(i + 1).trim()];
          }
        }
        return null;
      };

      return (
        "<ul>" +
        segments
          .map((seg) => {
            const split = splitOutsideTags(seg);
            if (split) {
              const [label, rest] = split;
              return `<li><strong>${label}:</strong> ${rest}</li>`;
            }
            return `<li>${seg}</li>`;
          })
          .join("") +
        "</ul>"
      );
    }

    function parseFullDayText(text) {
      if (!text) return "<p>No itinerary available.</p>";

      if (typeof text === "object") {
        const preferredOrder = ["Morning", "Afternoon", "Sunset", "Night", "Evening"];
        const seen = new Set();
        let output = "";

        const normalizeContent = (value) => {
          if (Array.isArray(value)) return value.join("|");
          if (typeof value === "string") return value;
          if (value && typeof value === "object") return Object.values(value).join("|");
          return "";
        };

        const renderSection = (title, value) => {
          const content = normalizeContent(value);
          if (!content) return;
          output += `<h4>${title}</h4>`;
          output += parseTextBlock(content);
        };

        preferredOrder.forEach((key) => {
          if (text[key] !== undefined) {
            seen.add(key);
            renderSection(key, text[key]);
          }
        });

        Object.entries(text).forEach(([key, value]) => {
          if (seen.has(key)) return;
          renderSection(key, value);
        });

        return output || "<p>No itinerary available.</p>";
      }

      let output = "";
      const parts = String(text)
        .split("\n\n")
        .map((p) => p.trim())
        .filter(Boolean);

      parts.forEach((section) => {
        const idx = section.indexOf(":");
        if (idx === -1) return;

        const title = section.slice(0, idx).trim();
        const content = section.slice(idx + 1).trim();

        output += `<h4>${title}</h4>`;
        output += parseTextBlock(
          content.replace(/\u0192\u00c5'/g, "|").replace(/\u2192/g, "|")
        );
      });

      return output || "<p>No itinerary available.</p>";
    }

    function normalizeSeasonEntry(entry) {
      if (typeof entry === "string") return entry;

      if (entry && typeof entry === "object") {
        const title = entry.name || entry.title || entry.label || "";
        const link = entry.map_link || entry.link;
        const desc = entry.description || entry.detail || "";

        let label = title;
        if (link) {
          const anchorText = title || "View on map";
          label = `<a href="${link}" target="_blank" rel="noopener noreferrer">${anchorText}</a>`;
        } else if (!label && desc) {
          label = desc;
        }

        if (!label) return "";
        return desc && label !== desc ? `${label}: ${desc}` : label;
      }

      return "";
    }

    function renderSeasonList(list) {
      if (!list) return "";
      const arr = Array.isArray(list) ? list : [list];
      const normalized = arr.map(normalizeSeasonEntry).filter(Boolean);
      return normalized.length ? parseTextBlock(normalized.join("|")) : "";
    }

    function populateCountries(list) {
      clearSelect(countrySelect, "Select a country");
      list.forEach((country) => {
        const opt = document.createElement("option");
        opt.value = country.name;
        opt.textContent = country.name;
        countrySelect.appendChild(opt);
      });
      countrySelect.disabled = false;
    }

    const apiBases = [API].filter(
      (base, idx, arr) => base && arr.indexOf(base) === idx
    );

    async function fetchJsonWithFallback(pathname, options = {}) {
      let lastError;

      for (const base of apiBases) {
        try {
          const url = new URL(pathname, base).toString();
          const fetchOptions = { ...options };
          if (fetchOptions.body && !fetchOptions.headers) {
            fetchOptions.headers = { "Content-Type": "application/json" };
          }
          const res = await fetch(url, fetchOptions);
          const contentType = res.headers.get("content-type") || "";
          const isJson = contentType.includes("application/json");

          if (!res.ok) {
            const payload = isJson ? await res.json().catch(() => ({})) : {};
            const message = payload?.error || `Request failed (${res.status}).`;
            throw new Error(message);
          }

          if (!isJson) {
            throw new Error("Expected JSON from API.");
          }

          return await res.json();
        } catch (err) {
          lastError = err;
        }
      }

      throw lastError || new Error("Failed to load data.");
    }

    function loadCountries() {
      countrySelect.disabled = true;
      fetchJsonWithFallback("/api/countries")
        .then((data) => {
          const countries = Array.isArray(data?.countries) ? data.countries : [];
          countryFileMap = countries.reduce((acc, item) => {
            if (item?.name && item?.file) acc[item.name] = item.file;
            return acc;
          }, {});

          populateCountries(countries);
          applyPendingCitySelection();
          markCountriesReady();
        })
        .catch((err) => {
          console.error(err);
          countryFileMap = { ...countryMap };
          const fallback = Object.keys(countryMap).map((name) => ({ name, file: countryMap[name] }));
          populateCountries(fallback);
          markCountriesReady();
        });
    }

    loadCountries();

    const onCountryChange = function () {
      resetAll();

      const countryName = this.value;
      if (!countryName) return;

      const fileName = countryFileMap[countryName];
      if (!fileName) {
        errorMsg.textContent = "No data file for selected country.";
        return;
      }

      const path = `/api/countries/${encodeURIComponent(fileName)}`;

      fetchJsonWithFallback(path)
        .then((json) => {
          selectedCountry = json;
          populateCities(json.cities || []);
          applyPendingCitySelection();
        })
        .catch((err) => {
          console.error(err);
          errorMsg.textContent = err?.message || "Failed to load data.";
        });
    };

    countrySelect.addEventListener("change", onCountryChange);
    cleanup.push(() => countrySelect.removeEventListener("change", onCountryChange));

    function populateCities(cities) {
      clearSelect(citySelect, "Select a city");
      cities.forEach((city) => {
        const opt = document.createElement("option");
        opt.value = city.name;
        opt.textContent = city.name;
        citySelect.appendChild(opt);
      });

      citySelect.disabled = false;
      applyPendingCitySelection();
    }

    const onCityChange = function () {
      selectedCityObj = selectedCountry?.cities?.find((c) => c.name === this.value);
      submitBtn.disabled = !selectedCityObj;
    };

    citySelect.addEventListener("change", onCityChange);
    cleanup.push(() => citySelect.removeEventListener("change", onCityChange));

    const onSubmit = function () {
      resultDiv.innerHTML = "";
      errorMsg.textContent = "";

      if (!selectedCityObj) {
        errorMsg.textContent = "Please select a city.";
        return;
      }

      let html = "";

      html += `<h3>\uD83D\uDCC5 Full Day Plan</h3>`;
      html += parseFullDayText(selectedCityObj.full_day);

      html += `<h3>\uD83C\uDFAF Interests</h3>`;
      html += renderInterests(selectedCityObj.interests);

      html += "<h3>Places</h3>";
      html += renderLinkList(selectedCityObj.places, "No places listed.");

      html += "<h3>Hidden Gems</h3>";
      html += renderLinkList(selectedCityObj.hidden_gems, "No hidden gems listed.");

      html += `<h3>\uD83C\uDF7D Local Food</h3>`;
      html += `<p>${selectedCityObj.local_food_tip || "No food data available."}</p>`;

      html += `<h3>\uD83C\uDF26 Seasonal Tips</h3>`;
      if (selectedCityObj.seasons) {
        Object.entries(selectedCityObj.seasons).forEach(([key, season]) => {
          const eventText = season?.event ? ` - ${season.event}` : "";
          html += `<h4>${capitalize(key)}${eventText}</h4>`;

          if (season?.description) {
            html += `<p>${season.description}</p>`;
          }

          const ideasHtml = renderSeasonList(season?.ideas);
          const locationsHtml = renderSeasonList(season?.locations);

          if (ideasHtml || locationsHtml) {
            html += ideasHtml + locationsHtml;
          } else {
            html += "<p>No seasonal tips.</p>";
          }
        });
      } else {
        html += "<p>No seasonal tips.</p>";
      }

      html += `<h3>\uD83D\uDE86 Public Transport</h3>`;
      html += renderPublicTransport(selectedCityObj.public_transport_tips);

      html += `<h3>\uD83C\uDF89 City Events</h3>`;
      if (Array.isArray(selectedCityObj.city_events)) {
        html +=
          "<ul>" +
          selectedCityObj.city_events
            .map((ev) => {
              const title = ev?.website
                ? `<a href="${ev.website}" target="_blank" rel="noopener noreferrer">${
                    ev.name || "Event"
                  }</a>`
                : ev?.name || "Event";
              const season = capitalize(ev?.season);
              const desc = ev?.description?.trim() || "";
              const rawDates = ev?.dates || "";
              const cleanedDates = rawDates.replace(/^\s*\n?/, "");
              const datesLine = cleanedDates
                ? /^<b>\s*Duration:/i.test(cleanedDates)
                  ? cleanedDates
                  : `<b>Duration:</b> ${cleanedDates}`
                : "";
              const descHtml = desc ? `<div style="white-space: pre-line;">${desc}</div>` : "";
              const datesHtml = datesLine
                ? `<div style="white-space: pre-line;">${datesLine}</div>`
                : "";
              return `<li><strong>${title}${season ? ` (${season})` : ""}:</strong>${descHtml}${datesHtml}</li>`;
            })
            .join("") +
          "</ul>";
      } else {
        html += "<p>No city events.</p>";
      }

      resultDiv.innerHTML = html;
      resultWrapper.style.display = "block";
      setTimeout(() => {
        const scrollTarget = routeFormWrapper || resultWrapper;
        scrollTarget?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 50);

      savePdfBtn.onclick = function () {
        if (!window.html2pdf) {
          errorMsg.textContent = "PDF export is unavailable.";
          return;
        }

        const options = {
          filename: `${selectedCityObj.name}-route.pdf`,
          image: { type: "jpeg", quality: 0.98 },
          html2canvas: { scale: 2, useCORS: true },
          jsPDF: { unit: "mm", format: "a4" }
        };

        savePdfBtn.style.display = "none";

        window
          .html2pdf()
          .from(resultWrapper)
          .set(options)
          .save()
          .then(() => (savePdfBtn.style.display = "inline-block"));
      };
    };

    submitBtn.addEventListener("click", onSubmit);
    cleanup.push(() => submitBtn.removeEventListener("click", onSubmit));

    function clearSelect(sel, placeholder) {
      sel.innerHTML = "";
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = placeholder;
      sel.appendChild(opt);
    }

    function resetAll() {
      clearSelect(citySelect, "Select a city");
      citySelect.disabled = true;
      submitBtn.disabled = true;
      selectedCityObj = null;
      resultWrapper.style.display = "none";
      if (geoPrompt) geoPrompt.style.display = "none";
    }

    function capitalize(text) {
      return text ? text.charAt(0).toUpperCase() + text.slice(1) : "";
    }

    function renderPublicTransport(list) {
      if (!Array.isArray(list)) return "<p>No transport data.</p>";

      const items = list
        .map((item) => {
          if (typeof item === "string") return `<li>${item}</li>`;
          if (item && typeof item === "object") {
            const text = item.tip || "";
            if (!text) return "";
            if (item.link) {
              return `<li><a href="${item.link}" target="_blank" rel="noopener noreferrer">${text}</a></li>`;
            }
            return `<li>${text}</li>`;
          }
          return "";
        })
        .filter(Boolean);

      return items.length ? `<ul>${items.join("")}</ul>` : "<p>No transport data.</p>";
    }

    function renderInterests(list) {
      const normalized = Array.isArray(list)
        ? list
        : list && typeof list === "object"
          ? Object.entries(list).map(([category, items]) => ({
              name: category,
              activities: Array.isArray(items) ? items : []
            }))
          : null;

      if (!normalized) return "<p>No interests listed.</p>";

      const items = normalized
        .map((item) => {
          if (typeof item === "string") return `<li>${item}</li>`;
          if (!item || typeof item !== "object") return "";

          if (Array.isArray(item.activities)) {
            const activityItems = item.activities
              .map((act) => {
                if (!act || typeof act !== "object") return "";
                const name = act.name || "";
                if (!name) return "";
                const desc = act.description ? `<div>${act.description}</div>` : "";
                const title = act.map_link
                  ? `<a href="${act.map_link}" target="_blank" rel="noopener noreferrer">${name}</a>`
                  : name;
                return `<li>${title}${desc}</li>`;
              })
              .filter(Boolean);

            if (!activityItems.length) return "";
            const header = item.name ? `<div><strong>${item.name}</strong></div>` : "";
            return `<li>${header}<ul>${activityItems.join("")}</ul></li>`;
          }

          const text = item.name || "";
          if (!text) return "";
          const desc = item.description ? `<div>${item.description}</div>` : "";
          if (item.map_link) {
            return `<li><a href="${item.map_link}" target="_blank" rel="noopener noreferrer">${text}</a>${desc}</li>`;
          }
          return `<li>${text}${desc}</li>`;
        })
        .filter(Boolean);

      return items.length ? `<ul>${items.join("")}</ul>` : "<p>No interests listed.</p>";
    }

    function renderLinkList(list, emptyMessage) {
      if (!Array.isArray(list)) return `<p>${emptyMessage}</p>`;

      const items = list
        .map((item) => {
          if (typeof item === "string") return `<li>${item}</li>`;
          if (item && typeof item === "object") {
            const text = item.name || item.title || "";
            if (!text) return "";
            const desc = item.description ? `<div>${item.description}</div>` : "";
            const href = item.link || item.map_link;
            if (href) {
              return `<li><a href="${href}" target="_blank" rel="noopener noreferrer">${text}</a>${desc}</li>`;
            }
            return `<li>${text}${desc}</li>`;
          }
          return "";
        })
        .filter(Boolean);

      return items.length ? `<ul>${items.join("")}</ul>` : `<p>${emptyMessage}</p>`;
    }

    function normalizeName(value) {
      return value
        ? value
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[^a-z0-9\s]/g, "")
        : "";
    }

    function normalizeKey(value) {
      return normalizeName(value).replace(/\s+/g, "");
    }

    function findCountryName(input) {
      if (!input) return "";
      const aliases = {
        "bosnia and herzegovina": "Bosnia and Herzegowina",
        "cote divoire": "Cote d'Ivoire",
        czechia: "Czech Republic",
        "holy see": "Vatican City",
        macedonia: "North Macedonia",
        "north macedonia": "North Macedonia",
        "republic of moldova": "Moldova",
        russia: "Russia (Europe)",
        turkey: "Turkey (Europe)",
        "republic of turkey": "Turkey (Europe)",
        "russian federation": "Russia (Europe)",
        "slovak republic": "Slovakia",
        "swiss confederation": "Swizerland",
        switzerland: "Swizerland",
        turkiye: "Turkey (Europe)",
        "united kingdom of great britain and northern ireland": "United Kingdom"
      };

      const normalized = normalizeName(input);
      const alias = aliases[normalized];
      if (alias) return alias;

      const options = Object.keys(countryFileMap);
      const match = options.find((name) => normalizeName(name) === normalized);
      if (match) return match;

      const partial = options.find((name) => {
        const option = normalizeName(name);
        return option && normalized && option.startsWith(normalized);
      });

      return partial || "";
    }

    function resolveCityAlias(cityName, countryName) {
      if (!cityName) return "";
      const normalizedCountry = normalizeName(countryName);
      const normalizedCity = normalizeKey(cityName);
      const aliasesByCountry = {
        serbia: {
          belgrade: "Beograd",
          cityofbelgrade: "Beograd",
          citiofbelgrade: "Beograd",
          nis: "Niš"
        }
      };
      const countryAliases = aliasesByCountry[normalizedCountry];
      return countryAliases?.[normalizedCity] || cityName;
    }

    function findCityOption(cityName) {
      if (!cityName) return null;
      const resolvedCity = resolveCityAlias(cityName, countrySelect?.value || "");
      const normalized = normalizeName(resolvedCity);
      const targetKey = normalizeKey(resolvedCity);
      const exact = Array.from(citySelect.options).find(
        (opt) => normalizeName(opt.value) === normalized
      );
      if (exact) return exact;
      const loose = Array.from(citySelect.options).find((opt) => {
        const optKey = normalizeKey(opt.value);
        if (!optKey || !targetKey) return false;
        if (optKey === targetKey) return true;
        if (optKey.includes(targetKey) || targetKey.includes(optKey)) return true;
        return (
          optKey.length >= 2 &&
          targetKey.length >= 2 &&
          (optKey.startsWith(targetKey) || targetKey.startsWith(optKey))
        );
      });
      return loose || null;
    }

    function levenshtein(a, b) {
      if (a === b) return 0;
      if (!a) return b.length;
      if (!b) return a.length;

      const dp = Array.from({ length: a.length + 1 }, () => []);
      for (let i = 0; i <= a.length; i++) dp[i][0] = i;
      for (let j = 0; j <= b.length; j++) dp[0][j] = j;

      for (let i = 1; i <= a.length; i++) {
        for (let j = 1; j <= b.length; j++) {
          const cost = a[i - 1] === b[j - 1] ? 0 : 1;
          dp[i][j] = Math.min(
            dp[i - 1][j] + 1,
            dp[i][j - 1] + 1,
            dp[i - 1][j - 1] + cost
          );
        }
      }

      return dp[a.length][b.length];
    }

    async function findCityAcrossCountries(cityQuery) {
      const normalizedQuery = normalizeName(cityQuery);
      if (!normalizedQuery) return { match: null, suggestion: null };

      let best = null;
      let bestDistance = Infinity;

      const entries = Object.entries(countryFileMap);
      for (const [countryName, fileName] of entries) {
        if (!fileName) continue;
        let json = countryDataCache[fileName];
        if (!json) {
          try {
            json = await fetchJsonWithFallback(
              `/api/countries/${encodeURIComponent(fileName)}`
            );
            countryDataCache[fileName] = json;
          } catch (err) {
            console.error(err);
            continue;
          }
        }

        const cities = Array.isArray(json?.cities) ? json.cities : [];
        for (const city of cities) {
          const name = city?.name || "";
          const normalized = normalizeName(name);
          if (!normalized) continue;

          if (normalized === normalizedQuery) {
            return { match: { country: countryName, city: name }, suggestion: null };
          }

          const distance = levenshtein(normalized, normalizedQuery);
          if (distance < bestDistance) {
            bestDistance = distance;
            best = { country: countryName, city: name };
          }
        }
      }

      const maxDistance = normalizedQuery.length <= 5 ? 1 : 2;
      const suggestion = bestDistance <= maxDistance ? best : null;
      return { match: null, suggestion };
    }

    async function findNearestFromCityName(cityQuery, countryHint = "") {
      await countriesReady;
      const hint = String(countryHint || "").trim();
      const geo = await fetchJsonWithFallback(
        `/api/geo/locate?city=${encodeURIComponent(cityQuery)}${
          hint ? `&country=${encodeURIComponent(hint)}` : ""
        }`
      );
      const countryName = findCountryName(geo?.country);
      if (!countryName) {
        throw new Error(`No matching country found for "${geo?.country || "unknown"}".`);
      }

      const fileName = countryFileMap[countryName];
      if (!fileName) {
        throw new Error("No data file for selected country.");
      }

      const nearest = await fetchJsonWithFallback(
        `/api/geo/nearest?lat=${encodeURIComponent(
          geo.lat
        )}&lon=${encodeURIComponent(geo.lon)}&file=${encodeURIComponent(fileName)}`
      );
      const cityName = nearest?.city;
      if (!cityName) {
        throw new Error("No nearby city found.");
      }

      return { country: countryName, city: cityName };
    }

    async function applyPendingCitySelection() {
      if (!pendingSelection) return;
      if (pendingSelection.country && countrySelect.value !== pendingSelection.country) return;

      const targetCity = pendingSelection.city;
      if (!targetCity) return;

      const match = findCityOption(targetCity);

      if (match) {
        citySelect.value = match.value;
        citySelect.dispatchEvent(new Event("change"));
        if (pendingSelection.autoSubmit && !submitBtn.disabled) {
          onSubmit();
        }
        pendingSelection = null;
        if (geoPrompt) geoPrompt.style.display = "none";
        return;
      }

      if (
        pendingSelection.allowPrompt &&
        allowAutoNearest &&
        !isNearestLoading &&
        geoContext?.lat &&
        geoContext?.lon
      ) {
        const fileName = countryFileMap[geoContext.country];
        if (fileName) {
          isNearestLoading = true;
          try {
            const nearest = await fetchJsonWithFallback(
              `/api/geo/nearest?lat=${encodeURIComponent(
                geoContext.lat
              )}&lon=${encodeURIComponent(geoContext.lon)}&file=${encodeURIComponent(fileName)}`
            );
            const cityName = nearest?.city;
            const nearestMatch = cityName ? findCityOption(cityName) : null;
            if (nearestMatch) {
              citySelect.value = nearestMatch.value;
              citySelect.dispatchEvent(new Event("change"));
              if (pendingSelection.autoSubmit && !submitBtn.disabled) {
                onSubmit();
              }
              pendingSelection = null;
              if (geoPrompt) geoPrompt.style.display = "none";
              return;
            }
          } catch (err) {
            console.error(err);
          } finally {
            isNearestLoading = false;
          }
        }
      }

      if (pendingSelection.allowPrompt && geoPrompt) {
        if (geoPromptText) {
          geoPromptText.textContent = "This Location is for me unknown.";
        }
        geoPrompt.style.display = "block";
        pendingSelection.allowPrompt = false;
      }
    }

    async function resolveGeoLocation() {
      if (!isPlannerReady()) return;
      if (!gpsBtn || isGeoLoading) return;
      if (!navigator.geolocation) {
        errorMsg.textContent = "Geolocation is not supported.";
        return;
      }

      openPlannerPanel();
      errorMsg.textContent = "";
      isGeoLoading = true;
      if (gpsImg) {
        gpsImg.dataset.locked = "true";
      } else if (gpsBtn) {
        gpsBtn.dataset.locked = "true";
      }

      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          try {
            const { latitude, longitude } = pos.coords;
            const data = await fetchJsonWithFallback(
              `/api/geo/reverse?lat=${encodeURIComponent(
                latitude
              )}&lon=${encodeURIComponent(longitude)}`
            );

            const countryName = findCountryName(data?.country);
            const cityName = resolveCityAlias(data?.city || "", countryName);

            if (!countryName) {
              errorMsg.textContent = "No matching country found.";
              return;
            }

            geoContext = {
              country: countryName,
              city: cityName,
              lat: latitude,
              lon: longitude
            };
            if (geoPrompt) geoPrompt.style.display = "none";
            pendingSelection = {
              country: countryName,
              city: cityName,
              autoSubmit: true,
              allowPrompt: true
            };

            openPlannerPanel();

            if (countrySelect.value !== countryName) {
              countrySelect.value = countryName;
              countrySelect.dispatchEvent(new Event("change"));
            } else {
              applyPendingCitySelection();
            }
          } catch (err) {
            console.error(err);
            errorMsg.textContent = err?.message || "Failed to resolve location.";
          } finally {
            isGeoLoading = false;
            if (gpsImg) {
              gpsImg.dataset.locked = isPlannerReady() ? "false" : "true";
            } else if (gpsBtn) {
              gpsBtn.dataset.locked = isPlannerReady() ? "false" : "true";
            }
          }
        },
        (err) => {
          console.error(err);
          errorMsg.textContent = "Unable to access location.";
          isGeoLoading = false;
          if (gpsImg) {
            gpsImg.dataset.locked = isPlannerReady() ? "false" : "true";
          } else if (gpsBtn) {
            gpsBtn.dataset.locked = isPlannerReady() ? "false" : "true";
          }
        },
        { enableHighAccuracy: false, timeout: 10000 }
      );
    }

    if (gpsBtn) {
      if (gpsImg) {
        gpsImg.dataset.locked = isPlannerReady() ? "false" : "true";
      } else {
        gpsBtn.dataset.locked = isPlannerReady() ? "false" : "true";
      }

      const onGpsActivate = (event) => {
        if (event.type === "keydown" && !["Enter", " "].includes(event.key)) return;
        event.preventDefault();
        if (!isPlannerReady()) return;
        resolveGeoLocation();
      };

      gpsBtn.addEventListener("click", onGpsActivate);
      gpsBtn.addEventListener("keydown", onGpsActivate);
      cleanup.push(() => gpsBtn.removeEventListener("click", onGpsActivate));
      cleanup.push(() => gpsBtn.removeEventListener("keydown", onGpsActivate));
    }

    if (citySearchInput && citySearchBtn) {
      const canGenerateCity = ["basic", "premium", "premium_plus"].includes(planKey);
      let suggestTimer = null;
      let suggestRequestId = 0;
      const citySearchImg = citySearchBtn.querySelector("img.stateful-btn-image");

      const syncCitySearchBtnState = () => {
        const raw = parseCityQuery(citySearchInput.value).city.trim();
        const shouldDisable = !isPlannerReady() || isSearchLoading || !raw;
        citySearchBtn.disabled = shouldDisable;
        if (citySearchImg) citySearchImg.dataset.locked = shouldDisable ? "true" : "false";
      };

      const clearCitySuggestions = () => {
        if (!citySearchSuggestions) return;
        citySearchSuggestions.innerHTML = "";
        citySearchSuggestions.style.display = "none";
        citySearchSuggestions.setAttribute("aria-expanded", "false");
      };

      const renderCitySuggestions = (items) => {
        if (!citySearchSuggestions) return;
        if (!items.length) {
          clearCitySuggestions();
          return;
        }

        const list = document.createElement("ul");
        list.className = "city-search-suggestions-list";

        items.forEach((item) => {
          const li = document.createElement("li");
          const link = document.createElement("a");
          link.href = "#";
          link.className = "city-search-suggestion";
          link.textContent = `${item.city} (${item.country})`;
          link.dataset.city = item.city;
          link.dataset.country = item.country;
          li.appendChild(link);
          list.appendChild(li);
        });

        citySearchSuggestions.innerHTML = "";
        citySearchSuggestions.appendChild(list);
        citySearchSuggestions.style.display = "block";
        citySearchSuggestions.setAttribute("aria-expanded", "true");
      };

      const buildCitySuggestions = async (query) => {
        const normalizedQuery = normalizeName(query);
        if (!normalizedQuery) return [];

        const matches = [];
        const entries = Object.entries(countryFileMap);

        for (const [countryName, fileName] of entries) {
          if (!fileName) continue;
          let json = countryDataCache[fileName];
          if (!json) {
            try {
              json = await fetchJsonWithFallback(
                `/api/countries/${encodeURIComponent(fileName)}`
              );
              countryDataCache[fileName] = json;
            } catch (err) {
              console.error(err);
              continue;
            }
          }

          const cities = Array.isArray(json?.cities) ? json.cities : [];
          for (const city of cities) {
            const cityName = city?.name || "";
            const normalizedCity = normalizeName(cityName);
            if (!normalizedCity) continue;
            if (normalizedCity.includes(normalizedQuery)) {
              matches.push({ country: countryName, city: cityName });
              if (matches.length >= 12) return matches;
            }
          }
        }

        return matches;
      };

      const handleSuggestionSelection = async (countryName, cityName) => {
        if (!countryName || !cityName) return;

        openPlannerPanel();
        errorMsg.textContent = "";
        resultWrapper.style.display = "none";
        setMissingCity("");
        setMissingCityMessage("");
        setMissingCitySuggestion(null);
        setCityGenerateError("");

        await countriesReady;
        const fileName = countryFileMap[countryName];
        if (!fileName) {
          errorMsg.textContent = "No data file for selected country.";
          return;
        }

        pendingSelection = {
          country: countryName,
          city: cityName,
          autoSubmit: true
        };

        if (countrySelect.value !== countryName) {
          countrySelect.value = countryName;
          countrySelect.dispatchEvent(new Event("change"));
        } else {
          applyPendingCitySelection();
        }
      };

      const onSuggestionClick = (event) => {
        const target = event.target.closest("a[data-city][data-country]");
        if (!target) return;
        event.preventDefault();

        const cityName = target.dataset.city;
        const countryName = target.dataset.country;
        citySearchInput.value = cityName;
        syncCitySearchBtnState();
        clearCitySuggestions();
        handleSuggestionSelection(countryName, cityName);
      };

      const onCitySearch = async () => {
        if (isSearchLoading) return;
        const parsedQuery = parseCityQuery(citySearchInput.value);
        const raw = parsedQuery.city;
        const countryHint = parsedQuery.countryHint;
        const cityLabel = countryHint ? `${raw}, ${countryHint}` : raw;
        const interestsInput = document.getElementById("city-interests-input");
        const interests = (interestsInput?.value || "").trim();
        clearCitySuggestions();
        if (!raw) {
          setMissingCity("");
          setMissingCityMessage("");
          setMissingCitySuggestion(null);
          setCityGenerateError("");
          errorMsg.textContent = "Please enter a city name.";
          return;
        }

        if (raw.length > 10) {
          setMissingCity("");
          setMissingCityMessage("");
          setMissingCitySuggestion(null);
          setCityGenerateError("");
          errorMsg.textContent = "City name must be 10 characters or less.";
          return;
        }

        errorMsg.textContent = "";
        resultWrapper.style.display = "none";
        setMissingCity("");
        setMissingCityMessage("");
        setCityGenerateError("");
        isSearchLoading = true;
        syncCitySearchBtnState();

        try {
          if (isPremiumPlan && interests) {
            openPlannerPanel();
            const question = `City: ${cityLabel}\nInterests: ${interests}\nReturn the standard city guide JSON schema with content tailored to these interests.`;
            const aiData = await fetchJsonWithFallback("/api/ask", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`
              },
              body: JSON.stringify({ question })
            });
            applyTokenMeta(aiData?._meta);

            selectedCityObj = {
              ...aiData,
              name: aiData?.name || raw
            };
            onSubmit();
            return;
          }

          await countriesReady;
          if (!Object.keys(countryFileMap).length) {
            errorMsg.textContent = "Country list is not ready yet.";
            return;
          }

          const result = await findCityAcrossCountries(raw);
          if (result.match) {
            setMissingCity("");
            setMissingCityMessage("");
            setCityGenerateError("");
            pendingSelection = {
              country: result.match.country,
              city: result.match.city,
              autoSubmit: true
            };
            setMissingCitySuggestion(null);

            openPlannerPanel();
            if (countrySelect.value !== result.match.country) {
              countrySelect.value = result.match.country;
              countrySelect.dispatchEvent(new Event("change"));
            } else {
              applyPendingCitySelection();
            }
            return;
          }

          setMissingCity(raw);
          setMissingCitySuggestion(result.suggestion || null);
          if (result.suggestion) {
            errorMsg.textContent = `City not found. Did you mean ${result.suggestion.city}, ${result.suggestion.country}?`;
          } else {
            errorMsg.textContent = "";
          }

          if (isFree) {
            setMissingCityMessage(
              "We don't have that city in our offer. Showing the nearest city from our offer."
            );
            handleMissingCityNearest();
            return;
          }

          if (canGenerateCity) {
            setMissingCityMessage("City not found. Choose an option below.");
          } else {
            setMissingCityMessage(
              "This city is not available in our offer. You can show the nearest city from our offer, or upgrade your plan to generate it."
            );
          }
        } catch (err) {
          console.error(err);
          errorMsg.textContent = err?.message || "Failed to find city.";
        } finally {
          isSearchLoading = false;
          syncCitySearchBtnState();
        }
      };

      const onCitySearchKeydown = (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          onCitySearch();
        }
      };

      const onCitySearchInput = () => {
        const raw = parseCityQuery(citySearchInput.value).city.trim();
        syncCitySearchBtnState();
        if (!raw || raw.length > 10) {
          clearCitySuggestions();
          return;
        }

        if (suggestTimer) clearTimeout(suggestTimer);
        const requestId = ++suggestRequestId;
        suggestTimer = setTimeout(async () => {
          await countriesReady;
          if (requestId !== suggestRequestId) return;
          if (!Object.keys(countryFileMap).length) {
            clearCitySuggestions();
            return;
          }
          const items = await buildCitySuggestions(raw);
          if (requestId !== suggestRequestId) return;
          renderCitySuggestions(items);
        }, 150);
      };

      const onDocumentClick = (event) => {
        if (!citySearchSuggestions) return;
        if (
          citySearchSuggestions.contains(event.target) ||
          citySearchInput.contains(event.target)
        ) {
          return;
        }
        clearCitySuggestions();
      };

      citySearchBtn.addEventListener("click", onCitySearch);
      citySearchInput.addEventListener("input", onCitySearchInput);
      citySearchInput.addEventListener("keydown", onCitySearchKeydown);
      if (citySearchSuggestions) {
        citySearchSuggestions.addEventListener("click", onSuggestionClick);
      }
      document.addEventListener("click", onDocumentClick);

      syncCitySearchBtnState();
      cleanup.push(() => citySearchBtn.removeEventListener("click", onCitySearch));
      cleanup.push(() => citySearchInput.removeEventListener("input", onCitySearchInput));
      cleanup.push(() => citySearchInput.removeEventListener("keydown", onCitySearchKeydown));
      if (citySearchSuggestions) {
        cleanup.push(() => citySearchSuggestions.removeEventListener("click", onSuggestionClick));
      }
      cleanup.push(() => document.removeEventListener("click", onDocumentClick));
    }

    if (geoMakeBtn) {
      const onMakeLocation = async () => {
        if (!geoContext) return;
        if (!geoContext.country || !geoContext.city) return;

        const fileName = countryFileMap[geoContext.country];
        if (!fileName) {
          errorMsg.textContent = "No data file for selected country.";
          return;
        }

        geoMakeBtn.disabled = true;
        if (geoNearestBtn) geoNearestBtn.disabled = true;
        errorMsg.textContent = "";

        try {
          const payload = await fetchJsonWithFallback(
            `/api/countries/${encodeURIComponent(fileName)}/cities`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`
              },
              body: JSON.stringify({
                city: geoContext.city,
                country: geoContext.country
              })
            }
          );
          applyTokenMeta(payload?._meta);

          const updated = await fetchJsonWithFallback(
            `/api/countries/${encodeURIComponent(fileName)}`
          );

          selectedCountry = updated;
          populateCities(updated.cities || []);

          const createdCity = payload?.city || geoContext.city;
          const match = findCityOption(createdCity);
          if (match) {
            citySelect.value = match.value;
            citySelect.dispatchEvent(new Event("change"));
            onSubmit();
          }

          if (geoPrompt) geoPrompt.style.display = "none";
        } catch (err) {
          console.error(err);
          errorMsg.textContent = err?.message || "Failed to create location.";
        } finally {
          geoMakeBtn.disabled = false;
          if (geoNearestBtn) geoNearestBtn.disabled = false;
        }
      };

      geoMakeBtn.addEventListener("click", onMakeLocation);
      cleanup.push(() => geoMakeBtn.removeEventListener("click", onMakeLocation));
    }

    if (geoNearestBtn) {
      const onNearest = async () => {
        if (!geoContext) return;
        const fileName = countryFileMap[geoContext.country];
        if (!fileName) {
          errorMsg.textContent = "No data file for selected country.";
          return;
        }

        geoNearestBtn.disabled = true;
        if (geoMakeBtn) geoMakeBtn.disabled = true;
        errorMsg.textContent = "";

        try {
          const nearest = await fetchJsonWithFallback(
            `/api/geo/nearest?lat=${encodeURIComponent(geoContext.lat)}&lon=${encodeURIComponent(
              geoContext.lon
            )}&file=${encodeURIComponent(fileName)}`
          );

          const cityName = nearest?.city;
          if (!cityName) {
            errorMsg.textContent = "No nearby city found.";
            return;
          }

          pendingSelection = {
            country: geoContext.country,
            city: cityName,
            autoSubmit: true
          };

          openPlannerPanel();

          if (countrySelect.value !== geoContext.country) {
            countrySelect.value = geoContext.country;
            countrySelect.dispatchEvent(new Event("change"));
          } else {
            applyPendingCitySelection();
          }

          if (geoPrompt) geoPrompt.style.display = "none";
        } catch (err) {
          console.error(err);
          errorMsg.textContent = err?.message || "Failed to find nearest location.";
        } finally {
          geoNearestBtn.disabled = false;
          if (geoMakeBtn) geoMakeBtn.disabled = false;
        }
      };

      geoNearestBtn.addEventListener("click", onNearest);
      cleanup.push(() => geoNearestBtn.removeEventListener("click", onNearest));
    }

    async function refreshCountryData(countryName) {
      const fileName = countryFileMap[countryName];
      if (!fileName) {
        throw new Error("No data file for selected country.");
      }
      const json = await fetchJsonWithFallback(
        `/api/countries/${encodeURIComponent(fileName)}`
      );
      countryDataCache[fileName] = json;
      selectedCountry = json;
      populateCities(json.cities || []);
      applyPendingCitySelection();
    }

    function openPlannerPanel() {
      if (!panel) return;
      panel.classList.add("open");
      panel.classList.remove("collapsed");

      setTimeout(() => {
        panel.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 150);
    }

    window.routePlannerEasy = window.routePlannerEasy || {};
    window.routePlannerEasy.selectLocation = async function (
      countryName,
      cityName,
      autoSubmit = false,
      forceReload = false
    ) {
      if (!countryName) return;
      pendingSelection = { country: countryName, city: cityName, autoSubmit: Boolean(autoSubmit) };

      openPlannerPanel();

      if (countrySelect.value !== countryName) {
        countrySelect.value = countryName;
        countrySelect.dispatchEvent(new Event("change"));
      } else if (forceReload) {
        try {
          await refreshCountryData(countryName);
        } catch (err) {
          console.error(err);
          errorMsg.textContent = err?.message || "Failed to load data.";
        }
      } else {
        applyPendingCitySelection();
      }
    };
    window.routePlannerEasy.openPanel = openPlannerPanel;
    window.routePlannerEasy.findNearestFromCityName = async function (
      cityQuery,
      preferredCountryName = ""
    ) {
      const raw = String(cityQuery || "").trim();
      if (!raw) {
        throw new Error("Please enter a city name.");
      }

      await countriesReady;

      const preferred = String(preferredCountryName || "").trim();
      if (preferred && /^[a-z]{2}$/i.test(preferred)) {
        return await findNearestFromCityName(raw, preferred);
      }

      const resolvedPreferred = preferred
        ? countryFileMap[preferred]
          ? preferred
          : findCountryName(preferred)
        : "";

      if (resolvedPreferred) {
        const geo = await fetchJsonWithFallback(
          `/api/geo/locate?city=${encodeURIComponent(raw)}&country=${encodeURIComponent(preferred)}`
        );

        const fileName = countryFileMap[resolvedPreferred];
        if (!fileName) {
          throw new Error("No data file for selected country.");
        }

        const nearest = await fetchJsonWithFallback(
          `/api/geo/nearest?lat=${encodeURIComponent(
            geo.lat
          )}&lon=${encodeURIComponent(geo.lon)}&file=${encodeURIComponent(fileName)}`
        );
        const cityName = nearest?.city;
        if (!cityName) {
          throw new Error("No nearby city found.");
        }

        return { country: resolvedPreferred, city: cityName };
      }

      return await findNearestFromCityName(raw);
    };
    window.routePlannerEasy.getGeoCandidates = async function (
      cityQuery,
      preferredCountryName = "",
      limit = 8
    ) {
      const raw = String(cityQuery || "").trim();
      if (!raw) return [];
      await countriesReady;
      const preferred = String(preferredCountryName || "").trim();
      const params = new URLSearchParams();
      params.set("city", raw);
      params.set("limit", String(limit));
      if (preferred) params.set("country", preferred);
      const data = await fetchJsonWithFallback(`/api/geo/candidates?${params.toString()}`);
      return Array.isArray(data?.candidates) ? data.candidates : [];
    };
    window.routePlannerEasy.findNearestFromGeoCandidate = async function (
      candidate,
      preferredCountryName = ""
    ) {
      await countriesReady;
      const lat = Number(candidate?.lat);
      const lon = Number(candidate?.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        throw new Error("Invalid coordinates.");
      }

      const preferred = String(preferredCountryName || "").trim();
      const countryRaw = String(candidate?.country || "").trim();
      const countryName = findCountryName(countryRaw) || (preferred ? preferred : "");
      if (!countryName) {
        throw new Error(`No matching country found for "${countryRaw || "unknown"}".`);
      }

      const fileName = countryFileMap[countryName];
      if (!fileName) {
        throw new Error("No data file for selected country.");
      }

      const nearest = await fetchJsonWithFallback(
        `/api/geo/nearest?lat=${encodeURIComponent(
          lat
        )}&lon=${encodeURIComponent(lon)}&file=${encodeURIComponent(fileName)}`
      );
      const cityName = nearest?.city;
      if (!cityName) {
        throw new Error("No nearby city found.");
      }

      return { country: countryName, city: cityName };
    };
    window.routePlannerEasy.findNearestFromUser = async function () {
      if (!navigator.geolocation) {
        throw new Error("Geolocation is not supported.");
      }

      const position = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: false,
          timeout: 10000
        });
      });

      const { latitude, longitude } = position.coords || {};
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        throw new Error("Invalid coordinates.");
      }

      const geo = await fetchJsonWithFallback(
        `/api/geo/reverse?lat=${encodeURIComponent(latitude)}&lon=${encodeURIComponent(longitude)}`
      );
      const countryName = findCountryName(geo?.country);
      if (!countryName) {
        throw new Error("No matching country found.");
      }

      const fileName = countryFileMap[countryName];
      if (!fileName) {
        throw new Error("No data file for selected country.");
      }

      const nearest = await fetchJsonWithFallback(
        `/api/geo/nearest?lat=${encodeURIComponent(
          latitude
        )}&lon=${encodeURIComponent(longitude)}&file=${encodeURIComponent(fileName)}`
      );
      const cityName = nearest?.city;
      if (!cityName) {
        throw new Error("No nearby city found.");
      }

      return { country: countryName, city: cityName };
    };

    document.dispatchEvent(new Event("routePlanner:ready"));

    return () => {
      cancelled = true;
      cleanup.forEach((fn) => fn());
    };
  }, [token, isServerReady]);

  useEffect(() => {
    const scrollTopBtn = document.getElementById("scrollToTopBtn");
    if (!scrollTopBtn) return;

    const updateVisibility = () => {
      if (window.scrollY > 10) {
        scrollTopBtn.classList.add("is-visible");
      } else {
        scrollTopBtn.classList.remove("is-visible");
      }
    };

    const scrollToTop = () => {
      window.scrollTo({ top: 0, behavior: "smooth" });
    };

    let rafId = 0;
    const onScroll = () => {
      if (rafId) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = 0;
        updateVisibility();
      });
    };

    updateVisibility();
    scrollTopBtn.addEventListener("click", scrollToTop);
    window.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      scrollTopBtn.removeEventListener("click", scrollToTop);
      window.removeEventListener("scroll", onScroll);
      if (rafId) window.cancelAnimationFrame(rafId);
    };
  }, [token]);

  useEffect(() => {
    if (!showUserMenu) return;

    const onDocClick = (event) => {
      if (!event.target.closest(".header-user-menu")) {
        setShowUserMenu(false);
      }
    };

    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, [showUserMenu]);

  async function signup() {
    setSignupError("");
    setSignupMessage("");
    setError("");

    if (!name.trim()) {
      setSignupError("Name is required.");
      return;
    }
    if (!email || !password) {
      setSignupError("Email and password required.");
      return;
    }
    if (!isValidEmail(email)) {
      setSignupError("Please enter a valid email address.");
      return;
    }
    if (password.length < 8) {
      setSignupError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setSignupError("Passwords do not match.");
      return;
    }
    if (nameStatus === "taken") {
      setSignupError("Name already exists.");
      return;
    }

    if (signupInFlightRef.current) return;
    signupInFlightRef.current = true;
    setSignupLoading(true);
    try {
      const res = await fetch(`${API}/api/auth/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), email, password })
      });

      const data = await res.json();
      if (!res.ok) {
        if (res.status === 409 && String(data?.error || "").includes("Signup already pending")) {
          setSignupMessage(data.error);
          return;
        }
        throw new Error(data.error || "Signup failed.");
      }

      setSignupMessage(data.message || "Check your email to confirm your account.");
    } catch (err) {
      setSignupError(err.message);
    } finally {
      setSignupLoading(false);
      signupInFlightRef.current = false;
    }
  }

  async function login() {
    setError("");
    setSignupMessage("");
    setSignupError("");
    if (!loginName || !password) {
      setError("Username or email and password required.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    try {
      const res = await fetch(`${API}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: loginName.trim(),
          email: loginName.trim(),
          password
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      localStorage.setItem("token", data.token);
      setToken(data.token);
      setUser(data.user);
      setPlan(data.user?.plan || getPlanFromToken(data.token));
      setShowAuth(false);
      setShowUserMenu(false);
      if (authNext) {
        setAuthNext(null);
        window.location.href = authNext;
      }
    } catch (err) {
      setError(err.message);
    }
  }

  function logout() {
    localStorage.removeItem("token");
    setToken(null);
    setUser(null);
    setPlan("free");
    setError("");
    setShowUserMenu(false);
  }

  const isValidEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  const nameIsValid = Boolean(name.trim());
  const loginNameIsValid = Boolean(loginName.trim());
  const emailIsValid = isValidEmail(email);
  const passwordIsValid = password.length >= 8;
  const confirmMatches = password === confirmPassword;
  const canLogin = loginNameIsValid && passwordIsValid;
  const canSignup =
    nameIsValid &&
    emailIsValid &&
    passwordIsValid &&
    confirmMatches &&
    nameStatus !== "taken" &&
    !signupLoading;
  const planKey = String(plan || "")
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/-+/g, "_");
  const planLabels = {
    free: "Free",
    basic: "Basic",
    premium: "Premium",
    premium_plus: "Premium Plus"
  };
  const planIcons = {
    free: "\u{1F195}",
    basic: "\u2B50",
    premium: "\u{1F451}",
    premium_plus: "\u{1F48E}"
  };
  const planLabel = planLabels[planKey] || "Free";
  const planIcon = planIcons[planKey] || "\u{1F195}";
  const isFree = planKey === "free";
  const isPremium = planKey === "premium" || planKey === "premium_plus";
  const canGenerateCity = planKey === "basic" || isPremium;
  const greetingName = user?.name || user?.email || "";
  const tokenCount = user ? Number(user.tokens || 0) : null;

  const applyTokenMeta = (meta) => {
    if (!meta) return;
    const nextTokens = Number(meta.tokensRemaining);
    const nextPlan = meta.plan ? String(meta.plan) : null;

    if (Number.isFinite(nextTokens)) {
      setUser((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          tokens: nextTokens,
          plan: nextPlan || prev.plan
        };
      });
    }

    if (nextPlan) {
      setPlan(nextPlan);
    }
  };

  async function generateCityRoute(cityName = missingCity) {
    if (!cityName || cityGenerateLoading) return;
    if (!canGenerateCity) {
      setCityGenerateError("Your plan does not allow adding new cities.");
      return;
    }

    setCityGenerateLoading(true);
    setCityGenerateError("");

    try {
      const res = await fetch(`${API}/api/cities/generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ city: cityName })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to Generate This City data.");
      applyTokenMeta(data?._meta);

      if (window.routePlannerEasy?.selectLocation) {
        window.routePlannerEasy.selectLocation(data.country, data.city, true, true);
        setMissingCity("");
        setMissingCityMessage("");
        setMissingCitySuggestion(null);
      } else {
        setCityGenerateError("Route planner is not ready yet.");
      }
    } catch (err) {
      setCityGenerateError(err.message);
    } finally {
      setCityGenerateLoading(false);
    }
  }

  const openSubscriptions = () => {
    window.location.href = "/subscription.html";
  };

  const handleMissingCityMake = async () => {
    if (!missingCity || cityGenerateLoading) return;
    setCityGenerateError("");
    setMissingCityMessage(`Generating data for ${missingCity}...`);
    setMissingCityCandidates([]);
    await generateCityRoute(missingCity);
  };

  const handleMissingCityNearest = async () => {
    if (cityGenerateLoading) return;
    setCityGenerateError("");
    setMissingCityMessage("Finding nearest city...");
    setMissingCityCandidates([]);
    setCityGenerateLoading(true);

    try {
      const rawInput =
        document.getElementById("city-search-input")?.value?.trim() || String(missingCity || "");
      const parsed = parseCityQuery(rawInput);
      const raw = parsed.city;
      const inputCountryHint = parsed.countryHint;
      const preferredCountry = document.getElementById("route-country")?.value?.trim() || "";
      const countryHint = inputCountryHint || preferredCountry;

      if (
        !window.routePlannerEasy?.getGeoCandidates ||
        !window.routePlannerEasy?.findNearestFromGeoCandidate
      ) {
        throw new Error("Route planner is not ready yet.");
      }

      const candidates = await window.routePlannerEasy.getGeoCandidates(raw, countryHint, 8);
      if (!candidates.length) {
        throw new Error("No matching city found.");
      }

      if (candidates.length === 1) {
        const nearest = await window.routePlannerEasy.findNearestFromGeoCandidate(
          candidates[0],
          preferredCountry
        );
        window.routePlannerEasy.selectLocation(nearest.country, nearest.city, true);
        setMissingCity("");
        setMissingCityMessage("");
        return;
      }

      setMissingCityMessage("Select the city you meant:");
      setMissingCityCandidates(candidates);
    } catch (err) {
      setCityGenerateError(err.message || "Failed to find nearest city.");
    } finally {
      setCityGenerateLoading(false);
    }
  };

  const handleMissingCityCandidateClick = async (candidate) => {
    if (cityGenerateLoading) return;
    setCityGenerateError("");
    setMissingCityMessage("Finding nearest city...");
    setCityGenerateLoading(true);

    try {
      const preferredCountry = document.getElementById("route-country")?.value?.trim() || "";
      if (!window.routePlannerEasy?.findNearestFromGeoCandidate) {
        throw new Error("Route planner is not ready yet.");
      }

      const nearest = await window.routePlannerEasy.findNearestFromGeoCandidate(
        candidate,
        preferredCountry
      );
      window.routePlannerEasy.selectLocation(nearest.country, nearest.city, true);
      setMissingCity("");
      setMissingCityMessage("");
      setMissingCityCandidates([]);
    } catch (err) {
      setCityGenerateError(err.message || "Failed to find nearest city.");
    } finally {
      setCityGenerateLoading(false);
    }
  };

  if (!token && showAuth) {
    return (
      <div className="login-shell">
        <img
          className="login-banner"
          src="/Banner/Places To Visit Banner.png"
          alt="Places To Visit"
        />
        <div className="login-card-wrap">
          <div className="login-card">
            <h2>Welcome back</h2>
            <p className="login-tagline">Access your personalized city planner.</p>

          <div className="auth-tabs" role="tablist" aria-label="Authentication">
            <button
              type="button"
              role="tab"
              aria-selected={activeAuthTab === "login"}
              className={`auth-tab${activeAuthTab === "login" ? " active" : ""}`}
              onClick={() => {
                setActiveAuthTab("login");
                setError("");
                setSignupError("");
                setSignupMessage("");
              }}
            >
              Login
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeAuthTab === "signup"}
              className={`auth-tab${activeAuthTab === "signup" ? " active" : ""}`}
              onClick={() => {
                setActiveAuthTab("signup");
                setError("");
                setSignupError("");
                setSignupMessage("");
              }}
            >
              Signup
            </button>
          </div>
            <button
              type="button"
              className="btn ghost"
              onClick={() => {
                setShowAuth(false);
                setAuthNext(null);
              }}
            >
              Continue as Guest
            </button>

            {activeAuthTab === "login" ? (
              <>
                <label className="login-field">
                  Username or email
                  <input
                    type="text"
                    placeholder="Username or email"
                    value={loginName}
                    onChange={(e) => setLoginName(e.target.value)}
                    autoComplete="username"
                    required
                  />
                </label>

                <label className="login-field">
                  Password
                  <div className="password-field">
                    <input
                      type={showPassword ? "text" : "password"}
                      placeholder="Password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="current-password"
                      minLength={8}
                      required
                    />
                    <button
                      className="password-toggle"
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                        <path
                          d="M12 5c5.5 0 9.5 4.2 10.8 6-1.3 1.8-5.3 6-10.8 6S2.5 12.8 1.2 11C2.5 9.2 6.5 5 12 5zm0 3.2a2.8 2.8 0 1 0 0 5.6 2.8 2.8 0 0 0 0-5.6z"
                          fill="currentColor"
                        />
                      </svg>
                    </button>
                  </div>
                </label>

                <button
                  onClick={login}
                  className="image-btn"
                  type="button"
                  aria-label="Login"
                  disabled={!canLogin}
                >
                  <img
                    className="stateful-btn-image"
                    src="/buttons/Login/btn_Login_original.png"
                    alt="Login"
                    data-default="/buttons/Login/btn_Login_original.png"
                    data-hover="/buttons/Login/btn_Login_hover.png"
                    data-active="/buttons/Login/btn_Login_click.png"
                    data-locked={canLogin ? "false" : "true"}
                  />
                </button>

                {error && <div className="form-error">{error}</div>}
              </>
            ) : (
              <>
                <label className="login-field">
                  Name
                  <input
                    type="text"
                    placeholder="Name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    autoComplete="name"
                    required
                  />
                </label>
                {name.trim() && nameStatus !== "idle" && (
                  <div
                    className={`name-status ${
                      nameStatus === "available" ? "available" : "taken"
                    }`}
                  >
                    {nameStatus === "available" ? "New User" : "Existing User"}
                  </div>
                )}

                <label className="login-field">
                  Email
                  <input
                    type="email"
                    placeholder="Email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    required
                  />
                </label>

                <label className="login-field">
                  Password
                  <div className="password-field">
                    <input
                      type={showPassword ? "text" : "password"}
                      placeholder="Password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="new-password"
                      minLength={8}
                      required
                    />
                    <button
                      className="password-toggle"
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                        <path
                          d="M12 5c5.5 0 9.5 4.2 10.8 6-1.3 1.8-5.3 6-10.8 6S2.5 12.8 1.2 11C2.5 9.2 6.5 5 12 5zm0 3.2a2.8 2.8 0 1 0 0 5.6 2.8 2.8 0 0 0 0-5.6z"
                          fill="currentColor"
                        />
                      </svg>
                    </button>
                  </div>
                </label>

                <label className="login-field">
                  Confirm Password
                  <div className="password-field">
                    <input
                      type={showPassword ? "text" : "password"}
                      placeholder="Confirm password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      autoComplete="new-password"
                      minLength={8}
                      required
                    />
                    <button
                      className="password-toggle"
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                        <path
                          d="M12 5c5.5 0 9.5 4.2 10.8 6-1.3 1.8-5.3 6-10.8 6S2.5 12.8 1.2 11C2.5 9.2 6.5 5 12 5zm0 3.2a2.8 2.8 0 1 0 0 5.6 2.8 2.8 0 0 0 0-5.6z"
                          fill="currentColor"
                        />
                      </svg>
                    </button>
                  </div>
                </label>

                <button
                  onClick={signup}
                  className="image-btn"
                  type="button"
                  aria-label={signupLoading ? "Sending" : "Signup"}
                  disabled={!canSignup}
                >
                  <img
                    className="stateful-btn-image"
                    src="/buttons/Signup/btn_Signup_original.png"
                    alt="Signup"
                    data-default="/buttons/Signup/btn_Signup_original.png"
                    data-hover="/buttons/Signup/btn_Signup_hover.png"
                    data-active="/buttons/Signup/btn_Signup_click.png"
                    data-locked={canSignup ? "false" : "true"}
                  />
                </button>

                {signupError && <div className="form-error">{signupError}</div>}
                {signupMessage && <div className="form-success">{signupMessage}</div>}
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <header className="site-header" data-include="/components/header.html">
        <div className="header-title">
          <img
            className="brand"
            src="/Banner/City_Path_Banner.png"
            alt="Places To Visit"
          />
          {user?.email && (
            <div className="header-user">
              Welcome {greetingName}
              {typeof tokenCount === "number" && (
                <span aria-label={`Tokens: ${tokenCount}`}>({tokenCount} tokens)</span>
              )}
              <span className="plan-icon" title={planLabel} aria-label={planLabel}>
                {planIcon}
              </span>
            </div>
          )}
        </div>
        {token ? (
          <div className="header-user-menu header-auth-btn">
            <button
              className="user-menu-btn"
              type="button"
              aria-haspopup="menu"
              aria-expanded={showUserMenu ? "true" : "false"}
              onClick={() => setShowUserMenu((prev) => !prev)}
            >
              <span className="user-menu-label">
                <span className="user-menu-icon" aria-hidden="true">
                  {planIcon}
                </span>
                {greetingName || "My Account"}
                {typeof tokenCount === "number" && (
                  <span aria-label={`Tokens: ${tokenCount}`}>({tokenCount})</span>
                )}
              </span>
            </button>
            {showUserMenu && (
              <div className="user-menu-dropdown" role="menu">
                <button
                  className="user-menu-item"
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setShowUserMenu(false);
                    window.location.href = "/about.html";
                  }}
                >
                  About Me
                </button>
                <button
                  className="user-menu-item"
                  type="button"
                  role="menuitem"
                  onClick={openSubscriptions}
                >
                  Change My Plan
                </button>
                <button
                  className="user-menu-item"
                  type="button"
                  role="menuitem"
                  onClick={logout}
                >
                  Logout
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="header-auth-actions header-auth-btn">
            <button
              className="header-plan-btn"
              type="button"
              onClick={openSubscriptions}
              aria-label="Make Your Plan"
            >
              Make Your Plan
            </button>
            <button
              className="image-btn"
              type="button"
              onClick={() => {
                setAuthNext(null);
                setShowAuth(true);
              }}
              aria-label="Login"
            >
              <img
                className="stateful-btn-image"
                src="/buttons/Login_Signup/btn_LoginSignup_original.png"
                alt="Login"
                data-default="/buttons/Login_Signup/btn_LoginSignup_original.png"
                data-hover="/buttons/Login_Signup/btn_LoginSignup_hover.png"
                data-active="/buttons/Login_Signup/btn_LoginSignup_click.png"
              />
            </button>
          </div>
        )}
      </header>

      <main>
        <section className="hero">
          <div className="hero-text">
            <h1>Explore European cities your way.</h1>
            <p className="tagline">
              CityPath is a Travel Assistance platform that creates personalized city routes for
              independent travelers across Europe.
            </p>

            <div className="hero-cta-row">
              <button
                type="button"
                className="hero-cta hero-cta-primary"
                onClick={() => {
                  document
                    .getElementById("route-planner-panel")
                    ?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
              >
                Build My City Path
              </button>
              <button
                type="button"
                className="hero-cta hero-cta-secondary"
                onClick={() => {
                  window.location.href = "/about.html";
                }}
              >
                Discover How It Works
              </button>
            </div>
          </div>

          <div className="hero-visual" aria-hidden="true">
            <button
              id="heroGpsBtn"
              className="hero-visual-gps"
              type="button"
              aria-label="Explore My location"
              disabled={!(isServerReady && isServerDataReady)}
            >
              <span className="hero-visual-gps-label">Explore My location!</span>
              <span className="hero-visual-gps-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    d="M10.8 2.8c-.9 0-1.6.7-1.6 1.6V12l-1-.7c-.8-.6-2-.5-2.7.2-.8.8-.8 2-.2 2.8l2.6 3.4c.6.8 1.6 1.3 2.6 1.3h3.1c1.8 0 3.3-1.3 3.6-3.1l.8-4.6c.2-1.4-.9-2.7-2.3-2.7h-3.2V4.4c0-.9-.7-1.6-1.6-1.6-.9 0-1.6.7-1.6 1.6v1.2"
                    fill="currentColor"
                    opacity="0.96"
                  />
                  <path
                    d="M10.8 2.8c-.9 0-1.6.7-1.6 1.6V12l-1-.7c-.8-.6-2-.5-2.7.2-.8.8-.8 2-.2 2.8l2.6 3.4c.6.8 1.6 1.3 2.6 1.3h3.1c1.8 0 3.3-1.3 3.6-3.1l.8-4.6c.2-1.4-.9-2.7-2.3-2.7h-3.2V4.4c0-.9-.7-1.6-1.6-1.6-.9 0-1.6.7-1.6 1.6v1.2"
                    stroke="rgba(0,0,0,0.25)"
                    fill="none"
                    strokeWidth="0.6"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                </svg>
              </span>
            </button>
            <span className="hero-marker hero-marker--plaza">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M6.5 7.5h11v11h-11zM9.5 10.5h5v5h-5z"
                  stroke="currentColor"
                  fill="none"
                  strokeWidth="1.8"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            <span className="hero-marker hero-marker--castle">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M6.5 20V10.5l2-1v-2l2 1.2 1.5-1 1.5 1 2-1.2v2l2 1V20M8.5 20v-4h7v4"
                  stroke="currentColor"
                  fill="none"
                  strokeWidth="1.8"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              </svg>
            </span>
            <span className="hero-marker hero-marker--church">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M12 3.5v4M10 5.5h4M7.5 20V11l4.5-3.2L16.5 11v9M10 20v-4h4v4"
                  stroke="currentColor"
                  fill="none"
                  strokeWidth="1.8"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              </svg>
            </span>
            <span className="hero-marker hero-marker--monument">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M11 4h2l1 3-1 2v7h2v2H9v-2h2V9l-1-2 1-3zM7 20h10"
                  stroke="currentColor"
                  fill="none"
                  strokeWidth="1.8"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              </svg>
            </span>
            <span className="hero-marker hero-marker--food">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M6.5 4.5v7M4.5 4.5v7M8.5 4.5v7M6.5 11.5v8M13.5 7.5c0-2 1.5-3 3-3v15h-3v-12zM19.5 9.5h-3"
                  stroke="currentColor"
                  fill="none"
                  strokeWidth="1.8"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              </svg>
            </span>
            <span className="hero-marker hero-marker--museum">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M5 10h14M6.5 10v9M10 10v9M14 10v9M17.5 10v9M4.5 19.5h15M6 9l6-3 6 3"
                  stroke="currentColor"
                  fill="none"
                  strokeWidth="1.8"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              </svg>
            </span>
          </div>

          <div className="hero-actions">
            {typeof tokenCount === "number" && (
              <div className="token-panel" aria-label={`Tokens: ${tokenCount}`}>
                <div className="token-count">Tokens: {tokenCount}</div>
                <button
                  className="image-btn token-upgrade-btn"
                  type="button"
                  aria-label="Upgrade plan"
                  onClick={openSubscriptions}
                >
                  <img
                    className="stateful-btn-image"
                    src="/buttons/btn_Empty/btn_emptx_original.png"
                    alt="Upgrade"
                    data-default="/buttons/btn_Empty/btn_emptx_original.png"
                    data-hover="/buttons/btn_Empty/btn_emptx_hover.png"
                    data-active="/buttons/btn_Empty/btn_emptx_click.png"
                  />
                  <span className="token-upgrade-label">Upgrade ↑</span>
                </button>
              </div>
            )}
            <div className="city-search">
              <input
                id="city-search-input"
                type="text"
                maxLength={10}
                placeholder="Type city (max 10)"
                disabled={!(isServerReady && isServerDataReady)}
              />
              <div
                id="city-search-suggestions"
                className="city-search-suggestions"
                role="listbox"
                aria-label="City suggestions"
                aria-live="polite"
              ></div>
              {isPremium && (
                <div className={`city-interests ${showInterests ? "open" : ""}`}>
                  <button
                    type="button"
                    className="city-interests-toggle"
                    aria-expanded={showInterests ? "true" : "false"}
                    aria-controls="city-interests-input"
                    onClick={() => setShowInterests((prev) => !prev)}
                  >
                    <span>Interests</span>
                    <span className="city-interests-arrow" aria-hidden="true">
                      {showInterests ? "▲" : "▼"}
                    </span>
                  </button>
                  {showInterests && (
                    <input
                      id="city-interests-input"
                      type="text"
                      placeholder="street food, modern art, live music"
                      value={aiInterests}
                      onChange={(e) => setAiInterests(e.target.value)}
                    />
                  )}
                </div>
              )}
              <button
                id="city-search-btn"
                className="image-btn"
                type="button"
                aria-label="Find This City"
              >
                <img
                  className="stateful-btn-image"
                  src="/buttons/Find This City/btn_FindThisCity_original.png"
                  alt="Find This City"
                  data-default="/buttons/Find This City/btn_FindThisCity_original.png"
                  data-hover="/buttons/Find This City/btn_FindThisCity_hover.png"
                  data-active="/buttons/Find This City/btn_FindThisCity_click.png"
                />
              </button>
              {missingCity && (
                <div className="city-search-missing">
                  <div className={canGenerateCity ? "form-success" : "form-error"}>
                    {missingCityMessage ||
                      (canGenerateCity
                        ? `Generating data for ${missingCity}...`
                        : "This city is not available in our offer. You can show the nearest city from our offer, or upgrade your plan to generate it.")}
                  </div>
                  {!canGenerateCity && (
                    <button className="btn ghost" type="button" onClick={openSubscriptions}>
                      Change Your Plan
                    </button>
                  )}
                  {canGenerateCity && cityGenerateError && (
                    <div className="form-error">{cityGenerateError}</div>
                  )}
                  <div className="city-search-actions">
                    {canGenerateCity && (
                      <button
                        onClick={handleMissingCityMake}
                        disabled={cityGenerateLoading}
                        className="btn"
                        type="button"
                      >
                        {cityGenerateLoading ? "Working..." : "Generate This City"}
                      </button>
                    )}
                    <button
                      onClick={handleMissingCityNearest}
                      disabled={cityGenerateLoading || !(isServerReady && isServerDataReady)}
                      className="btn ghost btn-empty-image"
                      type="button"
                    >
                      {cityGenerateLoading ? "Working..." : "Show nearest city"}
                    </button>
                    {!!missingCityCandidates.length && (
                      <div
                        className="city-search-suggestions city-search-candidates"
                        role="listbox"
                        aria-label="Choose a city"
                      >
                        <ul className="city-search-suggestions-list">
                          {missingCityCandidates.map((item, idx) => (
                            <li key={`${item?.displayName || item?.city || "candidate"}-${idx}`}>
                              <a
                                href="#"
                                className="city-search-suggestion"
                                title={item?.displayName || ""}
                                onClick={(event) => {
                                  event.preventDefault();
                                  handleMissingCityCandidateClick(item);
                                }}
                              >
                                {(item?.city || "Unknown") + (item?.country ? ` (${item.country})` : "")}
                              </a>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div id="category-selector">
              <fieldset>
                <legend>Choose what you want to find nearby:</legend>
                <label>
                  <input type="checkbox" className="category" value="Museums" /> Museums
                </label>
                <label>
                  <input type="checkbox" className="category" value="Restaurants" /> Restaurants
                </label>
                <label>
                  <input type="checkbox" className="category" value="Cafes" /> Cafes
                </label>
                <label>
                  <input type="checkbox" className="category" value="Hotels" /> Hotels
                </label>
              </fieldset>
              <button id="show-map-btn" className="btn" type="button">
                Show Me!
              </button>
            </div>

          </div>
        </section>

        <section className="city-section route-planner-wrapper">
          <div className="route-planner-header">
            <h2>Choose Your Place To Visit</h2>
          </div>

          <div id="route-planner-panel" className="route-planner-panel open">
            <div className="route-planner">
              <div className="route-form-wrapper">
                <div className="route-form">
                  <label htmlFor="route-country">Country</label>
                  <select id="route-country" defaultValue="">
                    <option value="">Select a country</option>
                  </select>

                  <label htmlFor="route-city">City</label>
                  <select id="route-city" disabled defaultValue="">
                    <option value="">Select a city</option>
                  </select>

                  <button
                    id="route-submit"
                    className="image-btn"
                    type="button"
                    disabled
                    aria-label="Create My Route"
                  >
                    <img
                      className="stateful-btn-image"
                      src="/buttons/btn_Empty/btn_emptx_original.png"
                      alt="Create My Route"
                      data-default="/buttons/btn_Empty/btn_emptx_original.png"
                      data-hover="/buttons/btn_Empty/btn_emptx_hover.png"
                      data-active="/buttons/btn_Empty/btn_emptx_click.png"
                    />
                    <span className="route-submit-label">Create My Route</span>
                  </button>

                  <div id="route-error" className="route-error-message"></div>
                  <div id="geo-unknown" className="geo-unknown" style={{ display: "none" }}>
                    <p id="geo-unknown-text">This Location is for me unknown.</p>
                    <div className="geo-unknown-actions">
                      <button id="geo-make-btn" className="btn" type="button">
                        Make this location
                      </button>
                      <button id="geo-nearest-btn" className="btn ghost" type="button">
                        Continue with nearest location
                      </button>
                    </div>
                  </div>
                </div>

                <div className="route-result-wrapper" style={{ display: "none" }}>
                  <h3 className="route-result-title">Your City Guide</h3>
                  <div id="route-result" className="route-result"></div>
                                    <button id="save-pdf-btn" className="image-btn" type="button" aria-label="Save PDF">
                    <img
                      className="stateful-btn-image"
                      src="/buttons/Create PDF/btn_create_PDF_original.png"
                      alt="Save PDF"
                      data-default="/buttons/Create PDF/btn_create_PDF_original.png"
                      data-hover="/buttons/Create PDF/btn_create_PDF_hover.png"
                      data-active="/buttons/Create PDF/btn_create_PDF_click.png"
                    />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

      </main>

      <footer className="site-footer" data-include="/components/footer.html">
        <div>Made for city lovers with a taste for discovery.</div>
      </footer>

      <button className="scroll-top-btn" id="scrollToTopBtn" type="button">
        {"\u2191"}
      </button>
    </div>
  );
}

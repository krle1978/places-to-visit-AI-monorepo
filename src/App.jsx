console.log("NEW APP VERSION LOADED");
import { useEffect, useState } from "react";
import "./App.css";

const API = import.meta.env.VITE_API_URL || window.location.origin;

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

export default function App() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem("token"));
  const [plan, setPlan] = useState(getPlanFromToken(localStorage.getItem("token")));

  const [error, setError] = useState("");
  const [signupMessage, setSignupMessage] = useState("");
  const [signupError, setSignupError] = useState("");
  const [signupLoading, setSignupLoading] = useState(false);
  const [missingCity, setMissingCity] = useState("");
  const [missingCityMessage, setMissingCityMessage] = useState("");
  const [cityGenerateLoading, setCityGenerateLoading] = useState(false);
  const [cityGenerateError, setCityGenerateError] = useState("");
  const [aiCity, setAiCity] = useState("");
  const [aiInterests, setAiInterests] = useState("");
  const [aiResult, setAiResult] = useState(null);
  const [aiError, setAiError] = useState("");
  const [aiNotice, setAiNotice] = useState("");
  const [aiLoading, setAiLoading] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlToken = params.get("token");
    if (urlToken) {
      localStorage.setItem("token", urlToken);
      setToken(urlToken);
      setPlan(getPlanFromToken(urlToken));
      setUser({});
      params.delete("token");
      const next = params.toString();
      const newUrl = window.location.pathname + (next ? `?${next}` : "");
      window.history.replaceState({}, document.title, newUrl);
    }
  }, []);

  useEffect(() => {
    if (token) {
      setUser({});
      setPlan(getPlanFromToken(token));
    }
  }, [token, plan]);

  useEffect(() => {
    if (!token) return;

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

    const gpsBtn = document.getElementById("gpsBtn");
    const citySearchInput = document.getElementById("city-search-input");
    const citySearchBtn = document.getElementById("city-search-btn");

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

    let countriesReadyDone = false;
    let resolveCountriesReady;
    const countriesReady = new Promise((resolve) => {
      resolveCountriesReady = resolve;
    });
    const markCountriesReady = () => {
      if (countriesReadyDone) return;
      countriesReadyDone = true;
      resolveCountriesReady();
    };

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

    const apiBases = [API, "http://localhost:3001"].filter(
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
        resultWrapper.scrollIntoView({ behavior: "smooth", block: "start" });
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
        "cote d'ivoire": "Cote d'Ivoire",
        czechia: "Czech Republic",
        "holy see": "Vatican City",
        macedonia: "North Macedonia",
        "north macedonia": "North Macedonia",
        "republic of moldova": "Moldova",
        "republic of turkey": "Turkey (Europe)",
        "russian federation": "Russia (Europe)",
        "slovak republic": "Slovakia",
        "swiss confederation": "Swizerland",
        turkiye: "Turkey (Europe)",
        "united kingdom of great britain and northern ireland": "United Kingdom"
      };

      const normalized = normalizeName(input);
      const alias = aliases[normalized];
      if (alias) return alias;

      const options = Object.keys(countryFileMap);
      const match = options.find((name) => normalizeName(name) === normalized);
      return match || "";
    }

    function findCityOption(cityName) {
      if (!cityName) return null;
      const normalized = normalizeName(cityName);
      const targetKey = normalizeKey(cityName);
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
      if (!gpsBtn || isGeoLoading) return;
      if (!navigator.geolocation) {
        errorMsg.textContent = "Geolocation is not supported.";
        return;
      }

      openPlannerPanel();
      errorMsg.textContent = "";
      isGeoLoading = true;
      gpsBtn.dataset.locked = "true";

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
            const cityName = data?.city || "";

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
            gpsBtn.dataset.locked = "false";
          }
        },
        (err) => {
          console.error(err);
          errorMsg.textContent = "Unable to access location.";
          isGeoLoading = false;
          gpsBtn.dataset.locked = "false";
        },
        { enableHighAccuracy: false, timeout: 10000 }
      );
    }

    if (gpsBtn) {
      const onGpsClick = (event) => {
        event.preventDefault();
        resolveGeoLocation();
      };

      gpsBtn.addEventListener("click", onGpsClick);
      cleanup.push(() => gpsBtn.removeEventListener("click", onGpsClick));
    }

    if (citySearchInput && citySearchBtn) {
      const canGenerateCity = plan === "basic" || plan === "premium";

      const onCitySearch = async () => {
        if (isSearchLoading) return;

        const raw = citySearchInput.value.trim();
        if (!raw) {
          setMissingCity("");
          setMissingCityMessage("");
          setCityGenerateError("");
          errorMsg.textContent = "Please enter a city name.";
          return;
        }

        if (raw.length > 10) {
          setMissingCity("");
          setMissingCityMessage("");
          setCityGenerateError("");
          errorMsg.textContent = "City name must be 10 characters or less.";
          return;
        }

        openPlannerPanel();
        errorMsg.textContent = "";
        resultWrapper.style.display = "none";
        setMissingCity("");
        setMissingCityMessage("");
        setCityGenerateError("");
        isSearchLoading = true;
        citySearchBtn.disabled = true;

        try {
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

            if (countrySelect.value !== result.match.country) {
              countrySelect.value = result.match.country;
              countrySelect.dispatchEvent(new Event("change"));
            } else {
              applyPendingCitySelection();
            }
            return;
          }

          setMissingCity(raw);
          if (result.suggestion) {
            errorMsg.textContent = `City not found. Did you mean ${result.suggestion.city}, ${result.suggestion.country}?`;
          } else {
            errorMsg.textContent = "";
          }

          if (canGenerateCity) {
            setMissingCityMessage(`Generating data for ${raw}...`);
            generateCityRoute(raw);
          } else {
            setMissingCityMessage(
              "This city is not available in our offer. If you want to create it, you need to subscribe to one of the available subscription models."
            );
          }
        } catch (err) {
          console.error(err);
          errorMsg.textContent = err?.message || "Failed to find city.";
        } finally {
          isSearchLoading = false;
          citySearchBtn.disabled = false;
        }
      };

      const onCitySearchKeydown = (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          onCitySearch();
        }
      };

      citySearchBtn.addEventListener("click", onCitySearch);
      citySearchInput.addEventListener("keydown", onCitySearchKeydown);

      cleanup.push(() => citySearchBtn.removeEventListener("click", onCitySearch));
      cleanup.push(() => citySearchInput.removeEventListener("keydown", onCitySearchKeydown));
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
              body: JSON.stringify({
                city: geoContext.city,
                country: geoContext.country
              })
            }
          );

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

    function openPlannerPanel() {
      if (!panel) return;
      panel.classList.add("open");
      panel.classList.remove("collapsed");

      setTimeout(() => {
        panel.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 150);
    }

    window.routePlannerEasy = window.routePlannerEasy || {};
    window.routePlannerEasy.selectLocation = function (countryName, cityName, autoSubmit = false) {
      if (!countryName) return;
      pendingSelection = { country: countryName, city: cityName, autoSubmit: Boolean(autoSubmit) };

      openPlannerPanel();

      if (countrySelect.value !== countryName) {
        countrySelect.value = countryName;
        countrySelect.dispatchEvent(new Event("change"));
      } else {
        applyPendingCitySelection();
      }
    };
    window.routePlannerEasy.openPanel = openPlannerPanel;

    document.dispatchEvent(new Event("routePlanner:ready"));

    return () => cleanup.forEach((fn) => fn());
  }, [token]);

  useEffect(() => {
    const scrollTopBtn = document.getElementById("scrollToTopBtn");
    if (!scrollTopBtn) return;

    const scrollToTop = () => {
      window.scrollTo({ top: 0, behavior: "smooth" });
    };

    scrollTopBtn.addEventListener("click", scrollToTop);
    return () => scrollTopBtn.removeEventListener("click", scrollToTop);
  }, [token]);

  async function signup() {
    setSignupError("");
    setSignupMessage("");
    setError("");

    if (!email || !password) {
      setSignupError("Email and password required.");
      return;
    }

    setSignupLoading(true);
    try {
      const res = await fetch(`${API}/api/auth/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Signup failed.");

      setSignupMessage(data.message || "Check your email to confirm your account.");
    } catch (err) {
      setSignupError(err.message);
    } finally {
      setSignupLoading(false);
    }
  }

  async function login() {
    setError("");
    setSignupMessage("");
    setSignupError("");
    try {
      const res = await fetch(`${API}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      localStorage.setItem("token", data.token);
      setToken(data.token);
      setUser(data.user);
      setPlan(data.user?.plan || getPlanFromToken(data.token));
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
  }

  async function generateCityRoute(cityName = missingCity) {
    if (!cityName || cityGenerateLoading) return;
    if (!(plan === "basic" || plan === "premium")) {
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
      if (!res.ok) throw new Error(data.error || "Failed to generate city data.");

      if (window.routePlannerEasy?.selectLocation) {
        window.routePlannerEasy.selectLocation(data.country, data.city, true);
        setMissingCity("");
        setMissingCityMessage("");
      } else {
        setCityGenerateError("Route planner is not ready yet.");
      }
    } catch (err) {
      setCityGenerateError(err.message);
    } finally {
      setCityGenerateLoading(false);
    }
  }

  async function askPremiumGuide() {
    if (aiLoading) return;
    const city = aiCity.trim();
    const interests = aiInterests.trim();

    setAiError("");
    setAiNotice("");
    setAiResult(null);

    if (!city || !interests) {
      setAiError("City and interests are required.");
      return;
    }

    setAiLoading(true);
    try {
      const generatePromise = fetch(`${API}/api/cities/generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ city })
      });

      const personalizedPromise = fetch(`${API}/api/ask/personalized`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ city, interests })
      });

      const [generateRes, personalizedRes] = await Promise.all([
        generatePromise,
        personalizedPromise
      ]);

      if (!generateRes.ok) {
        const generateData = await generateRes.json().catch(() => ({}));
        setAiNotice(generateData.error || "Failed to save city data.");
      }

      const personalizedData = await personalizedRes.json().catch(() => ({}));
      if (!personalizedRes.ok) {
        throw new Error(personalizedData.error || "Failed to generate personalized guide.");
      }

      setAiResult(personalizedData);
    } catch (err) {
      setAiError(err.message || "Failed to generate personalized guide.");
    } finally {
      setAiLoading(false);
    }
  }

  const isPremium = plan === "premium" || plan === "premium_plus";
  const canGenerateCity = plan === "basic" || isPremium;

  const openSubscriptions = () => {
    window.location.href = "/subscription.html";
  };

  if (!token) {
    return (
      <div className="login-shell">
        <div className="login-card">
          <h2>Login</h2>
          <p className="login-tagline">Access your personalized city planner.</p>

          <label className="login-field">
            Email
            <input
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
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

          <button onClick={login} className="btn">
            Login
          </button>

          <button onClick={signup} className="btn ghost" type="button" disabled={signupLoading}>
            {signupLoading ? "Sending..." : "Signup"}
          </button>

          {signupError && <div className="form-error">{signupError}</div>}
          {signupMessage && <div className="form-success">{signupMessage}</div>}
          {error && <div className="form-error">{error}</div>}
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <header className="site-header" data-include="/components/header.html">
        <div className="header-title">
          <div className="brand">Places To Visit</div>
          <div className="header-subtitle">Smart city travel planner for curious minds.</div>
        </div>
        <button className="btn logout-btn" type="button" onClick={logout}>
          Logout
        </button>
      </header>

      <main>
        <section className="hero">
          <div className="hero-text">
            <h1>Plan Your Perfect City Escape</h1>
            <p className="tagline">Smart city travel planner for curious young minds.</p>
            <div className="hero-image">
              <img
                src="/backgrounds/main-hero.webp"
                alt="Young travelers exploring Europe"
              />
            </div>
            <p>
              Explore the coolest European cities through what you vibe with - art, history,
              architecture, street food, nightlife and more. Whether you are into chill museums or
              urban adventures, our smart planner builds an itinerary that is totally your style.
            </p>
          </div>

          <div className="hero-buttons">
            <a href="locaton.html" className="image-btn-link" aria-label="I'm Here" id="gpsBtn">
              <img
                className="stateful-btn-image"
                src="/buttons/IM_Here/btn_imhere_original.png"
                alt="I'm Here"
                data-default="/buttons/IM_Here/btn_imhere_original.png"
                data-hover="/buttons/IM_Here/btn_imhere_hover.png"
                data-active="/buttons/IM_Here/btn_imhere_click.png"
              />
            </a>

            <div className="city-search">
              <input
                id="city-search-input"
                type="text"
                maxLength={10}
                placeholder="Type city (max 10)"
              />
              <button id="city-search-btn" className="btn" type="button">
                Find This City
              </button>
              {missingCity && (
                <div className="city-search-missing">
                  <div className={canGenerateCity ? "form-success" : "form-error"}>
                    {missingCityMessage ||
                      (canGenerateCity
                        ? `Generating data for ${missingCity}...`
                        : "This city is not available in our offer. If you want to create it, you need to subscribe to one of the available subscription models.")}
                  </div>
                  {!canGenerateCity && (
                    <button className="btn ghost" type="button" onClick={openSubscriptions}>
                      Subscription models
                    </button>
                  )}
                  {canGenerateCity && cityGenerateError && (
                    <div className="form-error">{cityGenerateError}</div>
                  )}
                  {canGenerateCity && cityGenerateError && (
                    <button
                      onClick={() => generateCityRoute(missingCity)}
                      disabled={cityGenerateLoading}
                      className="btn"
                      type="button"
                    >
                      {cityGenerateLoading ? "Thinking..." : "Try again"}
                    </button>
                  )}
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

            <button
              className="btn ghost image-btn"
              id="toggle-planner-btn"
              type="button"
              aria-label="Make Your Own City Visit"
            ></button>

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

                  <button id="route-submit" className="btn" type="button" disabled>
                    Build My Plan
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
                  <button id="save-pdf-btn" className="btn" type="button">
                    Save PDF
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        {isPremium && (
          <section className="ai-section">
            <div className="ai-panel">
              <div className="ai-panel-header">
                <h2>Ask the AI Guide</h2>
                <p>Get a personalized schedule based on your interests.</p>
              </div>
              <div className="ai-panel-body">
                <label className="ai-field">
                  City
                  <input
                    type="text"
                    value={aiCity}
                    onChange={(e) => setAiCity(e.target.value)}
                    placeholder="Lisbon"
                  />
                </label>
                <label className="ai-field">
                  Interests
                  <input
                    type="text"
                    value={aiInterests}
                    onChange={(e) => setAiInterests(e.target.value)}
                    placeholder="street food, modern art, live music"
                  />
                </label>
                <button onClick={askPremiumGuide} disabled={aiLoading} className="btn">
                  {aiLoading ? "Thinking..." : "Ask"}
                </button>
                {aiError && <div className="form-error">{aiError}</div>}
                {aiNotice && <div className="form-success">{aiNotice}</div>}
                {aiResult && (
                  <div className="ai-result">
                    <div className="ai-result-title">
                      Personalized schedule for {aiResult.city || aiCity}
                    </div>
                    {Array.isArray(aiResult.itinerary) ? (
                      <div className="ai-itinerary">
                        {aiResult.itinerary.map((item, index) => {
                          const link = item?.map_link || "";
                          const title = item?.title || "Stop";
                          return (
                            <div className="ai-itinerary-item" key={`${title}-${index}`}>
                              <div className="ai-itinerary-time">{item?.time || "--:--"}</div>
                              <div className="ai-itinerary-body">
                                <div className="ai-itinerary-title">
                                  {link ? (
                                    <a href={link} target="_blank" rel="noopener noreferrer">
                                      {title}
                                    </a>
                                  ) : (
                                    title
                                  )}
                                </div>
                                {item?.type && (
                                  <div className="ai-itinerary-type">{item.type}</div>
                                )}
                                {item?.description && <p>{item.description}</p>}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <textarea
                        rows={10}
                        readOnly
                        value={JSON.stringify(aiResult, null, 2)}
                        className="ai-answer"
                      />
                    )}
                    {Array.isArray(aiResult.tips) && aiResult.tips.length > 0 && (
                      <div className="ai-tips">
                        <h4>Tips</h4>
                        <ul>
                          {aiResult.tips.map((tip, index) => {
                            const label = tip?.tip || "Tip";
                            const link = tip?.map_link;
                            return (
                              <li key={`${label}-${index}`}>
                                {link ? (
                                  <a href={link} target="_blank" rel="noopener noreferrer">
                                    {label}
                                  </a>
                                ) : (
                                  label
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </section>
        )}
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

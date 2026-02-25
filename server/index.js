import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";
import { addCityIfMissing } from "./utils/addCityToCountry.js";
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import nodemailer from "nodemailer";
import { requireAuth } from "./middleware/auth.js";
import { registerWebhookRoutes } from "./routes/webhook.js";
import { createCountriesStore } from "./storage/countriesStore.js";
import { createUsersStore } from "./storage/usersStore.js";

// Load env from `server/.env` regardless of where the process is started from.
dotenv.config({ path: fileURLToPath(new URL(".env", import.meta.url)) });

const app = express();
app.set("trust proxy", 1);
app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/", (req, res) => {
  res.json({
    status: "OK",
    name: "Places To Visit API",
    version: "1.0.0"
  });
});

let openAiClient = null;
function getOpenAiClient() {
  if (openAiClient) return openAiClient;
  const apiKey = String(process.env.OPENAI_API_KEY || "").trim();
  if (!apiKey) {
    const err = new Error(
      "OPENAI_API_KEY is not configured. Create server/.env (see server/.env.example) or set the env var before starting the server."
    );
    err.status = 500;
    throw err;
  }
  openAiClient = new OpenAI({ apiKey });
  return openAiClient;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, "data");
const COUNTRIES_DIR = path.join(DATA_DIR, "countries");
const USERS_PATH = path.join(DATA_DIR, "users.json");
const PENDING_USERS_PATH = path.join(DATA_DIR, "pending_users.json");
const cityGeoCache = new Map();
const CITY_GEO_CACHE_PATH = path.join(DATA_DIR, "city_geo_cache.json");
let cityGeoCacheLoaded = false;
let cityGeoCacheWriteTimer = null;
const reverseGeoCache = new Map();
const REVERSE_GEO_CACHE_TTL_MS = Number(process.env.REVERSE_GEO_CACHE_TTL_MS || 5 * 60 * 1000);
const REVERSE_GEO_CACHE_MAX = Number(process.env.REVERSE_GEO_CACHE_MAX || 1500);
let offerCityIndex = null;
let offerCityIndexPromise = null;
let countryNameByFileMap = null;
let countryNameByFileMapPromise = null;
let supportedCountryKeys = null;
let supportedCountryKeysPromise = null;
const smtpPort = Number(process.env.SMTP_PORT || 587);
const mailTransport = process.env.SMTP_HOST
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST || "smtp.gmail.com",
      port: smtpPort,
      secure: smtpPort === 465,
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined
    })
  : null;
const SMTP_FROM = process.env.SMTP_FROM || process.env.SMTP_USER || "";
const PENDING_SIGNUP_TTL_MS = Number(process.env.PENDING_SIGNUP_TTL_MS || 24 * 60 * 60 * 1000);
const PENDING_RESEND_MIN_INTERVAL_MS = Number(
  process.env.PENDING_RESEND_MIN_INTERVAL_MS || 60 * 1000
);
const DATABASE_URL =
  process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRESQL_URL || "";
const countriesStore = createCountriesStore({
  countriesDir: COUNTRIES_DIR,
  databaseUrl: DATABASE_URL
});
const usersStore = createUsersStore({
  dataDir: DATA_DIR,
  databaseUrl: DATABASE_URL
});
registerWebhookRoutes(app, { usersStore });


function normalizeName(value) {
  return value
    ? value
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
    : "";
}

function normalizeKey(value) {
  return normalizeName(value).replace(/\s+/g, "");
}

function stripParenthetical(value) {
  return String(value || "")
    .replace(/\s*\([^)]*\)\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildCityGeoKey(city, country) {
  const cityKey = normalizeName(String(city || "").trim());
  const countryKey = normalizeName(stripParenthetical(country));
  return `${cityKey}|${countryKey}`;
}

async function loadCityGeoCacheFromDisk() {
  if (cityGeoCacheLoaded) return;
  cityGeoCacheLoaded = true;

  try {
    const raw = await fs.promises.readFile(CITY_GEO_CACHE_PATH, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return;

    for (const [key, coords] of Object.entries(parsed)) {
      const lat = Number(coords?.lat);
      const lon = Number(coords?.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      cityGeoCache.set(key, { lat, lon });
    }
  } catch (err) {
    if (err.code !== "ENOENT") {
      console.error("Failed to load city geo cache.", err);
    }
  }
}

function scheduleCityGeoCacheWrite() {
  if (cityGeoCacheWriteTimer) return;
  cityGeoCacheWriteTimer = setTimeout(async () => {
    cityGeoCacheWriteTimer = null;
    try {
      const obj = Object.create(null);
      for (const [key, coords] of cityGeoCache.entries()) {
        const lat = Number(coords?.lat);
        const lon = Number(coords?.lon);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
        obj[key] = { lat, lon };
      }
      await fs.promises.writeFile(CITY_GEO_CACHE_PATH, JSON.stringify(obj, null, 2), "utf8");
    } catch (err) {
      console.error("Failed to write city geo cache.", err);
    }
  }, 1200);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(
  url,
  options = {},
  retryableStatuses = [429, 500, 502, 503, 504],
  maxRetries = 2,
  baseDelayMs = 300
) {
  let lastResponse = null;
  let lastError = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);
      if (response.ok) return response;

      lastResponse = response;
      const shouldRetry = retryableStatuses.includes(response.status);
      if (!shouldRetry || attempt === maxRetries) {
        return response;
      }
    } catch (err) {
      lastError = err;
      if (attempt === maxRetries) throw err;
    }

    const waitMs = baseDelayMs * (attempt + 1);
    await sleep(waitMs);
  }

  if (lastResponse) return lastResponse;
  throw lastError || new Error("Request failed.");
}

function buildReverseGeoCacheKey(lat, lon, zoom = 16) {
  return `${Number(lat).toFixed(4)}|${Number(lon).toFixed(4)}|${zoom}`;
}

function getReverseGeoCacheEntry(key) {
  const cached = reverseGeoCache.get(key);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    reverseGeoCache.delete(key);
    return null;
  }
  return cached.payload || null;
}

function setReverseGeoCacheEntry(key, payload) {
  if (!key || !payload) return;

  reverseGeoCache.set(key, {
    payload,
    expiresAt: Date.now() + REVERSE_GEO_CACHE_TTL_MS
  });

  while (reverseGeoCache.size > REVERSE_GEO_CACHE_MAX) {
    const oldestKey = reverseGeoCache.keys().next().value;
    if (!oldestKey) break;
    reverseGeoCache.delete(oldestKey);
  }
}

async function fetchJson(url, timeoutMs = 8000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "places-to-visit-ai/1.0",
        "Accept-Language": "en"
      }
    });
    if (!response.ok) return null;
    return await response.json();
  } catch (err) {
    if (err?.name === "AbortError") return null;
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function geocodeCityViaOpenMeteo(city, country) {
  const query = country ? `${city}, ${stripParenthetical(country)}` : city;
  const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
  url.searchParams.set("name", query);
  url.searchParams.set("count", "5");
  url.searchParams.set("language", "en");
  url.searchParams.set("format", "json");
  const data = await fetchJson(url);
  const results = Array.isArray(data?.results) ? data.results : [];
  if (!results.length) return null;

  const expectedCountry = normalizeKey(stripParenthetical(country));
  const best = expectedCountry
    ? results.find((item) => normalizeKey(stripParenthetical(item?.country)) === expectedCountry) ||
      results[0]
    : results[0];

  const lat = Number(best?.latitude);
  const lon = Number(best?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return { lat, lon };
}

async function geocodeCityViaNominatim(city, country) {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");
  if (country) {
    url.searchParams.set("q", `${city}, ${stripParenthetical(country)}`);
  } else {
    url.searchParams.set("city", city);
  }

  const data = await fetchJson(url);
  if (!Array.isArray(data) || !data[0]) return null;

  const result = {
    lat: Number(data[0].lat),
    lon: Number(data[0].lon)
  };

  if (!Number.isFinite(result.lat) || !Number.isFinite(result.lon)) {
    return null;
  }

  return result;
}

async function geocodeCity(city, country) {
  await loadCityGeoCacheFromDisk();
  const key = buildCityGeoKey(city, country);
  if (cityGeoCache.has(key)) return cityGeoCache.get(key);

  const trimmedCity = String(city || "").trim();
  if (!trimmedCity) return null;

  const viaOpenMeteo = await geocodeCityViaOpenMeteo(trimmedCity, country);
  const coords = viaOpenMeteo || (await geocodeCityViaNominatim(trimmedCity, country));
  if (!coords) return null;

  cityGeoCache.set(key, coords);
  scheduleCityGeoCacheWrite();
  return coords;
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const results = Array(items.length);
  let index = 0;

  const workers = Array.from({ length: Math.max(1, concurrency) }, async () => {
    while (index < items.length) {
      const current = index++;
      try {
        results[current] = await mapper(items[current], current);
      } catch (err) {
        results[current] = null;
      }
    }
  });

  await Promise.all(workers);
  return results;
}

async function getSupportedCountryKeys() {
  if (supportedCountryKeys) return supportedCountryKeys;
  if (supportedCountryKeysPromise) return supportedCountryKeysPromise;

  supportedCountryKeysPromise = (async () => {
    const keys = new Set();
    const documents = await countriesStore.readAllCountryDocuments();
    for (const document of documents) {
      try {
        const parsed = document.payload;
        const name = String(parsed?.name || "").trim();
        if (!name) continue;
        keys.add(normalizeKey(name));
        const base = stripParenthetical(name);
        if (base) keys.add(normalizeKey(base));
      } catch (err) {
        console.error("Failed to load country for supported list.", err);
      }
    }
    supportedCountryKeys = keys;
    supportedCountryKeysPromise = null;
    return keys;
  })();

  return supportedCountryKeysPromise;
}

async function buildOfferCityIndex() {
  await loadCityGeoCacheFromDisk();
  const documents = await countriesStore.readAllCountryDocuments();

  const tasks = [];
  for (const document of documents) {
    const file = document.file;
    try {
      const parsed = document.payload;
      const countryName = String(parsed?.name || "").trim();
      const countryForGeo = stripParenthetical(countryName);
      const cities = Array.isArray(parsed?.cities) ? parsed.cities : [];
      for (const city of cities) {
        const cityName = String(city?.name || "").trim();
        if (!cityName) continue;
        tasks.push({ file, countryForGeo, cityName });
      }
    } catch (err) {
      console.error(`Failed to read country record: ${file}`, err);
    }
  }

  const resolved = await mapWithConcurrency(tasks, 8, async (task) => {
    const coords = await geocodeCity(task.cityName, task.countryForGeo);
    if (!coords) return null;
    return { file: task.file, city: task.cityName, lat: coords.lat, lon: coords.lon };
  });

  return resolved.filter(Boolean);
}

async function getOfferCityIndex() {
  if (offerCityIndex) return offerCityIndex;
  if (offerCityIndexPromise) return offerCityIndexPromise;

  offerCityIndexPromise = buildOfferCityIndex()
    .then((index) => {
      offerCityIndex = index;
      offerCityIndexPromise = null;
      return index;
    })
    .catch((err) => {
      offerCityIndexPromise = null;
      throw err;
    });

  return offerCityIndexPromise;
}

async function getCountryNameByFileMap() {
  if (countryNameByFileMap) return countryNameByFileMap;
  if (countryNameByFileMapPromise) return countryNameByFileMapPromise;

  countryNameByFileMapPromise = (async () => {
    const map = new Map();
    const documents = await countriesStore.readAllCountryDocuments();
    for (const document of documents) {
      try {
        const countryName = String(document?.payload?.name || "").trim();
        if (!countryName || !document?.file) continue;
        map.set(document.file, countryName);
      } catch (err) {
        console.error(`Failed to read country record: ${document?.file || "unknown"}`, err);
      }
    }
    countryNameByFileMap = map;
    countryNameByFileMapPromise = null;
    return map;
  })();

  return countryNameByFileMapPromise;
}

async function cityExistsInFile(fileName, cityName) {
  const resolved = resolveCountryFile(fileName);
  if (resolved.error) return null;

  const parsed = await countriesStore.readCountryDocument(resolved.file);
  if (!parsed) return null;
  const cities = Array.isArray(parsed?.cities) ? parsed.cities : [];
  const target = normalizeName(cityName);

  return cities.find((entry) => normalizeName(entry?.name) === target) || null;
}

const COUNTRY_ALIASES = {
  "bosniaandherzegovina": "Bosnia and Herzegowina",
  "cotedivoire": "Cote d'Ivoire",
  "czechia": "Czech Republic",
  "holysee": "Vatican City",
  "macedonia": "North Macedonia",
  "northmacedonia": "North Macedonia",
  "republicofmoldova": "Moldova",
  "republicofturkey": "Turkey (Europe)",
  "russianfederation": "Russia (Europe)",
  "russia": "Russia (Europe)",
  "slovakrepublic": "Slovakia",
  "swissconfederation": "Swizerland",
  "turkiye": "Turkey (Europe)",
  "turkey": "Turkey (Europe)",
  "unitedkingdomofgreatbritainandnorthernireland": "United Kingdom"
};

const EUROPE_COUNTRY_KEYS = new Set(
  [
    "Albania",
    "Andorra",
    "Armenia",
    "Austria",
    "Azerbaijan",
    "Belarus",
    "Belgium",
    "Bosnia and Herzegovina",
    "Bosnia and Herzegowina",
    "Bulgaria",
    "Croatia",
    "Cyprus",
    "Czech Republic",
    "Denmark",
    "Estonia",
    "Finland",
    "France",
    "Georgia",
    "Germany",
    "Greece",
    "Hungary",
    "Iceland",
    "Ireland",
    "Italy",
    "Kosovo",
    "Latvia",
    "Liechtenstein",
    "Lithuania",
    "Luxembourg",
    "Malta",
    "Moldova",
    "Monaco",
    "Montenegro",
    "Netherlands",
    "North Macedonia",
    "Norway",
    "Poland",
    "Portugal",
    "Romania",
    "Russia",
    "San Marino",
    "Serbia",
    "Slovakia",
    "Slovenia",
    "Spain",
    "Sweden",
    "Switzerland",
    "Turkey",
    "Ukraine",
    "United Kingdom",
    "Vatican City"
  ].map((name) => normalizeKey(name))
);

function resolveCountryAlias(input) {
  const key = normalizeKey(input);
  return COUNTRY_ALIASES[key] || input;
}

function isEuropeanGeoCountry(countryName, lon) {
  const resolvedName = resolveCountryAlias(countryName);
  const countryKey = normalizeKey(stripParenthetical(resolvedName));
  if (!EUROPE_COUNTRY_KEYS.has(countryKey)) return false;
  if (countryKey === "turkey" && Number(lon) > 30.5) return false;
  if (countryKey === "russia" && Number(lon) > 60) return false;
  return true;
}

function countryMatchesHint(countryName, countryHint) {
  const hint = String(countryHint || "").trim();
  if (!hint) return true;

  const resolvedCountry = resolveCountryAlias(countryName);
  const resolvedHint = resolveCountryAlias(hint);
  const countryVariants = [
    normalizeName(resolvedCountry),
    normalizeName(stripParenthetical(resolvedCountry)),
    normalizeKey(resolvedCountry),
    normalizeKey(stripParenthetical(resolvedCountry))
  ].filter(Boolean);
  const hintVariants = [
    normalizeName(resolvedHint),
    normalizeName(stripParenthetical(resolvedHint)),
    normalizeKey(resolvedHint),
    normalizeKey(stripParenthetical(resolvedHint))
  ].filter(Boolean);

  return hintVariants.some((hintValue) =>
    countryVariants.some(
      (countryValue) =>
        countryValue === hintValue ||
        countryValue.startsWith(hintValue) ||
        hintValue.startsWith(countryValue)
    )
  );
}

async function findGeoCandidatesFromLocalIndex(cityQuery, countryHint = "", limit = 8) {
  const raw = String(cityQuery || "").trim();
  if (!raw) return [];
  const normalizedQuery = normalizeName(raw);
  const normalizedQueryKey = normalizeKey(raw);

  const [index, fileToCountry] = await Promise.all([getOfferCityIndex(), getCountryNameByFileMap()]);
  const seen = new Set();
  const ranked = [];

  for (const entry of index) {
    const cityName = String(entry?.city || "").trim();
    const countryName = String(fileToCountry.get(entry?.file) || "").trim();
    const lat = Number(entry?.lat);
    const lon = Number(entry?.lon);
    if (!cityName || !countryName || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    if (!countryMatchesHint(countryName, countryHint)) continue;
    if (!isEuropeanGeoCountry(countryName, lon)) continue;

    const normalizedCity = normalizeName(cityName);
    const normalizedCityKey = normalizeKey(cityName);
    let score = Infinity;

    if (normalizedCity === normalizedQuery || normalizedCityKey === normalizedQueryKey) {
      score = 0;
    } else if (normalizedCity.startsWith(normalizedQuery)) {
      score = 1;
    } else if (normalizedCity.includes(normalizedQuery)) {
      score = 2;
    } else if (normalizedQuery && normalizedQuery.includes(normalizedCity)) {
      score = 3;
    }

    if (!Number.isFinite(score)) continue;

    const dedupeKey = `${normalizedCityKey}|${normalizeKey(countryName)}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    ranked.push({
      score,
      city: cityName,
      country: countryName,
      lat,
      lon,
      displayName: `${cityName}, ${countryName}`
    });
  }

  ranked.sort((a, b) => {
    if (a.score !== b.score) return a.score - b.score;
    return a.city.localeCompare(b.city);
  });

  return ranked.slice(0, limit).map(({ score, ...candidate }) => candidate);
}

async function readJsonFile(filePath, fallback) {
  if (filePath === USERS_PATH) {
    return usersStore.readUsers();
  }
  if (filePath === PENDING_USERS_PATH) {
    return usersStore.readPendingUsers();
  }

  try {
    const raw = await fs.promises.readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === "ENOENT") return fallback;
    throw err;
  }
}

async function writeJsonFile(filePath, data) {
  if (filePath === USERS_PATH) {
    await usersStore.writeUsers(Array.isArray(data) ? data : []);
    return;
  }
  if (filePath === PENDING_USERS_PATH) {
    await usersStore.writePendingUsers(Array.isArray(data) ? data : []);
    return;
  }

  await fs.promises.writeFile(filePath, JSON.stringify(data, null, 2), "utf8");
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeUserName(value) {
  return normalizeName(String(value || "").trim()).replace(/\s+/g, " ");
}

function buildClientUrl(req, pathname) {
  const base = process.env.CLIENT_URL || `${req.protocol}://${req.get("host")}`;
  return new URL(pathname, base).toString();
}

function buildPublicApiBase(req) {
  const rawBase =
    process.env.PUBLIC_API_URL ||
    process.env.API_URL ||
    process.env.RENDER_EXTERNAL_URL ||
    `${req.protocol}://${req.get("host")}`;
  const value = String(rawBase || "").trim();
  const withProtocol = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  return withProtocol.replace(/\/+$/, "");
}

function buildConfirmUrl(req, token) {
  const base = buildPublicApiBase(req);
  const url = new URL("/api/auth/confirm", base);
  url.searchParams.set("token", token);
  return url.toString();
}

function safeParseDate(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isPendingExpired(entry, now = new Date()) {
  const created = safeParseDate(entry?.createdAt);
  if (!created) return false;
  return now.getTime() - created.getTime() > PENDING_SIGNUP_TTL_MS;
}

async function sendSignupEmail(to, confirmUrl) {
  if (!mailTransport) {
    throw new Error("Email transport is not configured.");
  }
  if (!SMTP_FROM) {
    throw new Error("SMTP_FROM is not configured.");
  }
  const info = await mailTransport.sendMail({
    from: SMTP_FROM,
    to,
    subject: "Confirm your account",
    text: `Please confirm your account by opening this link: ${confirmUrl}`,
    html: `<p>Please confirm your account by clicking the link below:</p><p><a href="${confirmUrl}">Confirm account</a></p>`
  });
  console.log("✅ Signup email sent", { to, messageId: info?.messageId });
  return info;
}

function resolveCountryFile(fileName) {
  return countriesStore.validateFileName(fileName);
}

async function resolveCountryForCity(city) {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");
  url.searchParams.set("city", city);
  url.searchParams.set("addressdetails", "1");

  const response = await fetch(url, {
    headers: {
      "User-Agent": "places-to-visit-ai/1.0",
      "Accept-Language": "en"
    }
  });

  if (!response.ok) return null;
  const data = await response.json();
  const country = data?.[0]?.address?.country || "";
  return country || null;
}

async function findCountryFileByName(countryName) {
  if (!countryName) return null;

  const aliased = resolveCountryAlias(countryName);
  const normalizedTarget = normalizeName(aliased);
  const targetKey = normalizeKey(aliased);
  const documents = await countriesStore.readAllCountryDocuments();

  for (const document of documents) {
    const file = document.file;
    try {
      const parsed = document.payload;
      const name = parsed?.name || "";
      if (!name) continue;

      const normalizedName = normalizeName(name);
      if (normalizedName === normalizedTarget) {
        return { file, country: name };
      }

      const normalizedNameKey = normalizeKey(name);
      if (normalizedNameKey && normalizedNameKey === targetKey) {
        return { file, country: name };
      }
    } catch (err) {
      console.error(`Failed to load country record: ${file}`);
    }
  }

  return null;
}

async function generateCityInFile(fileName, city, fallbackCountry) {
  const resolved = resolveCountryFile(fileName);
  if (resolved.error) {
    const err = new Error(resolved.error);
    err.status = 400;
    throw err;
  }

  const canonicalFile = await countriesStore.resolveFileName(resolved.file);
  if (!canonicalFile) {
    const err = new Error("File not found.");
    err.status = 404;
    throw err;
  }

  const parsed = await countriesStore.readCountryDocument(canonicalFile);
  if (!parsed) {
    const err = new Error("File not found.");
    err.status = 404;
    throw err;
  }
  parsed.cities = Array.isArray(parsed.cities) ? parsed.cities : [];

  const trimmedCity = city.trim();
  if (!trimmedCity) {
    const err = new Error("City is required.");
    err.status = 400;
    throw err;
  }
  const normalizedCity = normalizeName(trimmedCity);
  const existing = parsed.cities.find(
    (entry) => normalizeName(entry?.name) === normalizedCity
  );

  if (existing) {
    return { created: false, city: existing.name, country: parsed.name, file: canonicalFile };
  }

  const promptCountry = parsed?.name || fallbackCountry || "";
  const response = await getOpenAiClient().responses.create({
    model: "gpt-4.1-nano",
    max_output_tokens: 1500,
    text: {
      format: { type: "json_object" }
    },
    input: [
      {
        role: "system",
        content: `
You are City Tour Guide AI. Reply with JSON only (no markdown/comments).
City: ${trimmedCity}
Country: ${promptCountry}

Schema:
{
  "name": "",
  "interests": {
    "Art & Culture": [{ "name": "", "map_link": "", "description": "" }],
    "Photo Spots": [{ "name": "", "map_link": "", "description": "" }],
    "Food & Nightlife": [{ "name": "", "map_link": "", "description": "" }],
    "Nature & Relaxation": [{ "name": "", "map_link": "", "description": "" }]
  },
  "local_food_tip": "",
  "full_day": { "Morning": "", "Afternoon": "", "Sunset": "", "Night": "" },
  "seasons": {
    "spring": { "main_event": "", "description": "", "ideas": [{ "name": "", "map_link": "", "description": "" }] },
    "summer": { "main_event": "", "description": "", "ideas": [{ "name": "", "map_link": "", "description": "" }] },
    "autumn": { "main_event": "", "description": "", "ideas": [{ "name": "", "map_link": "", "description": "" }] },
    "winter": { "main_event": "", "description": "", "ideas": [{ "name": "", "map_link": "", "description": "" }] }
  },
  "public_transport_tips": [{ "tip": "", "link": "" }],
  "city_events": [{ "name": "", "season": "", "description": "", "website": "", "dates": "" }],
  "places": [{ "name": "", "map_link": "", "description": "" }],
  "hidden_gems": [{ "name": "", "map_link": "", "description": "" }]
}

Rules: interests is an object; use Google Maps search URLs; keep descriptions concise; full_day may include short <a> links and emojis.
`
      }
    ]
  });

  const jsonText = response.output?.[0]?.content?.[0]?.text || "";
  const cityJSON = JSON.parse(jsonText);

  if (!cityJSON?.name) {
    const err = new Error("Invalid AI response.");
    err.status = 500;
    throw err;
  }
  if (normalizeName(cityJSON.name) !== normalizeName(trimmedCity)) {
    cityJSON.name = trimmedCity;
  }

  parsed.cities.push(cityJSON);
  parsed.cities.sort((a, b) => String(a.name).localeCompare(String(b.name)));

  await countriesStore.writeCountryDocument(canonicalFile, parsed);
  offerCityIndex = null;
  offerCityIndexPromise = null;

  return { created: true, city: cityJSON.name, country: parsed.name, file: canonicalFile };
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return 6371 * c;
}

const PLAN_RANK = {
  free: 0,
  trial: 1,
  basic: 1,
  premium: 2,
  premium_plus: 3
};

function planAllows(plan, allowed) {
  const rank = PLAN_RANK[plan] ?? 0;
  const allowedRanks = allowed
    .map((key) => PLAN_RANK[key])
    .filter((value) => Number.isFinite(value));

  if (!allowedRanks.length) return false;

  const onlyFree = allowedRanks.every((value) => value === PLAN_RANK.free);
  if (onlyFree) return rank === PLAN_RANK.free;

  const minAllowed = Math.min(...allowedRanks);
  return rank >= minAllowed;
}

async function loadUserById(userId) {
  const users = await readJsonFile(USERS_PATH, []);
  const idx = users.findIndex((u) => u.id === userId);
  return { users, user: idx >= 0 ? users[idx] : null };
}

function normalizeUserTokens(user) {
  if (!user) return false;
  const current = Number(user.tokens || 0);
  if (!Number.isFinite(current)) {
    user.tokens = 0;
  } else {
    user.tokens = current;
  }

  if (user.tokens <= 0 && user.plan !== "free") {
    user.tokens = 0;
    user.plan = "free";
    return true;
  }

  return false;
}

async function getUserContext(req, res) {
  const userId = req.user?.userId;
  if (!userId) {
    res.status(401).json({ error: "Not authenticated" });
    return null;
  }

  const { users, user } = await loadUserById(userId);
  if (!user) {
    res.status(401).json({ error: "User not found." });
    return null;
  }

  const changed = normalizeUserTokens(user);
  if (changed) {
    await writeJsonFile(USERS_PATH, users);
  }

  return { users, user };
}

function hasTokens(user) {
  return Number(user?.tokens || 0) > 0;
}

async function consumeToken(users, user) {
  user.tokens = Number(user.tokens || 0) - 1;
  if (!Number.isFinite(user.tokens) || user.tokens <= 0) {
    user.tokens = 0;
    user.plan = "free";
  }
  await writeJsonFile(USERS_PATH, users);
}

app.post("/api/city/add", requireAuth, async (req, res) => {
  try {
    const context = await getUserContext(req, res);
    if (!context) return;

    if (!planAllows(context.user.plan, ["basic", "premium"])) {
      return res.status(403).json({
        error: "Your plan does not allow adding new cities."
      });
    }
    if (!hasTokens(context.user)) {
      return res.status(403).json({ error: "No tokens remaining." });
    }

    const { city } = req.body;

    if (!city) {
      return res.status(400).json({ error: "City is required" });
    }

    const result = await addCityIfMissing(city);
    if (!result?.exists) {
      await consumeToken(context.users, context.user);
      return res.json({
        ...result,
        _meta: { tokensRemaining: context.user.tokens, plan: context.user.plan }
      });
    }
    return res.json(result);
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      error: "Failed to add city"
    });
  }
});

app.post("/api/ask", requireAuth, async (req, res) => {
  try {
    const context = await getUserContext(req, res);
    if (!context) return;

    if (!planAllows(context.user.plan, ["premium"])) {
      return res.status(403).json({
        error: "Your plan does not allow using the AI guide."
      });
    }
    if (!hasTokens(context.user)) {
      return res.status(403).json({ error: "No tokens remaining." });
    }

    const { question } = req.body;

    if (!question) {
      return res.status(400).json({
        error: "Question is required."
      });
    }

    const response = await getOpenAiClient().responses.create({
      model: "gpt-4.1-mini",
      max_output_tokens: 900,
      text: {
        format: { type: "json_object" }
      },
      input: [
        {
          role: "system",
          content: `
You are City Tour Guide AI. Reply with JSON only (no markdown/comments).

Schema:
{
  "name": "City name",
  "interests": {
    "Art & Culture": [{ "name": "", "map_link": "", "description": "" }],
    "Photo Spots": [{ "name": "", "map_link": "", "description": "" }],
    "Food & Nightlife": [{ "name": "", "map_link": "", "description": "" }],
    "Nature & Relaxation": [{ "name": "", "map_link": "", "description": "" }]
  },
  "local_food_tip": "",
  "full_day": { "Morning": "", "Afternoon": "", "Sunset": "", "Night": "" },
  "seasons": {
    "spring": { "main_event": "", "description": "", "ideas": [{ "name": "", "map_link": "", "description": "" }] },
    "summer": { "main_event": "", "description": "", "ideas": [{ "name": "", "map_link": "", "description": "" }] },
    "autumn": { "main_event": "", "description": "", "ideas": [{ "name": "", "map_link": "", "description": "" }] },
    "winter": { "main_event": "", "description": "", "ideas": [{ "name": "", "map_link": "", "description": "" }] }
  },
  "public_transport_tips": [{ "tip": "", "link": "" }],
  "city_events": [{ "name": "", "season": "", "description": "", "website": "", "dates": "" }],
  "places": [{ "name": "", "map_link": "", "description": "" }],
  "hidden_gems": [{ "name": "", "map_link": "", "description": "" }]
}

Rules: interests is an object; use realistic well-known locations; Google Maps search URLs; concise descriptions; full_day may include short <a> links and emojis.
`
        },
        {
          role: "user",
          content: question
        }
      ]
    });

    const jsonText = response.output[0].content[0].text;
    const parsed = JSON.parse(jsonText);

    await consumeToken(context.users, context.user);
    return res.json({
      ...parsed,
      _meta: { tokensRemaining: context.user.tokens, plan: context.user.plan }
    });
  } catch (err) {
    console.error("OPENAI ERROR:");
    console.error(err);

    return res.status(500).json({
      error: "Backend error while generating city guide."
    });
  }
});

app.post("/api/ask/personalized", requireAuth, async (req, res) => {
  try {
    const context = await getUserContext(req, res);
    if (!context) return;

    if (!planAllows(context.user.plan, ["premium"])) {
      return res.status(403).json({
        error: "Your plan does not allow using the AI guide."
      });
    }
    if (!hasTokens(context.user)) {
      return res.status(403).json({ error: "No tokens remaining." });
    }

    const { city, interests } = req.body || {};
    if (!city || !interests) {
      return res.status(400).json({ error: "City and interests are required." });
    }

    const trimmedCity = city.trim();
    const trimmedInterests = interests.trim();
    if (!trimmedCity || !trimmedInterests) {
      return res.status(400).json({ error: "City and interests are required." });
    }

    const response = await getOpenAiClient().responses.create({
      model: "gpt-4.1-mini",
      max_output_tokens: 1500,
      text: {
        format: { type: "json_object" }
      },
      input: [
        {
          role: "system",
          content: `
You are City Tour Guide AI. Reply with JSON only (no markdown/comments).
Create a personalized schedule for the given city and interests with meals included.

Schema:
{
  "city": "",
  "interests": "",
  "itinerary": [
    { "time": "09:00", "title": "", "type": "breakfast|visit|lunch|dinner|break|activity", "description": "", "map_link": "" }
  ],
  "tips": [{ "tip": "", "map_link": "" }]
}

Rules: include breakfast/lunch/dinner entries; use realistic locations tied to interests; Google Maps search URLs; concise factual descriptions; no emojis.
`
        },
        {
          role: "user",
          content: `City: ${trimmedCity}\nInterests: ${trimmedInterests}`
        }
      ]
    });

    const jsonText = response.output?.[0]?.content?.[0]?.text || "";
    const parsed = JSON.parse(jsonText);

    await consumeToken(context.users, context.user);
    return res.json({
      ...parsed,
      _meta: { tokensRemaining: context.user.tokens, plan: context.user.plan }
    });
  } catch (err) {
    console.error("OPENAI ERROR:");
    console.error(err);
    return res.status(500).json({
      error: "Backend error while generating personalized city guide."
    });
  }
});

app.get("/api/geo/reverse", async (req, res) => {
  try {
    const lat = Number(req.query.lat);
    const lon = Number(req.query.lon);
    const zoom = 16;

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return res.status(400).json({ error: "Invalid coordinates." });
    }

    const cacheKey = buildReverseGeoCacheKey(lat, lon, zoom);
    const cached = getReverseGeoCacheEntry(cacheKey);
    if (cached) {
      return res.json(cached);
    }

    const url = new URL("https://nominatim.openstreetmap.org/reverse");
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("lat", lat.toString());
    url.searchParams.set("lon", lon.toString());
    url.searchParams.set("zoom", zoom.toString());
    url.searchParams.set("addressdetails", "1");

    const response = await fetchWithRetry(url, {
      headers: {
        "User-Agent": "places-to-visit-ai/1.0",
        "Accept-Language": "en"
      }
    });

    if (!response.ok) {
      if (response.status === 429) {
        return res.status(503).json({ error: "Failed to resolve location." });
      }
      return res.status(502).json({ error: "Failed to resolve location." });
    }

    const data = await response.json();
    const address = data?.address || {};
    const cityLevel =
      address.city ||
      address.town ||
      address.village ||
      address.municipality ||
      address.county ||
      "";
    const locality =
      address.suburb ||
      address.city_district ||
      address.neighbourhood ||
      address.quarter ||
      address.hamlet ||
      "";
    const resolvedCity = cityLevel || locality;
    const country = address.country || "";

    if (!resolvedCity || !country) {
      return res.status(404).json({ error: "Location not found." });
    }

    const payload = { city: resolvedCity, locality: locality || resolvedCity, country };
    setReverseGeoCacheEntry(cacheKey, payload);
    return res.json(payload);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to resolve location." });
  }
});

app.get("/api/geo/locate", async (req, res) => {
  try {
    const city = String(req.query.city || "").trim();
    const countryHint = String(req.query.country || "").trim();
    if (!city) {
      return res.status(400).json({ error: "City is required." });
    }

    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("limit", "1");
    const countryCode = /^[a-z]{2}$/i.test(countryHint) ? countryHint.toLowerCase() : "";
    if (countryCode) {
      url.searchParams.set("countrycodes", countryCode);
      url.searchParams.set("city", city);
    } else if (countryHint) {
      url.searchParams.set("q", `${city}, ${countryHint}`);
    } else {
      url.searchParams.set("city", city);
    }
    url.searchParams.set("addressdetails", "1");

    const response = await fetchWithRetry(url, {
      headers: {
        "User-Agent": "places-to-visit-ai/1.0",
        "Accept-Language": "en"
      }
    });

    if (!response.ok) {
      return res.status(502).json({ error: "Failed to resolve location." });
    }

    const data = await response.json();
    const entry = Array.isArray(data) ? data[0] : null;
    const lat = Number(entry?.lat);
    const lon = Number(entry?.lon);
    const address = entry?.address || {};
    const resolvedCity =
      address.city ||
      address.town ||
      address.village ||
      address.municipality ||
      address.county ||
      address.suburb ||
      address.city_district ||
      address.neighbourhood ||
      address.quarter ||
      city;
    const country = address.country || "";

    if (!Number.isFinite(lat) || !Number.isFinite(lon) || !country) {
      return res.status(404).json({ error: "Location not found." });
    }

    return res.json({ city: resolvedCity, country, lat, lon });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to resolve location." });
  }
});

app.get("/api/geo/candidates", async (req, res) => {
  try {
    const city = String(req.query.city || "").trim();
    const countryHint = String(req.query.country || "").trim();
    const limitRaw = Number(req.query.limit);
    const limit = Number.isFinite(limitRaw) ? Math.round(limitRaw) : 8;
    const safeLimit = Math.min(Math.max(limit, 1), 25);

    if (!city) {
      return res.status(400).json({ error: "City is required." });
    }

    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("limit", safeLimit.toString());
    url.searchParams.set("addressdetails", "1");
    const countryCode = /^[a-z]{2}$/i.test(countryHint) ? countryHint.toLowerCase() : "";
    if (countryCode) {
      url.searchParams.set("countrycodes", countryCode);
      url.searchParams.set("city", city);
    } else if (countryHint) {
      url.searchParams.set("q", `${city}, ${countryHint}`);
    } else {
      url.searchParams.set("city", city);
    }

    const response = await fetchWithRetry(url, {
      headers: {
        "User-Agent": "places-to-visit-ai/1.0",
        "Accept-Language": "en"
      }
    });

    if (!response.ok) {
      const fallbackCandidates = await findGeoCandidatesFromLocalIndex(city, countryHint, safeLimit);
      return res.json({ candidates: fallbackCandidates });
    }

    const data = await response.json();
    const candidates = (Array.isArray(data) ? data : [])
      .map((entry) => {
        const lat = Number(entry?.lat);
        const lon = Number(entry?.lon);
        const address = entry?.address || {};
        const resolvedCity =
          address.city ||
          address.town ||
          address.village ||
          address.municipality ||
          address.county ||
          address.suburb ||
          address.city_district ||
          address.neighbourhood ||
          address.quarter ||
          entry?.name ||
          city;
        const country = address.country || "";
        if (!Number.isFinite(lat) || !Number.isFinite(lon) || !country) return null;
        return {
          city: resolvedCity,
          country,
          lat,
          lon,
          displayName: entry?.display_name || `${resolvedCity}, ${country}`
        };
      })
      .filter(Boolean);

    const filtered = candidates.filter((candidate) =>
      isEuropeanGeoCountry(candidate.country, candidate.lon)
    );

    return res.json({ candidates: filtered });
  } catch (err) {
    console.error(err);
    try {
      const city = String(req.query.city || "").trim();
      const countryHint = String(req.query.country || "").trim();
      const limitRaw = Number(req.query.limit);
      const limit = Number.isFinite(limitRaw) ? Math.round(limitRaw) : 8;
      const safeLimit = Math.min(Math.max(limit, 1), 25);
      const fallbackCandidates = await findGeoCandidatesFromLocalIndex(city, countryHint, safeLimit);
      return res.json({ candidates: fallbackCandidates });
    } catch (fallbackErr) {
      console.error(fallbackErr);
      return res.status(500).json({ error: "Failed to resolve location." });
    }
  }
});

app.get("/api/geo/nearest", async (req, res) => {
  try {
    const lat = Number(req.query.lat);
    const lon = Number(req.query.lon);
    const fileName = String(req.query.file || "").trim();
    let resolvedFile = "";

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return res.status(400).json({ error: "Invalid coordinates." });
    }

    if (fileName) {
      const resolved = resolveCountryFile(fileName);
      if (resolved.error) {
        return res.status(400).json({ error: resolved.error });
      }
      const canonicalFile = await countriesStore.resolveFileName(resolved.file);
      if (!canonicalFile) {
        return res.status(404).json({ error: "File not found." });
      }
      resolvedFile = canonicalFile;
    }

    const index = await getOfferCityIndex();
    const candidates = resolvedFile
      ? index.filter((entry) => entry.file === resolvedFile)
      : index;

    if (!candidates.length) {
      return res.status(404).json({ error: "No nearby city found." });
    }

    let best = null;
    let bestDistance = Infinity;

    for (const entry of candidates) {
      const dist = haversineKm(lat, lon, entry.lat, entry.lon);
      if (dist < bestDistance) {
        bestDistance = dist;
        best = entry;
      }
    }

    if (!best?.city) {
      return res.status(404).json({ error: "No nearby city found." });
    }

    return res.json({ city: best.city, file: best.file, distanceKm: bestDistance });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to find nearest city." });
  }
});

app.post("/api/countries/:file/cities", requireAuth, async (req, res) => {
  try {
    const context = await getUserContext(req, res);
    if (!context) return;

    if (!planAllows(context.user.plan, ["basic", "premium"])) {
      return res.status(403).json({
        error: "Your plan does not allow adding new cities."
      });
    }
    if (!hasTokens(context.user)) {
      return res.status(403).json({ error: "No tokens remaining." });
    }

    const fileName = req.params.file;
    const { city, country } = req.body || {};

    if (!city || typeof city !== "string") {
      return res.status(400).json({ error: "City is required." });
    }
    const result = await generateCityInFile(fileName, city, country);
    if (result?.created) {
      await consumeToken(context.users, context.user);
      return res.json({
        ...result,
        _meta: { tokensRemaining: context.user.tokens, plan: context.user.plan }
      });
    }
    return res.json(result);
  } catch (err) {
    console.error(err);
    const status = err.status || 500;
    return res.status(status).json({ error: err.message || "Failed to generate city data." });
  }
});

app.post("/api/cities/generate", requireAuth, async (req, res) => {
  try {
    const context = await getUserContext(req, res);
    if (!context) return;

    if (!planAllows(context.user.plan, ["basic", "premium"])) {
      return res.status(403).json({
        error: "Your plan does not allow adding new cities."
      });
    }
    if (!hasTokens(context.user)) {
      return res.status(403).json({ error: "No tokens remaining." });
    }

    const { city, country } = req.body || {};
    if (!city || typeof city !== "string") {
      return res.status(400).json({ error: "City is required." });
    }

    const trimmedCity = city.trim();
    if (!trimmedCity) {
      return res.status(400).json({ error: "City is required." });
    }

    let resolvedCountry = country?.trim();
    if (!resolvedCountry) {
      resolvedCountry = await resolveCountryForCity(trimmedCity);
    }

    if (!resolvedCountry) {
      return res.status(404).json({
        error:
          "Country could not be resolved. Please include the country, e.g. \"Bor, Serbia\" or \"Bor (Serbia)\"."
      });
    }

    const match = await findCountryFileByName(resolvedCountry);
    if (!match) {
      return res.status(404).json({
        error: `No data file for resolved country (${resolvedCountry}). Please specify the country, e.g. \"${trimmedCity}, Serbia\".`
      });
    }

    const existingCity = await cityExistsInFile(match.file, trimmedCity);
    if (existingCity) {
      return res.json({
        created: false,
        city: existingCity.name,
        country: match.country,
        file: match.file
      });
    }

    const result = await generateCityInFile(match.file, trimmedCity, match.country);
    await consumeToken(context.users, context.user);
    return res.json({
      ...result,
      _meta: { tokensRemaining: context.user.tokens, plan: context.user.plan }
    });
  } catch (err) {
    console.error(err);
    const status = err.status || 500;
    return res.status(status).json({ error: err.message || "Failed to generate city data." });
  }
});

app.get("/api/countries", async (req, res) => {
  try {
    const countries = await countriesStore.listCountryEntries();
    return res.json({ countries });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to list countries." });
  }
});

app.get("/api/countries/:file", async (req, res) => {
  try {
    const fileName = req.params.file;
    const resolved = resolveCountryFile(fileName);
    if (resolved.error) {
      return res.status(400).json({ error: resolved.error });
    }

    const payload = await countriesStore.readCountryDocument(resolved.file);
    if (!payload) {
      return res.status(404).json({ error: "File not found." });
    }

    return res.json(payload);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Invalid JSON file." });
  }
});

const port = Number(process.env.PORT || 3001);
let server = null;
// When deployed to Vercel (serverless), or when imported, do not start a long-lived listener.
const entryPath = process.argv?.[1];
const isEntrypoint = entryPath ? import.meta.url === pathToFileURL(entryPath).href : false;
if (!process.env.VERCEL && isEntrypoint) {
  let countriesStorageInfo = null;
  let usersStorageInfo = null;
  try {
    countriesStorageInfo = await countriesStore.init();
    usersStorageInfo = await usersStore.init();
  } catch (err) {
    console.error("Failed to initialize storage.", err);
    process.exit(1);
  }

  if (countriesStorageInfo.mode === "postgres") {
    console.log(
      `Countries storage: PostgreSQL${countriesStorageInfo.seeded ? ` (seeded ${countriesStorageInfo.seeded} records from disk)` : ""}.`
    );
  } else {
    console.log("Countries storage: local JSON files.");
  }

  if (usersStorageInfo.mode === "postgres") {
    console.log(
      `Users storage: PostgreSQL${usersStorageInfo.seededUsers || usersStorageInfo.seededPending ? ` (seeded users: ${usersStorageInfo.seededUsers}, pending: ${usersStorageInfo.seededPending})` : ""}.`
    );
  } else {
    console.log("Users storage: local JSON files.");
  }

  server = app.listen(port, () => {
    console.log(`API running on http://localhost:${port}`);
    setTimeout(() => {
      if (typeof server?.ref === "function") server.ref();
    }, 0);

    setTimeout(() => {
      getOfferCityIndex()
        .then((index) => console.log(`✅ Geo index ready (${index.length} cities).`))
        .catch((err) => console.error("Geo index build failed.", err));
    }, 300);
  });
}

app.get("/api/auth/me", requireAuth, async (req, res) => {
  try {
    const users = await readJsonFile(USERS_PATH, []);
    let match = users.find((u) => u.id === req.user?.userId);
    if (!match && req.user?.email) {
      const normalized = normalizeEmail(req.user.email);
      match = users.find((u) => normalizeEmail(u.email) === normalized) || null;
    }
    if (match) {
      const changed = normalizeUserTokens(match);
      if (changed) {
        await writeJsonFile(USERS_PATH, users);
      }
    }

    return res.json({
      userId: req.user?.userId,
      name: match?.name || req.user?.name || "",
      email: req.user?.email,
      plan: match?.plan || req.user?.plan || "free",
      tokens: Number(match?.tokens || 0)
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to load user profile." });
  }
});

app.get("/api/auth/name-check", async (req, res) => {
  try {
    const rawName = String(req.query.name || "").trim();
    if (!rawName) {
      return res.status(400).json({ error: "Name is required." });
    }

    const normalized = normalizeUserName(rawName);
    const users = await readJsonFile(USERS_PATH, []);
    const pending = await readJsonFile(PENDING_USERS_PATH, []);

    const exists =
      users.some((u) => normalizeUserName(u.name) === normalized) ||
      pending.some((u) => normalizeUserName(u.name) === normalized);

    return res.json({ available: !exists });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to check name availability." });
  }
});


app.post("/api/auth/signup", async (req, res) => {
  try {
    const { name, email, password } = req.body || {};
    if (!name || !email || !password) {
      return res.status(400).json({ error: "Name, email, and password required" });
    }

    const normalizedName = normalizeUserName(name);
    if (!normalizedName) {
      return res.status(400).json({ error: "Name is required." });
    }

    const normalizedEmail = normalizeEmail(email);
    const users = await readJsonFile(USERS_PATH, []);
    const existing = users.find((u) => normalizeEmail(u.email) === normalizedEmail);
    if (existing) {
      return res.status(409).json({ error: "User already exists." });
    }
    const nameExists = users.find((u) => normalizeUserName(u.name) === normalizedName);
    if (nameExists) {
      return res.status(409).json({ error: "Name already exists." });
    }

    const pending = await readJsonFile(PENDING_USERS_PATH, []);
    const now = new Date();

    const activePending = pending.filter((entry) => !isPendingExpired(entry, now));
    if (activePending.length !== pending.length) {
      await writeJsonFile(PENDING_USERS_PATH, activePending);
    }

    const pendingExisting = activePending.find((u) => normalizeEmail(u.email) === normalizedEmail);
    if (pendingExisting) {
      const lastSentAt = safeParseDate(pendingExisting.lastEmailSentAt);
      const tooSoon =
        lastSentAt &&
        now.getTime() - lastSentAt.getTime() < PENDING_RESEND_MIN_INTERVAL_MS;

      if (tooSoon) {
        const waitSeconds = Math.ceil(
          (PENDING_RESEND_MIN_INTERVAL_MS - (now.getTime() - lastSentAt.getTime())) / 1000
        );
        return res.json({
          pending: true,
          message: `Signup already pending. Please wait ${waitSeconds}s before resending.`
        });
      }

      const confirmUrl = buildConfirmUrl(req, pendingExisting.token);
      try {
        await sendSignupEmail(pendingExisting.email, confirmUrl);
        pendingExisting.lastEmailSentAt = now.toISOString();
        pendingExisting.emailSendAttempts = Number(pendingExisting.emailSendAttempts || 0) + 1;
        await writeJsonFile(PENDING_USERS_PATH, activePending);
        return res.json({
          pending: true,
          message: "Signup already pending. Confirmation email re-sent. Check inbox/spam."
        });
      } catch (mailErr) {
        pendingExisting.lastEmailErrorAt = now.toISOString();
        pendingExisting.lastEmailError = String(mailErr?.message || mailErr);
        pendingExisting.emailSendAttempts = Number(pendingExisting.emailSendAttempts || 0) + 1;
        await writeJsonFile(PENDING_USERS_PATH, activePending);
        throw mailErr;
      }
    }
    const pendingName = activePending.find((u) => normalizeUserName(u.name) === normalizedName);
    if (pendingName) {
      return res.status(409).json({ error: "Name already exists." });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const token = crypto.randomBytes(32).toString("hex");
    const entry = {
      id: `u_${Date.now()}`,
      name: normalizedName,
      email: normalizedEmail,
      passwordHash,
      plan: "trial",
      tokens: 3,
      token,
      emailSendAttempts: 0,
      createdAt: new Date().toISOString()
    };

    activePending.push(entry);
    await writeJsonFile(PENDING_USERS_PATH, activePending);

    const confirmUrl = buildConfirmUrl(req, token);

    try {
      await sendSignupEmail(normalizedEmail, confirmUrl);
      entry.lastEmailSentAt = new Date().toISOString();
      entry.emailSendAttempts = 1;
      await writeJsonFile(PENDING_USERS_PATH, activePending);
    } catch (mailErr) {
      activePending.pop();
      await writeJsonFile(PENDING_USERS_PATH, activePending);
      throw mailErr;
    }

    return res.json({ message: "Confirmation email sent. Please check your inbox." });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message || "Failed to create signup request." });
  }
});

app.get("/api/auth/confirm", async (req, res) => {
  try {
    const token = String(req.query.token || "");
    if (!token) {
      return res.status(400).send("Invalid or expired token.");
    }

    const pending = await readJsonFile(PENDING_USERS_PATH, []);
    const idx = pending.findIndex((u) => u.token === token);
    if (idx === -1) {
      return res.status(400).send("Invalid or expired token.");
    }

    const entry = pending[idx];
    pending.splice(idx, 1);
    await writeJsonFile(PENDING_USERS_PATH, pending);

    const users = await readJsonFile(USERS_PATH, []);
    let user = users.find((u) => normalizeEmail(u.email) === normalizeEmail(entry.email));

    if (!user) {
      user = {
        id: entry.id,
        name: entry.name,
        email: entry.email,
        passwordHash: entry.passwordHash,
        plan: entry.plan || "free",
        tokens: Number(entry.tokens || 0)
      };
      users.push(user);
      await writeJsonFile(USERS_PATH, users);
    }

    const authToken = jwt.sign(
      {
        userId: user.id,
        name: user.name,
        email: user.email,
        plan: user.plan
      },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    const redirectUrl = buildClientUrl(req, "/");
    const url = new URL(redirectUrl);
    url.searchParams.set("token", authToken);

    return res.redirect(url.toString());
  } catch (err) {
    console.error(err);
    return res.status(500).send("Failed to confirm signup.");
  }
});

app.post("/api/auth/login", async (req, res) => {
  const { username, name, email, password } = req.body || {};
  const rawIdentifier = username ?? name ?? email;

  if (!rawIdentifier || !password) {
    return res.status(400).json({ error: "Username or email and password required" });
  }

  const users = await readJsonFile(USERS_PATH, []);
  const normalizedName = normalizeUserName(rawIdentifier);
  const normalizedEmail = normalizeEmail(rawIdentifier);
  const user = users.find(
    (u) =>
      normalizeUserName(u.name) === normalizedName ||
      normalizeEmail(u.email) === normalizedEmail
  );

  if (!user) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const match = await bcrypt.compare(password, user.passwordHash);
  if (!match) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const normalized = normalizeUserTokens(user);
  if (normalized) {
    await writeJsonFile(USERS_PATH, users);
  }

  const token = jwt.sign(
    {
      userId: user.id,
      name: user.name,
      email: user.email,
      plan: user.plan
    },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );

  res.json({
    token,
    user: {
      name: user.name,
      email: user.email,
      plan: user.plan,
      tokens: Number(user.tokens || 0)
    }
  });
});

export default app;

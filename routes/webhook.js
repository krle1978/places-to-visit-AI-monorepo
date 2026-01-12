import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { requireAuth } from "../middleware/auth.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, "..", "data");
const USERS_PATH = path.join(DATA_DIR, "users.json");

const AMOUNT_TO_TOKENS = {
  5: 7,
  10: 20,
  20: 50
};

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function readUsers() {
  try {
    const raw = fs.readFileSync(USERS_PATH, "utf8");
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function writeUsers(users) {
  fs.writeFileSync(USERS_PATH, JSON.stringify(users, null, 2), "utf8");
}

function creditTokensForUser(email, tokens) {
  const users = readUsers();
  const normalized = normalizeEmail(email);
  const user = users.find((u) => normalizeEmail(u.email) === normalized);
  if (!user) {
    const err = new Error("User not found.");
    err.status = 404;
    throw err;
  }

  if (typeof user.tokens !== "number" || Number.isNaN(user.tokens)) {
    user.tokens = 0;
  }

  user.tokens += tokens;
  writeUsers(users);

  return { tokens: user.tokens };
}

export function registerWebhookRoutes(app) {
  /**
   * Client-side PayPal confirmation hook.
   * Expects authenticated user and amount that was paid.
   * This does NOT validate against PayPal servers; it relies on auth + client flow.
   */
  app.post("/api/payments/paypal/credit", requireAuth, (req, res) => {
    try {
      const amount = Number(req.body?.amount);
      const tokens = AMOUNT_TO_TOKENS[amount];
      if (!tokens) {
        return res.status(400).json({ error: "Unsupported amount." });
      }

      const result = creditTokensForUser(req.user?.email, tokens);
      return res.json({
        ok: true,
        tokensAdded: tokens,
        totalTokens: result.tokens
      });
    } catch (err) {
      const status = err.status || 500;
      return res.status(status).json({ error: err.message || "Failed to credit tokens." });
    }
  });
}

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import jwt from "jsonwebtoken";
import { requireAuth } from "../middleware/auth.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, "..", "data");
const USERS_PATH = path.join(DATA_DIR, "users.json");
const JWT_SECRET = process.env.JWT_SECRET;

const AMOUNT_TO_TOKENS = {
  5: 7,
  10: 20,
  20: 50
};

const AMOUNT_TO_PLAN = {
  5: "basic",
  10: "premium",
  20: "premium_plus"
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

function signUserToken(user) {
  if (!JWT_SECRET) {
    const err = new Error("JWT secret is not configured.");
    err.status = 500;
    throw err;
  }

  return jwt.sign(
    {
      userId: user.id,
      email: user.email,
      plan: user.plan
    },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}

function creditTokensForUser(email, amount) {
  const tokens = AMOUNT_TO_TOKENS[amount];
  const plan = AMOUNT_TO_PLAN[amount];

  if (!tokens || !plan) {
    const err = new Error("Unsupported amount.");
    err.status = 400;
    throw err;
  }

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
  user.plan = plan;
  writeUsers(users);

  return {
    user,
    tokens
  };
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
      const result = creditTokensForUser(req.user?.email, amount);
      const token = signUserToken(result.user);
      return res.json({
        ok: true,
        plan: result.user.plan,
        tokensAdded: result.tokens,
        totalTokens: result.user.tokens,
        token
      });
    } catch (err) {
      const status = err.status || 500;
      return res.status(status).json({ error: err.message || "Failed to credit tokens." });
    }
  });
}

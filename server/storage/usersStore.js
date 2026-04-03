import fs from "fs";
import path from "path";
import { Pool } from "pg";

function shouldUseSsl(databaseUrl) {
  const value = String(databaseUrl || "").toLowerCase();
  return !value.includes("localhost") && !value.includes("127.0.0.1");
}

function toIsoOrNull(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function normalizeUserRecord(entry) {
  return {
    id: String(entry?.id || "").trim(),
    name: String(entry?.name || "").trim(),
    email: String(entry?.email || "").trim(),
    passwordHash: String(entry?.passwordHash || "").trim(),
    plan: String(entry?.plan || "free").trim() || "free",
    tokens: Number.isFinite(Number(entry?.tokens)) ? Number(entry.tokens) : 0
  };
}

function normalizePendingRecord(entry) {
  return {
    id: String(entry?.id || "").trim(),
    name: String(entry?.name || "").trim(),
    email: String(entry?.email || "").trim(),
    passwordHash: String(entry?.passwordHash || "").trim(),
    plan: String(entry?.plan || "trial").trim() || "trial",
    tokens: Number.isFinite(Number(entry?.tokens)) ? Number(entry.tokens) : 3,
    token: String(entry?.token || "").trim(),
    emailSendAttempts: Number.isFinite(Number(entry?.emailSendAttempts))
      ? Number(entry.emailSendAttempts)
      : 0,
    createdAt: toIsoOrNull(entry?.createdAt) || new Date().toISOString(),
    lastEmailSentAt: toIsoOrNull(entry?.lastEmailSentAt),
    lastEmailErrorAt: toIsoOrNull(entry?.lastEmailErrorAt),
    lastEmailError: entry?.lastEmailError ? String(entry.lastEmailError) : undefined
  };
}

export function createUsersStore({ dataDir, databaseUrl }) {
  const normalizedDataDir = path.resolve(dataDir);
  const usersPath = path.join(normalizedDataDir, "users.json");
  const pendingUsersPath = path.join(normalizedDataDir, "pending_users.json");
  const dbUrl = String(databaseUrl || "").trim();
  let useDatabase = Boolean(dbUrl);

  let pool = null;
  let initPromise = null;
  let initialized = false;
  const DB_INIT_MAX_ATTEMPTS = 2;

  async function readJsonFile(filePath, fallback) {
    try {
      const raw = await fs.promises.readFile(filePath, "utf8");
      return JSON.parse(raw);
    } catch (err) {
      if (err.code === "ENOENT") return fallback;
      throw err;
    }
  }

  async function writeJsonFile(filePath, value) {
    await fs.promises.writeFile(filePath, JSON.stringify(value, null, 2), "utf8");
  }

  async function seedUsersIfNeeded() {
    const result = await pool.query("SELECT COUNT(*)::int AS count FROM app_users");
    const count = Number(result.rows?.[0]?.count || 0);
    if (count > 0) return 0;

    const users = await readJsonFile(usersPath, []);
    let inserted = 0;
    for (const entry of users) {
      const user = normalizeUserRecord(entry);
      if (!user.id || !user.name || !user.email || !user.passwordHash) continue;
      await pool.query(
        `
          INSERT INTO app_users (id, name, email, password_hash, plan, tokens, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
          ON CONFLICT (id)
          DO UPDATE SET
            name = EXCLUDED.name,
            email = EXCLUDED.email,
            password_hash = EXCLUDED.password_hash,
            plan = EXCLUDED.plan,
            tokens = EXCLUDED.tokens,
            updated_at = NOW()
        `,
        [user.id, user.name, user.email, user.passwordHash, user.plan, user.tokens]
      );
      inserted += 1;
    }

    return inserted;
  }

  async function seedPendingIfNeeded() {
    const result = await pool.query("SELECT COUNT(*)::int AS count FROM pending_user_signups");
    const count = Number(result.rows?.[0]?.count || 0);
    if (count > 0) return 0;

    const entries = await readJsonFile(pendingUsersPath, []);
    let inserted = 0;
    for (const raw of entries) {
      const entry = normalizePendingRecord(raw);
      if (!entry.token || !entry.id || !entry.name || !entry.email || !entry.passwordHash) continue;

      await pool.query(
        `
          INSERT INTO pending_user_signups (
            token,
            id,
            name,
            email,
            password_hash,
            plan,
            tokens,
            email_send_attempts,
            created_at,
            last_email_sent_at,
            last_email_error_at,
            last_email_error
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::timestamptz, $10::timestamptz, $11::timestamptz, $12)
          ON CONFLICT (token)
          DO UPDATE SET
            id = EXCLUDED.id,
            name = EXCLUDED.name,
            email = EXCLUDED.email,
            password_hash = EXCLUDED.password_hash,
            plan = EXCLUDED.plan,
            tokens = EXCLUDED.tokens,
            email_send_attempts = EXCLUDED.email_send_attempts,
            created_at = EXCLUDED.created_at,
            last_email_sent_at = EXCLUDED.last_email_sent_at,
            last_email_error_at = EXCLUDED.last_email_error_at,
            last_email_error = EXCLUDED.last_email_error
        `,
        [
          entry.token,
          entry.id,
          entry.name,
          entry.email,
          entry.passwordHash,
          entry.plan,
          entry.tokens,
          entry.emailSendAttempts,
          entry.createdAt,
          entry.lastEmailSentAt,
          entry.lastEmailErrorAt,
          entry.lastEmailError || null
        ]
      );
      inserted += 1;
    }

    return inserted;
  }

  async function ensureInitialized() {
    if (initialized) {
      return { mode: useDatabase ? "postgres" : "file", seededUsers: 0, seededPending: 0 };
    }
    if (initPromise) return initPromise;

    initPromise = (async () => {
      if (!useDatabase) {
        initialized = true;
        return { mode: "file", seededUsers: 0, seededPending: 0 };
      }

      let lastInitError = null;
      for (let attempt = 1; attempt <= DB_INIT_MAX_ATTEMPTS; attempt += 1) {
        const candidatePool = new Pool({
          connectionString: dbUrl,
          ssl: shouldUseSsl(dbUrl) ? { rejectUnauthorized: false } : false
        });
        pool = candidatePool;

        try {
          await pool.query(`
            CREATE TABLE IF NOT EXISTS app_users (
              id TEXT PRIMARY KEY,
              name TEXT NOT NULL,
              email TEXT NOT NULL UNIQUE,
              password_hash TEXT NOT NULL,
              plan TEXT NOT NULL DEFAULT 'free',
              tokens INTEGER NOT NULL DEFAULT 0,
              created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
          `);
          await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_app_users_email_lower
            ON app_users ((lower(email)))
          `);
          await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_app_users_name_lower
            ON app_users ((lower(name)))
          `);

          await pool.query(`
            CREATE TABLE IF NOT EXISTS pending_user_signups (
              token TEXT PRIMARY KEY,
              id TEXT NOT NULL,
              name TEXT NOT NULL,
              email TEXT NOT NULL,
              password_hash TEXT NOT NULL,
              plan TEXT NOT NULL DEFAULT 'trial',
              tokens INTEGER NOT NULL DEFAULT 3,
              email_send_attempts INTEGER NOT NULL DEFAULT 0,
              created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              last_email_sent_at TIMESTAMPTZ,
              last_email_error_at TIMESTAMPTZ,
              last_email_error TEXT
            )
          `);
          await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_pending_signups_email_lower
            ON pending_user_signups ((lower(email)))
          `);
          await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_pending_signups_name_lower
            ON pending_user_signups ((lower(name)))
          `);

          const seededUsers = await seedUsersIfNeeded();
          const seededPending = await seedPendingIfNeeded();

          initialized = true;
          initPromise = null;
          return { mode: "postgres", seededUsers, seededPending };
        } catch (err) {
          lastInitError = err;
          console.error(
            `Users storage database init attempt ${attempt}/${DB_INIT_MAX_ATTEMPTS} failed.`,
            err
          );
          try {
            await candidatePool.end();
          } catch {
            // No-op: pool may already be closed or never opened.
          }
          if (pool === candidatePool) pool = null;
        }
      }

      useDatabase = false;
      initialized = true;
      initPromise = null;
      console.warn(
        `Users storage falling back to local JSON after ${DB_INIT_MAX_ATTEMPTS} failed database init attempts.`,
        lastInitError?.message || lastInitError || ""
      );
      return { mode: "file", seededUsers: 0, seededPending: 0 };
    })().catch((err) => {
      initPromise = null;
      throw err;
    });

    return initPromise;
  }

  async function readUsers() {
    await ensureInitialized();

    if (!useDatabase) {
      const users = await readJsonFile(usersPath, []);
      return users.map(normalizeUserRecord).filter((entry) => entry.id && entry.email);
    }

    const result = await pool.query(
      `
        SELECT id, name, email, password_hash, plan, tokens
        FROM app_users
        ORDER BY created_at ASC, id ASC
      `
    );

    return result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      email: row.email,
      passwordHash: row.password_hash,
      plan: row.plan,
      tokens: Number(row.tokens || 0)
    }));
  }

  async function writeUsers(users) {
    const safeUsers = Array.isArray(users) ? users.map(normalizeUserRecord) : [];
    await ensureInitialized();

    if (!useDatabase) {
      await writeJsonFile(usersPath, safeUsers);
      return;
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("DELETE FROM app_users");

      for (const user of safeUsers) {
        if (!user.id || !user.name || !user.email || !user.passwordHash) continue;
        await client.query(
          `
            INSERT INTO app_users (id, name, email, password_hash, plan, tokens, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
          `,
          [user.id, user.name, user.email, user.passwordHash, user.plan, user.tokens]
        );
      }

      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  async function readPendingUsers() {
    await ensureInitialized();

    if (!useDatabase) {
      const entries = await readJsonFile(pendingUsersPath, []);
      return entries.map(normalizePendingRecord).filter((entry) => entry.token && entry.email);
    }

    const result = await pool.query(
      `
        SELECT
          token,
          id,
          name,
          email,
          password_hash,
          plan,
          tokens,
          email_send_attempts,
          created_at,
          last_email_sent_at,
          last_email_error_at,
          last_email_error
        FROM pending_user_signups
        ORDER BY created_at ASC, token ASC
      `
    );

    return result.rows.map((row) => ({
      token: row.token,
      id: row.id,
      name: row.name,
      email: row.email,
      passwordHash: row.password_hash,
      plan: row.plan,
      tokens: Number(row.tokens || 0),
      emailSendAttempts: Number(row.email_send_attempts || 0),
      createdAt: toIsoOrNull(row.created_at) || new Date().toISOString(),
      lastEmailSentAt: toIsoOrNull(row.last_email_sent_at) || undefined,
      lastEmailErrorAt: toIsoOrNull(row.last_email_error_at) || undefined,
      lastEmailError: row.last_email_error || undefined
    }));
  }

  async function writePendingUsers(entries) {
    const safeEntries = Array.isArray(entries) ? entries.map(normalizePendingRecord) : [];
    await ensureInitialized();

    if (!useDatabase) {
      await writeJsonFile(pendingUsersPath, safeEntries);
      return;
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("DELETE FROM pending_user_signups");

      for (const entry of safeEntries) {
        if (!entry.token || !entry.id || !entry.name || !entry.email || !entry.passwordHash) continue;
        await client.query(
          `
            INSERT INTO pending_user_signups (
              token,
              id,
              name,
              email,
              password_hash,
              plan,
              tokens,
              email_send_attempts,
              created_at,
              last_email_sent_at,
              last_email_error_at,
              last_email_error
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::timestamptz, $10::timestamptz, $11::timestamptz, $12)
          `,
          [
            entry.token,
            entry.id,
            entry.name,
            entry.email,
            entry.passwordHash,
            entry.plan,
            entry.tokens,
            entry.emailSendAttempts,
            entry.createdAt,
            entry.lastEmailSentAt || null,
            entry.lastEmailErrorAt || null,
            entry.lastEmailError || null
          ]
        );
      }

      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  return {
    init: ensureInitialized,
    readUsers,
    writeUsers,
    readPendingUsers,
    writePendingUsers
  };
}

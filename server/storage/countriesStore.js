import fs from "fs";
import path from "path";
import { Pool } from "pg";

function parseJsonb(value) {
  if (!value) return null;
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }
  return value;
}

function validateFileName(fileName) {
  const value = String(fileName || "").trim();
  if (!value || !value.endsWith(".json")) {
    return { error: "Invalid file name." };
  }
  if (path.basename(value) !== value) {
    return { error: "Invalid file path." };
  }
  return { file: value };
}

function shouldUseSsl(databaseUrl) {
  const value = String(databaseUrl || "").toLowerCase();
  return !value.includes("localhost") && !value.includes("127.0.0.1");
}

export function createCountriesStore({ countriesDir, databaseUrl }) {
  const normalizedDir = path.resolve(countriesDir);
  const dbUrl = String(databaseUrl || "").trim();
  const useDatabase = Boolean(dbUrl);
  let pool = null;
  let initPromise = null;
  let initialized = false;

  async function readDiskCountry(fileName) {
    const fullPath = path.join(normalizedDir, fileName);
    const raw = await fs.promises.readFile(fullPath, "utf8");
    return JSON.parse(raw);
  }

  async function listDiskCountryEntries() {
    const files = await fs.promises.readdir(normalizedDir);
    const entries = await Promise.all(
      files
        .filter((file) => file.endsWith(".json"))
        .map(async (file) => {
          try {
            const parsed = await readDiskCountry(file);
            const name = String(parsed?.name || "").trim();
            if (!name) return null;
            return { file, name, payload: parsed };
          } catch (err) {
            console.error(`Failed to load country file: ${file}`, err);
            return null;
          }
        })
    );

    return entries.filter(Boolean);
  }

  async function ensureInitialized() {
    if (initialized) {
      return { mode: useDatabase ? "postgres" : "file", seeded: 0 };
    }
    if (initPromise) return initPromise;

    initPromise = (async () => {
      if (!useDatabase) {
        initialized = true;
        return { mode: "file", seeded: 0 };
      }

      pool = new Pool({
        connectionString: dbUrl,
        ssl: shouldUseSsl(dbUrl) ? { rejectUnauthorized: false } : false
      });

      await pool.query(`
        CREATE TABLE IF NOT EXISTS country_documents (
          file_name TEXT PRIMARY KEY,
          country_name TEXT NOT NULL,
          payload JSONB NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_country_documents_country_name_lower
        ON country_documents ((lower(country_name)))
      `);

      let seeded = 0;
      const countResult = await pool.query("SELECT COUNT(*)::int AS count FROM country_documents");
      const count = Number(countResult.rows?.[0]?.count || 0);
      if (count === 0) {
        const seedRows = await listDiskCountryEntries();
        for (const row of seedRows) {
          await pool.query(
            `
              INSERT INTO country_documents (file_name, country_name, payload, updated_at)
              VALUES ($1, $2, $3::jsonb, NOW())
              ON CONFLICT (file_name)
              DO UPDATE SET
                country_name = EXCLUDED.country_name,
                payload = EXCLUDED.payload,
                updated_at = NOW()
            `,
            [row.file, row.name, JSON.stringify(row.payload)]
          );
        }
        seeded = seedRows.length;
      }

      initialized = true;
      initPromise = null;
      return { mode: "postgres", seeded };
    })().catch((err) => {
      initPromise = null;
      throw err;
    });

    return initPromise;
  }

  async function resolveFileName(fileName) {
    const resolved = validateFileName(fileName);
    if (resolved.error) {
      const err = new Error(resolved.error);
      err.status = 400;
      throw err;
    }

    await ensureInitialized();

    if (!useDatabase) {
      const files = await fs.promises.readdir(normalizedDir);
      const exactMatch = files.find((file) => file === resolved.file);
      if (exactMatch) return exactMatch;

      const lowered = resolved.file.toLowerCase();
      return (
        files.find((file) => file.endsWith(".json") && file.toLowerCase() === lowered) || null
      );
    }

    const exact = await pool.query(
      "SELECT file_name FROM country_documents WHERE file_name = $1 LIMIT 1",
      [resolved.file]
    );
    if (exact.rowCount) return exact.rows[0].file_name;

    const insensitive = await pool.query(
      "SELECT file_name FROM country_documents WHERE lower(file_name) = lower($1) LIMIT 1",
      [resolved.file]
    );
    return insensitive.rowCount ? insensitive.rows[0].file_name : null;
  }

  async function listCountryEntries() {
    await ensureInitialized();

    if (!useDatabase) {
      const entries = await listDiskCountryEntries();
      return entries
        .map((entry) => ({ file: entry.file, name: entry.name }))
        .sort((a, b) => a.name.localeCompare(b.name));
    }

    const result = await pool.query(
      "SELECT file_name, country_name FROM country_documents ORDER BY country_name ASC"
    );
    return result.rows.map((row) => ({ file: row.file_name, name: row.country_name }));
  }

  async function readCountryDocument(fileName) {
    const canonicalFile = await resolveFileName(fileName);
    if (!canonicalFile) return null;

    if (!useDatabase) {
      try {
        return await readDiskCountry(canonicalFile);
      } catch (err) {
        if (err.code === "ENOENT") return null;
        throw err;
      }
    }

    const result = await pool.query(
      "SELECT payload FROM country_documents WHERE file_name = $1 LIMIT 1",
      [canonicalFile]
    );
    if (!result.rowCount) return null;

    return parseJsonb(result.rows[0].payload);
  }

  async function writeCountryDocument(fileName, payload) {
    const resolved = validateFileName(fileName);
    if (resolved.error) {
      const err = new Error(resolved.error);
      err.status = 400;
      throw err;
    }

    const countryName = String(payload?.name || "").trim();
    if (!countryName) {
      const err = new Error("Invalid country payload.");
      err.status = 500;
      throw err;
    }

    await ensureInitialized();
    const canonicalFile = await resolveFileName(resolved.file);
    const targetFile = canonicalFile || resolved.file;

    if (!useDatabase) {
      const fullPath = path.join(normalizedDir, targetFile);
      await fs.promises.writeFile(fullPath, JSON.stringify(payload, null, 2), "utf8");
      return;
    }

    await pool.query(
      `
        INSERT INTO country_documents (file_name, country_name, payload, updated_at)
        VALUES ($1, $2, $3::jsonb, NOW())
        ON CONFLICT (file_name)
        DO UPDATE SET
          country_name = EXCLUDED.country_name,
          payload = EXCLUDED.payload,
          updated_at = NOW()
      `,
      [targetFile, countryName, JSON.stringify(payload)]
    );
  }

  async function readAllCountryDocuments() {
    await ensureInitialized();

    if (!useDatabase) {
      const entries = await listDiskCountryEntries();
      return entries.map((entry) => ({ file: entry.file, payload: entry.payload }));
    }

    const result = await pool.query(
      "SELECT file_name, payload FROM country_documents ORDER BY file_name ASC"
    );

    return result.rows
      .map((row) => ({ file: row.file_name, payload: parseJsonb(row.payload) }))
      .filter((row) => row.payload && typeof row.payload === "object");
  }

  return {
    init: ensureInitialized,
    validateFileName,
    resolveFileName,
    listCountryEntries,
    readCountryDocument,
    writeCountryDocument,
    readAllCountryDocuments
  };
}

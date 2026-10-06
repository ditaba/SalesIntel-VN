import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { SCHEMA_SQL } from "./schema";

const globalForDb = globalThis as unknown as { __salesintelDb?: Database.Database };

export function dbPath(): string {
  return process.env.DATABASE_PATH || path.join(process.cwd(), "data", "salesintel.db");
}

/** Open (and on first use, create + seed) the SQLite database. */
export function getDb(): Database.Database {
  if (globalForDb.__salesintelDb) return globalForDb.__salesintelDb;
  const file = dbPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");
  db.exec(SCHEMA_SQL);
  const { n } = db.prepare("SELECT COUNT(*) n FROM users").get() as { n: number };
  if (n === 0) {
    // Lazy import keeps the seed generator out of the hot path once data exists.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { seedDatabase } = require("./seed") as typeof import("./seed");
    seedDatabase(db);
  }
  globalForDb.__salesintelDb = db;
  return db;
}

export function parseJSON<T>(s: string | null | undefined, fallback: T): T {
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}

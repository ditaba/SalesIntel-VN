import Database from "better-sqlite3";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { SCHEMA_SQL } from "./schema";

const globalForDb = globalThis as unknown as { __salesintelDb?: Database.Database };

export function dbPath(): string {
  if (process.env.DATABASE_PATH) return process.env.DATABASE_PATH;
  // Serverless platforms (Vercel) mount the app read-only; only the OS temp dir is writable.
  // The DB there is ephemeral: re-seeded on each cold start and not shared between instances.
  if (process.env.VERCEL) return path.join(os.tmpdir(), "salesintel.db");
  return path.join(process.cwd(), "data", "salesintel.db");
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

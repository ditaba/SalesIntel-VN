// Reset and re-seed the demo database:  npm run seed
import fs from "node:fs";
import { dbPath, getDb } from "../src/lib/db";

const file = dbPath();
for (const f of [file, `${file}-wal`, `${file}-shm`]) if (fs.existsSync(f)) fs.rmSync(f);
const db = getDb();
const stats = db.prepare(`SELECT ai_opportunity_level level, COUNT(*) n FROM companies GROUP BY 1`).all();
console.log(stats);
db.close();

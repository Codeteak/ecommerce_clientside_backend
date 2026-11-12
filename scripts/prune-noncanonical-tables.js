import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";
import { env } from "../src/config/env.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  ssl: env.DATABASE_SSL_REJECT_UNAUTHORIZED
    ? { rejectUnauthorized: true }
    : { rejectUnauthorized: false }
});

const sqlPath = path.join(__dirname, "prune-noncanonical-tables.sql");
const sql = fs.readFileSync(sqlPath, "utf8");

try {
  await pool.query(sql);
  console.log("Applied:", path.basename(sqlPath));
} finally {
  await pool.end();
}

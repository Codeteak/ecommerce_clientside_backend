import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";
import { env } from "../src/config/env.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..");

const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  ssl: env.DATABASE_SSL_REJECT_UNAUTHORIZED
    ? { rejectUnauthorized: true }
    : { rejectUnauthorized: false }
});

/**
 * Default: idempotent split migrations under `migrations/001_deployment_postgresql/`
 * (extensions, then `tables/*.sql` in numeric order). Fits DBs that already have core tables.
 *
 * One-shot monolith (large, not ideal for drifted DBs): `DB_MIGRATE_FULL_SCHEMA=1 npm run db:migrate`
 */
function listDeploymentSqlPaths() {
  const deploymentRoot = path.join(repoRoot, "migrations/001_deployment_postgresql");
  const paths = [];
  const extPath = path.join(deploymentRoot, "000_extensions_and_primitives.sql");
  if (fs.existsSync(extPath)) {
    paths.push(extPath);
  }
  const tablesDir = path.join(deploymentRoot, "tables");
  if (fs.existsSync(tablesDir)) {
    const names = fs.readdirSync(tablesDir).filter((f) => f.endsWith(".sql")).sort();
    for (const name of names) {
      paths.push(path.join(tablesDir, name));
    }
  }
  return paths;
}

try {
  if (process.env.DB_MIGRATE_FULL_SCHEMA === "1") {
    const sqlPath = path.join(repoRoot, "migrations/001_full_schema.sql");
    if (!fs.existsSync(sqlPath)) {
      throw new Error("Missing migration: migrations/001_full_schema.sql");
    }
    const sql = fs.readFileSync(sqlPath, "utf8");
    await pool.query(sql);
    // eslint-disable-next-line no-console
    console.log("Applied schema: migrations/001_full_schema.sql (DB_MIGRATE_FULL_SCHEMA=1)");
  } else {
    const files = listDeploymentSqlPaths();
    if (files.length === 0) {
      throw new Error("No SQL files under migrations/001_deployment_postgresql/");
    }
    for (const sqlPath of files) {
      const sql = fs.readFileSync(sqlPath, "utf8");
      await pool.query(sql);
      // eslint-disable-next-line no-console
      console.log("Applied:", path.relative(repoRoot, sqlPath));
    }
  }
} finally {
  await pool.end();
}

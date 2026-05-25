#!/usr/bin/env node
/**
 * Ensures shop + logo exist for resolve-by-domain (by domain, not fixed id).
 *
 *   npm run db:seed:resolve-domain
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";
import { env } from "../src/config/env.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sqlPath = path.join(__dirname, "ops/seed-resolve-by-domain-sample.sql");

const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  ssl: env.DATABASE_SSL_REJECT_UNAUTHORIZED
    ? { rejectUnauthorized: true }
    : { rejectUnauthorized: false }
});

const sampleDomain = "marketfresh.in";

try {
  const sql = fs.readFileSync(sqlPath, "utf8");
  await pool.query(sql);

  const { rows } = await pool.query(
    `SELECT s.id, s.name, s.domain, s.custom_domain, ma.storage_key
       FROM shops s
       LEFT JOIN entity_images ei
         ON ei.shop_id = s.id AND ei.entity_type = 'shop'
       LEFT JOIN media_assets ma ON ma.id = ei.media_asset_id
      WHERE lower(coalesce(s.domain, '')) = lower($1)
         OR lower(coalesce(s.custom_domain, '')) = lower($1)
      LIMIT 1`,
    [sampleDomain]
  );

  const row = rows[0];
  // eslint-disable-next-line no-console
  console.log("Seed applied:", sqlPath);
  // eslint-disable-next-line no-console
  console.log("Shop for domain:", row ?? "(not found)");
  // eslint-disable-next-line no-console
  console.log(
    "Try:",
    `${env.API_PUBLIC_URL}/api/shops/resolve-by-domain?domain=${sampleDomain}`
  );
  if (row?.storage_key && env.OBJECT_STORAGE_PUBLIC_BASE_URL) {
    const base = env.OBJECT_STORAGE_PUBLIC_BASE_URL.replace(/\/$/, "");
    // eslint-disable-next-line no-console
    console.log("Expected shop_image:", `${base}/${row.storage_key}`);
  } else if (row?.storage_key) {
    // eslint-disable-next-line no-console
    console.warn(
      "OBJECT_STORAGE_PUBLIC_BASE_URL is unset — API returns shop_image: null until set in env"
    );
  } else {
    // eslint-disable-next-line no-console
    console.warn("No entity_images row for shop logo — check entity_images + media_assets");
  }
} catch (err) {
  if (err?.code === "23505" && /shops_domain|shops_custom_domain/i.test(String(err.constraint))) {
    // eslint-disable-next-line no-console
    console.error(
      `Domain "${sampleDomain}" conflict on another shop. Fix shops.domain/custom_domain, then re-run.`
    );
  }
  throw err;
} finally {
  await pool.end();
}

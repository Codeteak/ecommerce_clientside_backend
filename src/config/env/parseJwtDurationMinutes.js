/**
 * Parse jsonwebtoken-style duration strings (e.g. 15m, 1h, 7d) to minutes.
 * @returns {number | null} null if unrecognized
 */
export function parseJwtDurationMinutes(value) {
  const s = String(value || "").trim();
  const m = /^(\d+)\s*([smhd])$/i.exec(s);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n <= 0) return null;
  const unit = m[2].toLowerCase();
  if (unit === "s") return n / 60;
  if (unit === "m") return n;
  if (unit === "h") return n * 60;
  if (unit === "d") return n * 24 * 60;
  return null;
}

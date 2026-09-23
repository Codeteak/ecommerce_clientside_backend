/**
 * Live `addresses` table is lean: id, raw, lat, lng.
 * Structured fields (line1, city, …) are stored inside `raw` as JSON when possible.
 * Legacy keys state / postal_code / country in old raw JSON are ignored on read.
 */

const STRUCTURED_KEYS = ["line1", "line2", "landmark", "city"];

function emptyStructured() {
  return {
    line1: null,
    line2: null,
    landmark: null,
    city: null
  };
}

function fromRawObject(obj) {
  const out = emptyStructured();
  if (!obj || typeof obj !== "object") return out;
  out.line1 = obj.line1 ?? obj.line_1 ?? null;
  out.line2 = obj.line2 ?? obj.line_2 ?? null;
  out.landmark = obj.landmark ?? null;
  out.city = obj.city ?? null;
  return out;
}

export function parseAddressRow(row, id) {
  if (!row || !id) return null;
  let structured = emptyStructured();
  const raw = row.raw;
  if (raw && typeof raw === "object") {
    structured = fromRawObject(raw);
  } else if (typeof raw === "string" && raw.trim()) {
    const text = raw.trim();
    if (text.startsWith("{")) {
      try {
        structured = fromRawObject(JSON.parse(text));
      } catch {
        structured.line1 = text;
      }
    } else {
      structured.line1 = text;
    }
  }
  const rawText =
    typeof raw === "string" ? raw : raw != null ? JSON.stringify(raw) : structured.line1;
  return {
    id,
    line1: structured.line1,
    line2: structured.line2,
    landmark: structured.landmark,
    city: structured.city,
    lat: row.lat ?? null,
    lng: row.lng ?? null,
    raw: rawText ?? null
  };
}

export function encodeAddressRaw(merged) {
  const obj = {};
  for (const key of STRUCTURED_KEYS) {
    const val = merged[key];
    if (val != null && String(val).trim() !== "") obj[key] = String(val).trim();
  }
  if (Object.keys(obj).length === 0) {
    return merged.raw != null && String(merged.raw).trim() !== "" ? String(merged.raw).trim() : null;
  }
  return JSON.stringify(obj);
}

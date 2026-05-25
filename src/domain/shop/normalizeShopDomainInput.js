/**
 * Normalizes a domain query/host for shop lookup (strips scheme, path, port).
 * @param {unknown} raw
 */
export function normalizeShopDomainInput(raw) {
  let d = String(raw ?? "").trim().toLowerCase();
  if (!d) return "";
  if (d.includes("://")) {
    try {
      d = new URL(d).hostname.toLowerCase();
    } catch {
      d = d.replace(/^[a-z]+:\/\//, "").split("/")[0] ?? "";
    }
  } else if (d.includes("/")) {
    d = d.split("/")[0] ?? "";
  }
  const colon = d.indexOf(":");
  if (colon > 0 && !d.startsWith("[")) {
    d = d.slice(0, colon);
  }
  if (d.startsWith("www.")) {
    d = d.slice(4);
  }
  return d;
}

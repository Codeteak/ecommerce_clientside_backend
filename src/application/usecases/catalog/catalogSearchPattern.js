export function toIlikePattern(q) {
  if (q == null || String(q).trim() === "") return null;
  const t = String(q)
    .trim()
    .replace(/\\/g, "\\\\")
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_");
  return `%${t}%`;
}

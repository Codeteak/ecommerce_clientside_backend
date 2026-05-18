function escapeIlikeTerm(q) {
  return String(q)
    .trim()
    .replace(/\\/g, "\\\\")
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_");
}

export function toIlikePattern(q) {
  if (q == null || String(q).trim() === "") return null;
  return `%${escapeIlikeTerm(q)}%`;
}

/** Prefix match for typeahead (`term%`) — can use btree / pattern_ops indexes. */
export function toPrefixIlikePattern(q) {
  if (q == null || String(q).trim() === "") return null;
  return `${escapeIlikeTerm(q)}%`;
}

/**
 * @param {string | null | undefined} q
 * @param {'contains' | 'prefix' | null | undefined} searchMode
 */
export function resolveCatalogSearchPattern(q, searchMode = "contains") {
  if (searchMode === "prefix") {
    return toPrefixIlikePattern(q);
  }
  return toIlikePattern(q);
}

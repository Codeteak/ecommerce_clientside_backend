/**
 * Decide whether a storefront product list query should use Redis cache.
 *
 * @param {{
 *   search?: string | null,
 *   qPattern?: string | null,
 *   limit: number,
 *   cursor?: string | null,
 *   offset?: number | null,
 *   categoryId?: string | null,
 *   brandId?: string | null,
 *   minPriceMinor?: number | null,
 *   maxPriceMinor?: number | null,
 *   sortBy?: string,
 *   maxLimit?: number,
 *   maxOffset?: number,
 *   searchMinChars?: number
 * }} input
 * @returns {{ cache: boolean, reason: string }}
 */
export function shouldCacheProductList(input) {
  const maxLimit = Number(input.maxLimit) > 0 ? Number(input.maxLimit) : 50;
  const maxOffset = Number(input.maxOffset) >= 0 ? Number(input.maxOffset) : 100;
  const searchMinChars = Number(input.searchMinChars) > 0 ? Number(input.searchMinChars) : 3;

  const limit = Math.max(1, Number(input.limit) || 24);
  if (limit > maxLimit) {
    return { cache: false, reason: "limit_above_max" };
  }

  const hasCursor = input.cursor != null && String(input.cursor).trim() !== "";
  const offsetValue = Number.isInteger(input.offset) ? Math.max(0, input.offset) : null;

  if (hasCursor) {
    return { cache: false, reason: "cursor_pagination" };
  }

  if (offsetValue != null && offsetValue > maxOffset) {
    return { cache: false, reason: "offset_above_max" };
  }

  const searchRaw = typeof input.search === "string" ? input.search.trim() : "";
  const qPattern = input.qPattern != null ? String(input.qPattern).trim() : "";
  if (searchRaw.length > 0 && searchRaw.length < searchMinChars) {
    return { cache: false, reason: "search_too_short" };
  }
  if (qPattern.length > 0 && qPattern.length < searchMinChars) {
    return { cache: false, reason: "search_pattern_too_short" };
  }

  const hasCategory = input.categoryId != null && String(input.categoryId).trim() !== "";
  const hasBrand = input.brandId != null && String(input.brandId).trim() !== "";
  const hasSearch = searchRaw.length > 0 || qPattern.length > 0;
  const hasMin = Number.isInteger(input.minPriceMinor);
  const hasMax = Number.isInteger(input.maxPriceMinor);

  if (hasMin && hasMax) {
    return { cache: false, reason: "price_range_filter" };
  }

  if (hasBrand && hasSearch && hasCategory) {
    return { cache: false, reason: "high_cardinality_filters" };
  }

  return { cache: true, reason: "eligible" };
}

/**
 * Purpose: Evaluate promotion_rules rows against cart subtotal and category lines.
 */

/** @param {unknown} v */
function parseMinor(v) {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v));
  return Number.isFinite(n) && n >= 0 ? Math.trunc(n) : null;
}

/** @param {unknown} v */
function parseBps(v) {
  const n = parseMinor(v);
  if (n == null || n > 10000) return null;
  return n;
}

/**
 * True when the line category is the rule category or a descendant of it
 * (walk up parents via categoryParentById).
 * @param {string | null | undefined} lineCategoryId
 * @param {string | null | undefined} ruleCategoryId
 * @param {Map<string, string | null> | Record<string, string | null> | null | undefined} categoryParentById
 */
export function lineCategoryMatchesRule(lineCategoryId, ruleCategoryId, categoryParentById) {
  if (lineCategoryId == null || ruleCategoryId == null) return false;
  const lineId = String(lineCategoryId);
  const ruleId = String(ruleCategoryId);
  if (!lineId || !ruleId) return false;
  if (lineId === ruleId) return true;
  if (!categoryParentById) return false;
  const parentOf = (id) => {
    if (categoryParentById instanceof Map) return categoryParentById.get(id) ?? null;
    const v = categoryParentById[id];
    return v === undefined ? null : v;
  };
  let cur = lineId;
  const seen = new Set();
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    const parent = parentOf(cur);
    if (parent == null || parent === "") break;
    const parentId = String(parent);
    if (parentId === ruleId) return true;
    cur = parentId;
  }
  return false;
}

/**
 * @param {object} rule
 * @param {{
 *   subtotalMinor: number,
 *   lines: Array<{ lineTotalMinor: number, categoryId?: string | null }>,
 *   categoryParentById?: Map<string, string | null> | Record<string, string | null> | null
 * }} ctx
 * @returns {number}
 */
export function evaluateSinglePromotionRule(rule, ctx) {
  const kind = rule.rule_kind ?? rule.kind;
  const subtotal = Math.max(0, Math.trunc(ctx.subtotalMinor));

  const maxCap = parseMinor(rule.max_discount_minor);
  const cap = (discount) => {
    const d = Math.max(0, Math.trunc(discount));
    if (maxCap != null) return Math.min(d, maxCap);
    return d;
  };

  if (kind === "cart_percent_off") {
    const bps = parseBps(rule.percent_bps ?? rule.percentBps);
    if (bps == null) return 0;
    return cap(Math.round((subtotal * bps) / 10000));
  }

  if (kind === "cart_fixed_off") {
    const amt = parseMinor(rule.amount_minor ?? rule.amountMinor);
    if (amt == null) return 0;
    return cap(Math.min(amt, subtotal));
  }

  if (kind === "cart_percent_off_if_subtotal_above" || kind === "cart_fixed_off_if_subtotal_above") {
    const threshold = parseMinor(rule.min_subtotal_minor ?? rule.minSubtotalMinor);
    if (threshold != null && subtotal < threshold) return 0;
    if (kind === "cart_percent_off_if_subtotal_above") {
      const bps = parseBps(rule.percent_bps ?? rule.percentBps);
      if (bps == null) return 0;
      return cap(Math.round((subtotal * bps) / 10000));
    }
    const amt = parseMinor(rule.amount_minor ?? rule.amountMinor);
    if (amt == null) return 0;
    return cap(Math.min(amt, subtotal));
  }

  if (kind === "category_percent_off") {
    const catId = rule.global_category_id ?? rule.globalCategoryId;
    if (catId == null) return 0;
    const bps = parseBps(rule.percent_bps ?? rule.percentBps);
    if (bps == null) return 0;
    const parentById = ctx.categoryParentById ?? null;
    const catSub = ctx.lines
      .filter((l) => lineCategoryMatchesRule(l.categoryId, catId, parentById))
      .reduce((sum, l) => sum + Math.max(0, l.lineTotalMinor), 0);
    if (catSub <= 0) return 0;
    return cap(Math.round((catSub * bps) / 10000));
  }

  return 0;
}

/**
 * Shrink line totals so they add up to the payable cart (after an automatic
 * cart discount). Category percents then use that reduced base.
 * @param {Array<{ lineTotalMinor: number, categoryId?: string | null }>} lines
 * @param {number} payableSubtotal
 */
export function scaleLinesToPayable(lines, payableSubtotal) {
  const list = (Array.isArray(lines) ? lines : []).map((l) => ({
    ...l,
    lineTotalMinor: Math.max(0, Math.trunc(Number(l?.lineTotalMinor) || 0))
  }));
  const sum = list.reduce((s, l) => s + l.lineTotalMinor, 0);
  const target = Math.max(0, Math.trunc(Number(payableSubtotal) || 0));
  if (sum <= 0 || target >= sum) return list;
  let allocated = 0;
  return list.map((l, i) => {
    if (i === list.length - 1) {
      return { ...l, lineTotalMinor: Math.max(0, target - allocated) };
    }
    const next = Math.min(l.lineTotalMinor, Math.round((l.lineTotalMinor * target) / sum));
    allocated += next;
    return { ...l, lineTotalMinor: next };
  });
}

/**
 * @param {object[]} rules
 * @param {{ subtotalMinor: number, lines: Array<{ lineTotalMinor: number, categoryId?: string | null }> }} ctx
 */
export function evaluateCartPromotionRules(rules, ctx) {
  const list = Array.isArray(rules) ? rules : [];
  let total = 0;
  for (const rule of list) {
    if (!rule || typeof rule !== "object") continue;
    if (rule.is_deleted === true) continue;
    total += evaluateSinglePromotionRule(rule, ctx);
  }
  return Math.max(0, Math.trunc(total));
}

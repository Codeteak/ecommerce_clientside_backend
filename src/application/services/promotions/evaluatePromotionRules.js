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
 * @param {object} rule
 * @param {{ subtotalMinor: number, lines: Array<{ lineTotalMinor: number, categoryId?: string | null }> }} ctx
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
    const catSub = ctx.lines
      .filter((l) => l.categoryId != null && String(l.categoryId) === String(catId))
      .reduce((sum, l) => sum + Math.max(0, l.lineTotalMinor), 0);
    if (catSub <= 0) return 0;
    return cap(Math.round((catSub * bps) / 10000));
  }

  return 0;
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

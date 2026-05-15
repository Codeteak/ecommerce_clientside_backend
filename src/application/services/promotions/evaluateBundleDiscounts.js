/**
 * Purpose: Apply BXGY bundle rules to priced cart lines (after SKU promos).
 * Buy N get M: for each N units the customer pays for, M extra units are included free
 * (display quantity = paid + free; charge = paid units only).
 */

/**
 * @typedef {{
 *   productId: string,
 *   categoryId?: string | null,
 *   quantity: number,
 *   unitFinalMinor: number,
 *   lineTotalMinor: number,
 *   paidQuantity?: number,
 *   freeQuantity?: number,
 *   displayQuantity?: number,
 *   bundleDiscountMinor?: number,
 *   linePayableMinor?: number,
 *   appliedPromotionIds: string[]
 * }} PricedLine
 * @typedef {{
 *   promotion_id: string,
 *   priority?: number,
 *   created_at?: Date | string,
 *   scope: string,
 *   shop_product_id?: string,
 *   global_category_id?: string,
 *   buy_qty: number,
 *   get_qty: number,
 *   reward_type: string,
 *   reward_percent_bps?: number
 * }} BundleRuleRow
 */

/**
 * @param {PricedLine[]} lines
 * @param {BundleRuleRow[]} bundleRules
 * @param {{ allowCombineAutoCampaigns: boolean }} opts
 * @returns {{ bundleDiscountMinor: number, appliedByPromotion: Map<string, number> }}
 */
export function evaluateBundleDiscounts(lines, bundleRules, opts) {
  const rules = Array.isArray(bundleRules) ? bundleRules : [];
  if (!lines.length) {
    return { bundleDiscountMinor: 0, appliedByPromotion: new Map() };
  }

  for (const line of lines) {
    line.paidQuantity = Math.max(0, Math.trunc(line.quantity));
    line.freeQuantity = 0;
    line.displayQuantity = line.paidQuantity;
    line.bundleDiscountMinor = 0;
    line.linePayableMinor = line.lineTotalMinor;
  }

  if (!rules.length) {
    return { bundleDiscountMinor: 0, appliedByPromotion: new Map() };
  }

  const allowCombine = opts.allowCombineAutoCampaigns !== false;
  /** @type {BundleRuleRow[]} */
  let activeRules = rules;
  if (!allowCombine) {
    activeRules = pickOneBundleRulePerScope(lines, rules);
  }

  let totalDiscount = 0;
  /** @type {Map<string, number>} */
  const appliedByPromotion = new Map();

  for (const rule of activeRules) {
    const d = applyBundleRuleToLines(lines, rule);
    if (d <= 0) continue;
    totalDiscount += d;
    const pid = String(rule.promotion_id);
    appliedByPromotion.set(pid, (appliedByPromotion.get(pid) ?? 0) + d);
  }

  refreshLinePayableTotals(lines);

  return { bundleDiscountMinor: Math.max(0, Math.trunc(totalDiscount)), appliedByPromotion };
}

/**
 * @param {PricedLine[]} lines
 */
function refreshLinePayableTotals(lines) {
  for (const line of lines) {
    const paid = Math.max(0, line.paidQuantity ?? line.quantity);
    const free = Math.max(0, line.freeQuantity ?? 0);
    line.paidQuantity = paid;
    line.freeQuantity = free;
    line.displayQuantity = paid + free;
    line.linePayableMinor = Math.max(0, Math.round(paid * line.unitFinalMinor));
    line.bundleDiscountMinor = Math.max(0, Math.round(free * line.unitFinalMinor));
  }
}

/**
 * @param {PricedLine[]} lines
 * @param {BundleRuleRow[]} rules
 */
function pickOneBundleRulePerScope(lines, rules) {
  /** @type {Map<string, BundleRuleRow>} */
  const winners = new Map();
  for (const rule of rules) {
    const scopeKey = bundleScopeKey(rule);
    const existing = winners.get(scopeKey);
    if (!existing || compareBundleRulePriority(rule, existing) < 0) {
      winners.set(scopeKey, rule);
    }
  }
  return [...winners.values()];
}

/** @param {BundleRuleRow} rule */
function bundleScopeKey(rule) {
  if (rule.scope === "same_shop_product") return `p:${rule.shop_product_id}`;
  if (rule.scope === "global_category") return `c:${rule.global_category_id}`;
  return `x:${rule.promotion_id}`;
}

/**
 * @param {BundleRuleRow} a
 * @param {BundleRuleRow} b
 * @returns {number} negative if a wins
 */
function compareBundleRulePriority(a, b) {
  const pa = Number(a.priority);
  const pb = Number(b.priority);
  const na = Number.isFinite(pa) ? pa : 9999;
  const nb = Number.isFinite(pb) ? pb : 9999;
  if (na !== nb) return na - nb;
  const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
  const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
  return tb - ta;
}

/**
 * @param {PricedLine[]} lines
 * @param {BundleRuleRow} rule
 */
function matchingLines(lines, rule) {
  if (rule.scope === "same_shop_product") {
    const pid = String(rule.shop_product_id);
    return lines.filter((l) => String(l.productId) === pid);
  }
  if (rule.scope === "global_category") {
    const cid = String(rule.global_category_id);
    return lines.filter((l) => l.categoryId != null && String(l.categoryId) === cid);
  }
  return [];
}

/**
 * @param {PricedLine[]} lines
 * @param {BundleRuleRow} rule
 * @returns {number} discount minor for this rule
 */
function applyBundleRuleToLines(lines, rule) {
  const matched = matchingLines(lines, rule);
  if (!matched.length) return 0;

  const buyQty = Math.max(1, Math.trunc(Number(rule.buy_qty)));
  const getQty = Math.max(1, Math.trunc(Number(rule.get_qty)));
  const pid = String(rule.promotion_id);

  if (rule.scope === "same_shop_product") {
    let ruleDiscount = 0;
    for (const line of matched) {
      const paid = Math.max(0, line.paidQuantity ?? line.quantity);
      const freeQty = Math.floor(paid / buyQty) * getQty;
      if (freeQty <= 0) continue;
      const unitDiscount = discountForFreeUnits(line.unitFinalMinor, freeQty, rule);
      line.freeQuantity = (line.freeQuantity ?? 0) + freeQty;
      line.bundleDiscountMinor = (line.bundleDiscountMinor ?? 0) + unitDiscount;
      if (!line.appliedPromotionIds.includes(pid)) {
        line.appliedPromotionIds.push(pid);
      }
      ruleDiscount += unitDiscount;
    }
    return ruleDiscount;
  }

  const totalPaid = matched.reduce((s, l) => s + Math.max(0, l.paidQuantity ?? l.quantity), 0);
  const totalFree = Math.floor(totalPaid / buyQty) * getQty;
  if (totalFree <= 0) return 0;

  return allocateFreeUnitsAcrossLines(matched, totalFree, rule, pid);
}

/**
 * Distribute free units across category lines (cheapest units first).
 *
 * @param {PricedLine[]} matched
 * @param {number} totalFree
 * @param {BundleRuleRow} rule
 * @param {string} promotionId
 */
function allocateFreeUnitsAcrossLines(matched, totalFree, rule, promotionId) {
  /** @type {Array<{ line: PricedLine, unitPrice: number }>} */
  const slots = [];
  for (const line of matched) {
    const paid = Math.max(0, line.paidQuantity ?? line.quantity);
    for (let i = 0; i < paid; i += 1) {
      slots.push({ line, unitPrice: Math.max(0, Math.trunc(line.unitFinalMinor)) });
    }
  }
  slots.sort((a, b) => a.unitPrice - b.unitPrice);

  /** @type {Map<PricedLine, number>} */
  const freeByLine = new Map();
  let remaining = totalFree;
  for (const slot of slots) {
    if (remaining <= 0) break;
    freeByLine.set(slot.line, (freeByLine.get(slot.line) ?? 0) + 1);
    remaining -= 1;
  }

  let ruleDiscount = 0;
  for (const [line, freeQty] of freeByLine) {
    const unitDiscount = discountForFreeUnits(line.unitFinalMinor, freeQty, rule);
    line.freeQuantity = (line.freeQuantity ?? 0) + freeQty;
    line.bundleDiscountMinor = (line.bundleDiscountMinor ?? 0) + unitDiscount;
    if (!line.appliedPromotionIds.includes(promotionId)) {
      line.appliedPromotionIds.push(promotionId);
    }
    ruleDiscount += unitDiscount;
  }
  return ruleDiscount;
}

/**
 * @param {number} unitFinalMinor
 * @param {number} freeQty
 * @param {BundleRuleRow} rule
 */
function discountForFreeUnits(unitFinalMinor, freeQty, rule) {
  const unit = Math.max(0, Math.trunc(unitFinalMinor));
  const free = Math.max(0, Math.trunc(freeQty));
  const base = unit * free;
  if (rule.reward_type === "free") {
    return base;
  }
  if (rule.reward_type === "percent_off_reward") {
    const bps = Number(rule.reward_percent_bps);
    if (!Number.isFinite(bps) || bps <= 0) return 0;
    return Math.round((base * Math.min(10000, bps)) / 10000);
  }
  return 0;
}

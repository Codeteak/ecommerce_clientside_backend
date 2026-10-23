/**
 * Purpose: Apply automatic cart/category promotion_rules (no coupon) after BXGY.
 * Groups rules by promotion; respects allow_combine_auto_campaigns.
 */

import { evaluateCartPromotionRules } from "./evaluatePromotionRules.js";

/**
 * @param {Array<{
 *   promotion_id: string,
 *   priority?: number,
 *   created_at?: Date | string,
 *   rule_kind: string,
 *   percent_bps?: number | null,
 *   amount_minor?: string | number | null,
 *   min_subtotal_minor?: string | number | null,
 *   global_category_id?: string | null,
 *   max_discount_minor?: string | number | null
 * }>} ruleRows
 * @param {{
 *   subtotalMinor: number,
 *   lines: Array<{ lineTotalMinor: number, categoryId?: string | null }>
 * }} ctx
 * @param {{ allowCombineAutoCampaigns: boolean }} opts
 * @returns {{
 *   autoCartDiscountMinor: number,
 *   appliedByPromotion: Map<string, number>,
 *   appliedPromotionIds: string[]
 * }}
 */
export function evaluateAutoCartRules(ruleRows, ctx, opts) {
  const rows = Array.isArray(ruleRows) ? ruleRows : [];
  if (!rows.length || ctx.subtotalMinor <= 0) {
    return {
      autoCartDiscountMinor: 0,
      appliedByPromotion: new Map(),
      appliedPromotionIds: []
    };
  }

  /** @type {Map<string, { priority: number, createdAt: string, rules: object[] }>} */
  const byPromo = new Map();
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const pid = String(row.promotion_id ?? "");
    if (!pid) continue;
    let entry = byPromo.get(pid);
    if (!entry) {
      entry = {
        priority: Number(row.priority) || 100,
        createdAt: row.created_at != null ? String(row.created_at) : "",
        rules: []
      };
      byPromo.set(pid, entry);
    }
    entry.rules.push(row);
  }

  /** @type {Array<{ promotionId: string, priority: number, createdAt: string, discountMinor: number }>} */
  const scored = [];
  for (const [promotionId, entry] of byPromo) {
    const discountMinor = evaluateCartPromotionRules(entry.rules, ctx);
    if (discountMinor <= 0) continue;
    scored.push({
      promotionId,
      priority: entry.priority,
      createdAt: entry.createdAt,
      discountMinor
    });
  }

  if (!scored.length) {
    return {
      autoCartDiscountMinor: 0,
      appliedByPromotion: new Map(),
      appliedPromotionIds: []
    };
  }

  const allowCombine = opts.allowCombineAutoCampaigns !== false;
  /** @type {typeof scored} */
  let winners = scored;
  if (!allowCombine) {
    winners = [
      [...scored].sort((a, b) => {
        if (a.priority !== b.priority) return a.priority - b.priority;
        if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1;
        return 0;
      })[0]
    ].filter(Boolean);
  }

  /** @type {Map<string, number>} */
  const appliedByPromotion = new Map();
  let total = 0;
  const appliedPromotionIds = [];
  for (const w of winners) {
    total += w.discountMinor;
    appliedByPromotion.set(w.promotionId, w.discountMinor);
    appliedPromotionIds.push(w.promotionId);
  }

  const capped = Math.min(Math.max(0, Math.trunc(total)), Math.max(0, Math.trunc(ctx.subtotalMinor)));
  // When combined auto discounts exceed payable, scale each promo's share so
  // redemption / applied_offers totals match the capped cart discount.
  if (capped < total && total > 0) {
    let allocated = 0;
    for (let i = 0; i < winners.length; i++) {
      const pid = winners[i].promotionId;
      const raw = winners[i].discountMinor;
      if (i === winners.length - 1) {
        appliedByPromotion.set(pid, Math.max(0, capped - allocated));
      } else {
        const share = Math.floor((raw * capped) / total);
        appliedByPromotion.set(pid, share);
        allocated += share;
      }
    }
  }

  return {
    autoCartDiscountMinor: capped,
    appliedByPromotion,
    appliedPromotionIds
  };
}

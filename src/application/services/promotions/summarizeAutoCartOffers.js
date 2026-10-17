/**
 * Build customer-facing applied + suggested automatic cart/category offer rows.
 */

import { evaluateSinglePromotionRule } from "./evaluatePromotionRules.js";

/** @param {unknown} v */
function parseMinor(v) {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v));
  return Number.isFinite(n) && n >= 0 ? Math.trunc(n) : null;
}

/** @param {unknown} bps */
function percentLabel(bps) {
  const n = Number(bps);
  if (!Number.isFinite(n) || n <= 0) return null;
  const pct = n / 100;
  return Number.isInteger(pct) ? `${pct}%` : `${Math.round(pct * 10) / 10}%`;
}

/** @param {unknown} amountMinor */
function inrLabel(amountMinor) {
  const n = parseMinor(amountMinor);
  if (n == null || n <= 0) return null;
  return `₹${(n / 100).toLocaleString("en-IN")}`;
}

/**
 * @param {{
 *   rules: object[],
 *   ctx: { subtotalMinor: number, lines: Array<{ lineTotalMinor: number, categoryId?: string | null }> },
 *   appliedByPromotion?: Map<string, number> | null
 * }} input
 * @returns {{
 *   applied: Array<Record<string, unknown>>,
 *   suggested: Array<Record<string, unknown>>
 * }}
 */
export function summarizeAutoCartOffers(input) {
  const rules = Array.isArray(input?.rules) ? input.rules : [];
  const ctx = input?.ctx && typeof input.ctx === "object"
    ? input.ctx
    : { subtotalMinor: 0, lines: [] };
  const appliedByPromotion =
    input?.appliedByPromotion instanceof Map ? input.appliedByPromotion : new Map();

  /** @type {Map<string, Record<string, unknown>>} */
  const appliedByKey = new Map();
  /** @type {Map<string, Record<string, unknown>>} */
  const suggestedByKey = new Map();

  for (const rule of rules) {
    if (!rule || typeof rule !== "object" || rule.is_deleted === true) continue;
    const kind = String(rule.rule_kind ?? rule.kind ?? "");
    if (!kind) continue;
    const promotionId = String(rule.promotion_id ?? "");
    if (!promotionId) continue;

    const discountMinor = evaluateSinglePromotionRule(rule, ctx);
    const promoAppliedDiscount = Number(appliedByPromotion.get(promotionId) || 0);
    const isApplied = promoAppliedDiscount > 0 && discountMinor > 0;
    const promotionName =
      typeof rule.promotion_name === "string" && rule.promotion_name.trim()
        ? rule.promotion_name.trim()
        : null;
    const pct = percentLabel(rule.percent_bps ?? rule.percentBps);
    const amount = inrLabel(rule.amount_minor ?? rule.amountMinor);
    const categoryId =
      rule.global_category_id != null
        ? String(rule.global_category_id)
        : rule.globalCategoryId != null
          ? String(rule.globalCategoryId)
          : null;
    const categoryName =
      typeof rule.category_name === "string" && rule.category_name.trim()
        ? rule.category_name.trim()
        : typeof rule.categoryName === "string" && rule.categoryName.trim()
          ? rule.categoryName.trim()
          : null;

    if (kind === "category_percent_off") {
      if (!categoryId || !pct) continue;
      const catLabel = categoryName || "this category";
      const key = `category:${categoryId}`;
      if (isApplied) {
        const row = {
          kind,
          status: "applied",
          promotion_id: promotionId,
          promotion_name: promotionName,
          category_id: categoryId,
          category_name: categoryName,
          percent_bps: Number(rule.percent_bps ?? rule.percentBps) || 0,
          discount_minor: discountMinor,
          title: `${pct} off ${catLabel}`,
          message: `This ${pct} offer is for ${catLabel}. Add more from this category to save more.`
        };
        const prev = appliedByKey.get(key);
        if (!prev || Number(row.discount_minor) > Number(prev.discount_minor)) {
          appliedByKey.set(key, row);
        }
      } else {
        const row = {
          kind,
          status: "add_items",
          promotion_id: promotionId,
          promotion_name: promotionName,
          category_id: categoryId,
          category_name: categoryName,
          percent_bps: Number(rule.percent_bps ?? rule.percentBps) || 0,
          discount_minor: 0,
          title: `${pct} off ${catLabel}`,
          message: `Add items from ${catLabel} to get ${pct} off automatically.`
        };
        const prev = suggestedByKey.get(key);
        if (!prev || Number(row.percent_bps) > Number(prev.percent_bps)) {
          suggestedByKey.set(key, row);
        }
      }
      continue;
    }

    if (
      kind === "cart_percent_off_if_subtotal_above" ||
      kind === "cart_fixed_off_if_subtotal_above"
    ) {
      const threshold = parseMinor(rule.min_subtotal_minor ?? rule.minSubtotalMinor);
      const subtotal = Math.max(0, Math.trunc(Number(ctx.subtotalMinor) || 0));
      const benefit = pct ? `${pct} off` : amount ? `${amount} off` : "a cart discount";
      if (isApplied) {
        const key = `cart_threshold_applied:${promotionId}`;
        appliedByKey.set(key, {
          kind,
          status: "applied",
          promotion_id: promotionId,
          promotion_name: promotionName,
          category_id: null,
          category_name: null,
          percent_bps: Number(rule.percent_bps ?? rule.percentBps) || null,
          amount_minor: parseMinor(rule.amount_minor ?? rule.amountMinor),
          min_subtotal_minor: threshold,
          discount_minor: discountMinor,
          title: promotionName || `Automatic ${benefit}`,
          message: `Automatic cart offer applied — ${benefit}. No coupon code needed.`
        });
      } else if (threshold != null && subtotal < threshold) {
        const remaining = threshold - subtotal;
        const key = `cart_threshold:${promotionId}`;
        suggestedByKey.set(key, {
          kind,
          status: "min_subtotal",
          promotion_id: promotionId,
          promotion_name: promotionName,
          category_id: null,
          category_name: null,
          percent_bps: Number(rule.percent_bps ?? rule.percentBps) || null,
          amount_minor: parseMinor(rule.amount_minor ?? rule.amountMinor),
          min_subtotal_minor: threshold,
          remaining_minor: remaining,
          discount_minor: 0,
          title: promotionName || `Unlock ${benefit}`,
          message: `Add ${inrLabel(remaining) || "more"} more to unlock ${benefit} automatically.`
        });
      }
      continue;
    }

    if ((kind === "cart_percent_off" || kind === "cart_fixed_off") && isApplied) {
      const benefit = pct ? `${pct} off` : amount ? `${amount} off` : "cart discount";
      const key = `cart:${promotionId}`;
      appliedByKey.set(key, {
        kind,
        status: "applied",
        promotion_id: promotionId,
        promotion_name: promotionName,
        category_id: null,
        category_name: null,
        percent_bps: Number(rule.percent_bps ?? rule.percentBps) || null,
        amount_minor: parseMinor(rule.amount_minor ?? rule.amountMinor),
        discount_minor: discountMinor,
        title: promotionName || `Automatic ${benefit}`,
        message: `Automatic cart offer applied — ${benefit}. No coupon code needed.`
      });
    }
  }

  // Don't suggest a category offer that is already applied.
  for (const key of appliedByKey.keys()) {
    if (key.startsWith("category:")) suggestedByKey.delete(key);
  }

  return {
    applied: [...appliedByKey.values()],
    suggested: [...suggestedByKey.values()].slice(0, 6)
  };
}

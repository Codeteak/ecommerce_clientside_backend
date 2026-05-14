import { describe, it, expect } from "vitest";
import {
  baselineUnitMinorFromCatalog,
  buildStorefrontListingUnitPriceMap,
  compareAtUnitMinor,
  computeStorefrontUnitPricing,
  parseMinor,
  pickWinningPromoOverlay,
  resolveListingOverlapMode,
  withStorefrontProductPricing,
  withStorefrontDetailPricing
} from "../../src/application/services/promotions/resolveStorefrontSkuUnitPrices.js";

describe("resolveStorefrontSkuUnitPrices", () => {
  it("parseMinor handles strings and rejects negatives", () => {
    expect(parseMinor("100")).toBe(100);
    expect(parseMinor("-1")).toBeNull();
    expect(parseMinor(null)).toBeNull();
  });

  it("baselineUnitMinorFromCatalog prefers offer when below list", () => {
    expect(baselineUnitMinorFromCatalog("100", "90")).toBe(90);
    expect(baselineUnitMinorFromCatalog("100", "100")).toBe(100);
    expect(baselineUnitMinorFromCatalog("100", "110")).toBe(100);
  });

  it("pickWinningPromoOverlay priority uses ascending priority", () => {
    const a = {
      shop_product_id: "s1",
      promotion_id: "p-a",
      promo_price_minor_per_unit: "80",
      priority: 10,
      overlap_mode: null,
      ends_at: null
    };
    const b = {
      shop_product_id: "s1",
      promotion_id: "p-b",
      promo_price_minor_per_unit: "70",
      priority: 5,
      overlap_mode: null,
      ends_at: null
    };
    const w = pickWinningPromoOverlay([a, b], "priority");
    expect(w.promotion_id).toBe("p-b");
  });

  it("buildStorefrontListingUnitPriceMap with no overlays yields null promo for every SKU (normal catalog)", () => {
    const products = [
      { id: "a", price_minor_per_unit: "100", offer_price_minor_per_unit: "90" },
      { id: "b", price_minor_per_unit: "200", offer_price_minor_per_unit: null }
    ];
    const map = buildStorefrontListingUnitPriceMap({
      promotionsPaused: false,
      defaultOverlapMode: "priority",
      products,
      overlays: []
    });
    expect(map.get("a").promoPriceMinor).toBeNull();
    expect(map.get("b").promoPriceMinor).toBeNull();
  });

  it("buildStorefrontListingUnitPriceMap sets promoPriceMinor when overlay wins", () => {
    const products = [{ id: "sp1", price_minor_per_unit: "100", offer_price_minor_per_unit: "90" }];
    const overlays = [
      {
        shop_product_id: "sp1",
        promotion_id: "pr1",
        promo_price_minor_per_unit: "50",
        priority: 1,
        overlap_mode: null,
        ends_at: new Date("2026-12-31T00:00:00.000Z")
      }
    ];
    const mapOn = buildStorefrontListingUnitPriceMap({
      promotionsPaused: false,
      defaultOverlapMode: "priority",
      products,
      overlays
    });
    expect(mapOn.get("sp1").promoPriceMinor).toBe(50);

    const mapOff = buildStorefrontListingUnitPriceMap({
      promotionsPaused: true,
      defaultOverlapMode: "priority",
      products,
      overlays
    });
    expect(mapOff.get("sp1").promoPriceMinor).toBeNull();
  });

  it("computeStorefrontUnitPricing: no promo uses baseline and splits offer vs promo discount", () => {
    const noPromo = computeStorefrontUnitPricing("100", "90", null);
    expect(noPromo.finalMinor).toBe(90);
    expect(noPromo.compareAtMinor).toBe(100);
    expect(noPromo.offerDiscountMinor).toBe(10);
    expect(noPromo.promoDiscountMinor).toBe(0);
    expect(noPromo.totalDiscountMinor).toBe(10);

    const withPromo = computeStorefrontUnitPricing("100", "90", 50);
    expect(withPromo.finalMinor).toBe(50);
    expect(withPromo.offerDiscountMinor).toBe(10);
    expect(withPromo.promoDiscountMinor).toBe(40);
    expect(withPromo.totalDiscountMinor).toBe(50);
  });

  it("computeStorefrontUnitPricing: no catalog offer, promo only", () => {
    const p = computeStorefrontUnitPricing("100", null, 75);
    expect(p.baselineMinor).toBe(100);
    expect(p.finalMinor).toBe(75);
    expect(p.offerDiscountMinor).toBe(0);
    expect(p.promoDiscountMinor).toBe(25);
    expect(p.totalDiscountMinor).toBe(25);
  });

  it("withStorefrontProductPricing exposes pricing fields and strips legacy keys", () => {
    const base = {
      id: "x",
      name: "N",
      price_minor_per_unit: "100",
      offer_price_minor_per_unit: "90"
    };
    const row = { id: "x", price_minor_per_unit: "100", offer_price_minor_per_unit: "90" };
    const priced = withStorefrontProductPricing(base, row, 55);
    expect(priced).not.toHaveProperty("price_minor_per_unit");
    expect(priced).toMatchObject({
      actual_price_minor: "100",
      offer_price_minor: "90",
      promo_price_minor: "55",
      total_price_minor: "100",
      final_price_minor: "55",
      offer_discount_minor: "10",
      promo_discount_minor: "35",
      total_discount_minor: "45"
    });
  });

  it("withStorefrontProductPricing null offer and null promo", () => {
    const base = { id: "x", name: "N", price_minor_per_unit: "4500", offer_price_minor_per_unit: null };
    const row = { id: "x", price_minor_per_unit: "4500", offer_price_minor_per_unit: null };
    const priced = withStorefrontProductPricing(base, row, null);
    expect(priced).toMatchObject({
      actual_price_minor: "4500",
      offer_price_minor: null,
      promo_price_minor: null,
      total_price_minor: "4500",
      final_price_minor: "4500",
      offer_discount_minor: "0",
      promo_discount_minor: "0",
      total_discount_minor: "0"
    });
  });

  it("withStorefrontDetailPricing matches list semantics", () => {
    const out = withStorefrontDetailPricing(
      { id: "1", name: "A", images: [] },
      { price_minor_per_unit: "7200", offer_price_minor_per_unit: "6900" },
      5900
    );
    expect(out).toMatchObject({
      actual_price_minor: "7200",
      offer_price_minor: "6900",
      promo_price_minor: "5900",
      total_price_minor: "7200",
      final_price_minor: "5900",
      offer_discount_minor: "300",
      promo_discount_minor: "1000",
      total_discount_minor: "1300"
    });
  });

  it("compareAtUnitMinor is at least list and baseline", () => {
    expect(compareAtUnitMinor("100", 90)).toBe(100);
    expect(compareAtUnitMinor("80", 90)).toBe(90);
  });

  it("resolveListingOverlapMode falls back to shop default when modes disagree", () => {
    const cands = [
      {
        shop_product_id: "s",
        promotion_id: "a",
        promo_price_minor_per_unit: "1",
        priority: 1,
        overlap_mode: "priority"
      },
      {
        shop_product_id: "s",
        promotion_id: "b",
        promo_price_minor_per_unit: "2",
        priority: 2,
        overlap_mode: "best_for_customer"
      }
    ];
    expect(resolveListingOverlapMode(cands, "priority")).toBe("priority");
  });
});

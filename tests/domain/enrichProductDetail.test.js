import { describe, it, expect, vi, beforeEach } from "vitest";
import { createStorefrontListingPromotions } from "../../src/application/services/storefront/storefrontListingPromotions.js";

vi.mock("../../src/infra/logging/requestContext.js", () => ({
  getRequestLogger: () => ({
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  })
}));

const shopId = "00000000-0000-4000-8000-000000000001";
const productId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const categoryId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

function detailData(overrides = {}) {
  return {
    product: {
      id: productId,
      name: "Amul Ghee 1L",
      slug: "amul-ghee-1l",
      description: null,
      base_unit: "pcs",
      unit_size: "1",
      availability: "in_stock",
      category_id: categoryId,
      price_minor_per_unit: 50000,
      offer_price_minor_per_unit: null,
      global_image_url: null,
      ...overrides
    },
    gallery: []
  };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("enrichProductDetail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("runs overlay and bundle reads in parallel after settings", async () => {
    const overlaysGate = deferred();
    const bundlesGate = deferred();
    let overlaysStarted = false;
    let bundlesStarted = false;

    const promotionRepo = {
      getShopPromotionSettings: vi.fn().mockResolvedValue({
        promotions_paused: false,
        default_overlap_mode: "priority"
      }),
      listActivePromotionProductOverlaysForShopProducts: vi.fn(async () => {
        overlaysStarted = true;
        return overlaysGate.promise;
      }),
      listActiveBundleRulesForProduct: vi.fn(async () => {
        bundlesStarted = true;
        return bundlesGate.promise;
      })
    };

    const { enrichProductDetail } = createStorefrontListingPromotions({
      promotionRepo
    });

    const pending = enrichProductDetail({}, shopId, detailData());

    // Both promo reads must be in flight before either settles.
    await vi.waitFor(() => {
      expect(overlaysStarted).toBe(true);
      expect(bundlesStarted).toBe(true);
    });

    overlaysGate.resolve([]);
    bundlesGate.resolve([
      {
        promotion_id: "promo-bundle",
        scope: "same_shop_product",
        shop_product_id: productId,
        global_category_id: null,
        buy_qty: 2,
        get_qty: 1,
        reward_type: "free",
        reward_percent_bps: null,
        ends_at: null
      }
    ]);

    const out = await pending;

    expect(promotionRepo.getShopPromotionSettings).toHaveBeenCalledWith({}, shopId);
    expect(promotionRepo.listActivePromotionProductOverlaysForShopProducts).toHaveBeenCalledWith(
      {},
      shopId,
      [productId]
    );
    expect(promotionRepo.listActiveBundleRulesForProduct).toHaveBeenCalledWith(
      {},
      shopId,
      productId,
      categoryId
    );
    expect(out.id).toBe(productId);
    expect(out.bundle_rules).toHaveLength(1);
    expect(out.bundle_rules[0]).toMatchObject({
      promotion_id: "promo-bundle",
      buy_qty: 2,
      get_qty: 1
    });
    expect(out.final_price_minor).toBeDefined();
  });

  it("skips overlay and bundle reads when promotions are paused", async () => {
    const promotionRepo = {
      getShopPromotionSettings: vi.fn().mockResolvedValue({
        promotions_paused: true,
        default_overlap_mode: "priority"
      }),
      listActivePromotionProductOverlaysForShopProducts: vi.fn(),
      listActiveBundleRulesForProduct: vi.fn()
    };

    const { enrichProductDetail } = createStorefrontListingPromotions({
      promotionRepo
    });

    const out = await enrichProductDetail({}, shopId, detailData());

    expect(promotionRepo.listActivePromotionProductOverlaysForShopProducts).not.toHaveBeenCalled();
    expect(promotionRepo.listActiveBundleRulesForProduct).not.toHaveBeenCalled();
    expect(out.bundle_rules).toEqual([]);
    expect(out.final_price_minor).toBe("50000");
  });

  it("falls back to catalog-only prices when promo reads fail", async () => {
    const promotionRepo = {
      getShopPromotionSettings: vi.fn().mockRejectedValue(new Error("db down")),
      listActivePromotionProductOverlaysForShopProducts: vi.fn(),
      listActiveBundleRulesForProduct: vi.fn()
    };

    const { enrichProductDetail } = createStorefrontListingPromotions({
      promotionRepo
    });

    const out = await enrichProductDetail({}, shopId, detailData());

    expect(out.bundle_rules).toEqual([]);
    expect(out.final_price_minor).toBe("50000");
    expect(promotionRepo.listActivePromotionProductOverlaysForShopProducts).not.toHaveBeenCalled();
  });

  it("returns empty bundles when no promo reader is configured", async () => {
    const { enrichProductDetail } = createStorefrontListingPromotions({});

    const out = await enrichProductDetail({}, shopId, detailData());

    expect(out.bundle_rules).toEqual([]);
    expect(out.id).toBe(productId);
    expect(out.slug).toBe("amul-ghee-1l");
  });

  it("attaches promo_price_minor from overlays", async () => {
    const promotionRepo = {
      getShopPromotionSettings: vi.fn().mockResolvedValue({
        promotions_paused: false,
        default_overlap_mode: "priority"
      }),
      listActivePromotionProductOverlaysForShopProducts: vi.fn().mockResolvedValue([
        {
          shop_product_id: productId,
          promotion_id: "promo-sku",
          promo_price_minor_per_unit: "40000",
          priority: 1,
          overlap_mode: null
        }
      ]),
      listActiveBundleRulesForProduct: vi.fn().mockResolvedValue([])
    };

    const { enrichProductDetail } = createStorefrontListingPromotions({
      promotionRepo
    });

    const out = await enrichProductDetail({}, shopId, detailData());

    expect(out.promo_price_minor).toBe("40000");
    expect(out.final_price_minor).toBe("40000");
    expect(out.bundle_rules).toEqual([]);
  });
});

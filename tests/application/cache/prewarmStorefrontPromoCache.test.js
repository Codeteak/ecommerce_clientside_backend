import { afterEach, describe, expect, it, vi } from "vitest";
import {
  _clearPromoPrewarmScheduleForTests,
  createPrewarmStorefrontPromoCache,
  scheduleBackgroundPromoPrewarm
} from "../../../src/application/services/cache/prewarmStorefrontPromoCache.js";

const shopId = "00000000-0000-4000-8000-000000000001";

describe("prewarmStorefrontPromoCache", () => {
  afterEach(() => {
    _clearPromoPrewarmScheduleForTests();
  });

  it("warms categories and home sections without product lists", async () => {
    const storefrontCatalog = {
      listCategories: vi.fn().mockResolvedValue({ categories: [] }),
      listHomeSections: vi.fn().mockResolvedValue({ data: { sections: [] } }),
      listProducts: vi.fn()
    };
    const prewarm = createPrewarmStorefrontPromoCache({ storefrontCatalog });
    const result = await prewarm(shopId);

    expect(storefrontCatalog.listCategories).toHaveBeenCalledWith(shopId, { all: true });
    expect(storefrontCatalog.listCategories).toHaveBeenCalledWith(shopId, {});
    expect(storefrontCatalog.listHomeSections).toHaveBeenCalledWith(shopId);
    expect(storefrontCatalog.listProducts).not.toHaveBeenCalled();
    expect(result.scope).toBe("promotions");
    expect(result.failed).toBe(0);
    expect(result.warmed).toBe(3);
  });

  it("coalesces bursty background schedules into one warm", async () => {
    vi.useFakeTimers();
    const prewarmFn = vi.fn().mockResolvedValue({ warmed: 1 });
    scheduleBackgroundPromoPrewarm(prewarmFn, shopId, {}, { delayMs: 400 });
    scheduleBackgroundPromoPrewarm(prewarmFn, shopId, {}, { delayMs: 400 });
    scheduleBackgroundPromoPrewarm(prewarmFn, shopId, {}, { delayMs: 400 });
    expect(prewarmFn).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(400);
    expect(prewarmFn).toHaveBeenCalledTimes(1);
    expect(prewarmFn).toHaveBeenCalledWith(shopId, {});
    vi.useRealTimers();
  });
});

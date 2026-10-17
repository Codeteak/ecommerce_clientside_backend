/**
 * Lightweight promo-scope cache warm for a shop.
 * Refills categories (with offer signals) + home sections without rebuilding
 * every product list (those stay on catalogGen).
 *
 * @param {{ storefrontCatalog: ReturnType<import("../storefront/storefrontCatalog.js").createStorefrontCatalog> }} deps
 */
export function createPrewarmStorefrontPromoCache({ storefrontCatalog }) {
  /**
   * @param {string} shopId
   * @param {{ topCategoryLimit?: number }} [opts]
   */
  return async function prewarmStorefrontPromoCache(shopId, opts = {}) {
    void opts;
    /** @type {Array<{ step: string, ok: boolean, error?: string }>} */
    const steps = [];

    async function runStep(step, fn) {
      try {
        await fn();
        steps.push({ step, ok: true });
      } catch (err) {
        steps.push({
          step,
          ok: false,
          error: err instanceof Error ? err.message : String(err)
        });
      }
    }

    // Parallel: categories (offer signals) + home shelves — main promo-facing surfaces.
    await Promise.all([
      runStep("categories:all", () => storefrontCatalog.listCategories(shopId, { all: true })),
      runStep("categories:root", () => storefrontCatalog.listCategories(shopId, {})),
      typeof storefrontCatalog.listHomeSections === "function"
        ? runStep("home-sections", () => storefrontCatalog.listHomeSections(shopId))
        : Promise.resolve()
    ]);

    const warmed = steps.filter((s) => s.ok).length;
    const failed = steps.filter((s) => !s.ok).length;

    return {
      shopId,
      scope: "promotions",
      warmed,
      failed,
      steps
    };
  };
}

/** @type {Map<string, ReturnType<typeof setTimeout>>} */
const pendingByShop = new Map();

/**
 * Coalesce bursty promo invalidates (activate + rules + home section) into one warm.
 *
 * @param {(shopId: string, opts?: object) => Promise<unknown>} prewarmFn
 * @param {string} shopId
 * @param {object} [opts]
 * @param {{ delayMs?: number, onError?: (err: unknown, shopId: string) => void }} [scheduleOpts]
 */
export function scheduleBackgroundPromoPrewarm(
  prewarmFn,
  shopId,
  opts = {},
  scheduleOpts = {}
) {
  const id = String(shopId || "").trim();
  if (!id || typeof prewarmFn !== "function") return;
  const delayMs = Math.max(0, Number(scheduleOpts.delayMs) || 400);
  const prev = pendingByShop.get(id);
  if (prev) clearTimeout(prev);

  const timer = setTimeout(() => {
    pendingByShop.delete(id);
    void Promise.resolve(prewarmFn(id, opts)).catch((err) => {
      if (typeof scheduleOpts.onError === "function") {
        scheduleOpts.onError(err, id);
      }
    });
  }, delayMs);

  pendingByShop.set(id, timer);
}

/** @internal test helper */
export function _clearPromoPrewarmScheduleForTests() {
  for (const t of pendingByShop.values()) clearTimeout(t);
  pendingByShop.clear();
}

/**
 * Best-effort catalog cache pre-warm for a shop (public catalog reads only).
 *
 * @param {{ storefrontCatalog: ReturnType<import("../storefront/storefrontCatalog.js").createStorefrontCatalog> }} deps
 */
export function createPrewarmStorefrontCache({ storefrontCatalog }) {
  const defaultProductListOpts = {
    limit: 50,
    sortBy: "created_at",
    sortOrder: "desc"
  };

  /**
   * @param {string} shopId
   * @param {{ topCategoryLimit?: number }} [opts]
   */
  return async function prewarmStorefrontCache(shopId, opts = {}) {
    const topLimit = Math.min(Math.max(Number(opts.topCategoryLimit) || 5, 1), 20);
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

    await runStep("categories:all", () => storefrontCatalog.listCategories(shopId, { all: true }));
    const rootCategories = await (async () => {
      try {
        return await storefrontCatalog.listCategories(shopId, {});
      } catch {
        return [];
      }
    })();

    await runStep("categories:root", async () => {
      if (!Array.isArray(rootCategories)) {
        throw new Error("root categories unavailable");
      }
    });

    await runStep("products:default", () =>
      storefrontCatalog.listProducts(shopId, defaultProductListOpts)
    );

    const categoryIds = pickTopCategoryIds(rootCategories, topLimit);
    for (const categoryId of categoryIds) {
      const step = `products:category:${categoryId}`;
      await runStep(step, () =>
        storefrontCatalog.listProducts(shopId, {
          ...defaultProductListOpts,
          categoryId
        })
      );
    }

    const warmed = steps.filter((s) => s.ok).length;
    const failed = steps.filter((s) => !s.ok).length;

    return {
      shopId,
      warmed,
      failed,
      topCategoryLimit: topLimit,
      categoryIdsWarmed: categoryIds,
      steps
    };
  };
}

/**
 * @param {unknown} categories
 * @param {number} limit
 * @returns {string[]}
 */
function pickTopCategoryIds(categories, limit) {
  if (!Array.isArray(categories)) return [];
  const ids = [];
  for (const row of categories) {
    if (row && row.id != null) {
      ids.push(String(row.id));
    }
    if (ids.length >= limit) break;
  }
  return ids;
}

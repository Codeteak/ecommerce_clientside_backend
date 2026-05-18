import { vi } from "vitest";
import { createStorefrontListingPromotions } from "../../src/application/services/storefront/storefrontListingPromotions.js";

/** Default promotion + DB client deps for storefront catalog unit tests. */
export function storefrontCatalogTestDeps(overrides = {}) {
  return {
    runWithClient: vi.fn(async (fn) => fn({})),
    listingPromotions: createStorefrontListingPromotions({ promotionRepo: null }),
    ...overrides
  };
}

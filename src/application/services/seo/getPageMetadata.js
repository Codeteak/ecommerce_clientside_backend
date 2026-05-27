import { AppError } from "../../../domain/errors/AppError.js";
import { toPublicMediaUrl } from "../../../infra/media/publicMediaUrl.js";
import { buildShopSeoBlock } from "./buildShopSeoBlock.js";
import { buildProductSeoBlock } from "./buildProductSeoBlock.js";
import { shopBrandingMediaUrls } from "./shopBrandingMediaUrls.js";

/**
 * @param {bigint | string | number} minorStr
 * @returns {number}
 */
function minorToAmount(minorStr) {
  const n = Number(minorStr);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n) / 100;
}

/**
 * @param {{
 *   shopLookupRepo: import("../../ports/repositories/ShopLookupRepo.js").ShopLookupRepo,
 *   catalogRepo: import("../../ports/repositories/CatalogRepo.js").CatalogRepo
 * }} deps
 */
export function createGetPageMetadata({ shopLookupRepo, catalogRepo }) {
  /**
   * @param {string} shopId
   * @param {"shop" | "product"} pageType
   * @param {string | undefined} slug
   */
  return async function getPageMetadata(shopId, pageType, slug) {
    const id = String(shopId || "").trim();
    if (!id) {
      throw new AppError("Shop not found.", { statusCode: 404, code: "SHOP_NOT_FOUND" });
    }

    const shopRow = await shopLookupRepo.findShopBrandingById(id);
    if (!shopRow) {
      throw new AppError("Shop not found.", { statusCode: 404, code: "SHOP_NOT_FOUND" });
    }

    const { shopImageUrl, bannerImageUrls } = shopBrandingMediaUrls(shopRow);

    if (pageType === "shop") {
      const seo = buildShopSeoBlock(shopRow, { shopImageUrl, bannerImageUrls });
      return {
        pageType: "shop",
        shopId: shopRow.id,
        shopName: shopRow.name,
        seo
      };
    }

    const productSlug = String(slug || "").trim();
    if (!productSlug) {
      throw new AppError("Product slug is required.", {
        statusCode: 400,
        code: "VALIDATION_ERROR"
      });
    }

    const seoRow = await catalogRepo.getProductSeoBySlugStorefront(id, productSlug);
    if (!seoRow?.product) {
      throw new AppError("Product not found.", { statusCode: 404, code: "PRODUCT_NOT_FOUND" });
    }

    const { product, primary_image_storage_key } = seoRow;
    const primaryKey =
      primary_image_storage_key != null ? String(primary_image_storage_key).trim() : "";
    const productImageUrl = primaryKey.length > 0 ? toPublicMediaUrl(primaryKey) : null;

    const offerMinor = Number(product.offer_price_minor_per_unit);
    const listMinor = Number(product.price_minor_per_unit);
    const minor = Number.isFinite(offerMinor) && offerMinor > 0 ? offerMinor : listMinor;

    const seo = buildProductSeoBlock(product, shopRow, { productImageUrl, shopImageUrl });

    return {
      pageType: "product",
      productId: product.id,
      slug: product.slug,
      availability: product.availability,
      price: {
        amount: minorToAmount(minor),
        currency: "INR"
      },
      seo
    };
  };
}

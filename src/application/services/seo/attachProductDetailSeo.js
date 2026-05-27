import { buildProductSeoBlock } from "./buildProductSeoBlock.js";
import { shopBrandingMediaUrls } from "./shopBrandingMediaUrls.js";

/**
 * @param {string} shopId
 * @param {{ product: Record<string, unknown> }} data
 * @param {{ name: string, slug: string, description?: string | null, images?: { url?: string | null }[] }} detail
 * @param {{ findShopBrandingById?: (id: string) => Promise<Record<string, unknown> | null> }} shopLookupRepo
 */
export async function attachProductDetailSeo(shopId, data, detail, shopLookupRepo) {
  const shopRow =
    shopLookupRepo && typeof shopLookupRepo.findShopBrandingById === "function"
      ? await shopLookupRepo.findShopBrandingById(shopId)
      : null;

  const shopForSeo = shopRow ?? { name: "Shop" };
  const { shopImageUrl } = shopBrandingMediaUrls(shopForSeo);
  const productImageUrl =
    Array.isArray(detail.images) && detail.images[0]?.url ? detail.images[0].url : null;

  const product = {
    ...data.product,
    name: detail.name,
    slug: detail.slug,
    description: detail.description
  };

  const seo = buildProductSeoBlock(product, shopForSeo, { productImageUrl, shopImageUrl });
  return { ...detail, seo };
}

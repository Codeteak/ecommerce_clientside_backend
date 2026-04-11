import { requireShopId } from "../../../application/services/catalog/catalogShopId.js";
import { ValidationError } from "../../../domain/errors/ValidationError.js";
import { NotFoundError } from "../../../domain/errors/NotFoundError.js";

/**
 * Purpose: This file handles storefront catalog HTTP requests.
 * It reads request input, calls storefront catalog services,
 * and sends JSON responses or forwards errors to middleware.
 */
function shopIdForStorefront(req) {
  try {
    return requireShopId(req.shopId);
  } catch {
    throw new ValidationError("shopId is required (x-shop-id header or host resolution)");
  }
}

function setCatalogHttpCache(ctx, res) {
  const n = ctx.storefrontCatalogHttpCacheSec;
  if (typeof n === "number" && n > 0) {
    res.setHeader("Cache-Control", `public, max-age=${n}, s-maxage=${n}`);
  }
}

function listCategoriesHandler(ctx) {
  return async (req, res, next) => {
    try {
      const shopId = shopIdForStorefront(req);
      const parentId = req.query.parent_id ?? undefined;
      const categories = await ctx.storefrontCatalog.listCategories(shopId, { parentId });
      setCatalogHttpCache(ctx, res);
      res.json({ categories });
    } catch (err) {
      next(err);
    }
  };
}

function listProductsHandler(ctx) {
  return async (req, res, next) => {
    try {
      const shopId = shopIdForStorefront(req);
      const result = await ctx.storefrontCatalog.listProducts(shopId, {
        categoryId: req.query.category_id,
        brandId: req.query.brand_id,
        search: req.query.search,
        limit: req.query.limit,
        cursor: req.query.cursor,
        availability: req.query.availability,
        minPriceMinor: req.query.min_price_minor,
        maxPriceMinor: req.query.max_price_minor,
        sortBy: req.query.sort_by,
        sortOrder: req.query.sort_order
      });
      setCatalogHttpCache(ctx, res);
      res.json(result);
    } catch (err) {
      next(err);
    }
  };
}

function getProductBySlugHandler(ctx) {
  return async (req, res, next) => {
    try {
      const shopId = shopIdForStorefront(req);
      const { slug } = req.params;
      const product = await ctx.storefrontCatalog.getProductBySlug(shopId, slug);
      if (!product) {
        throw new NotFoundError("Product not found");
      }
      setCatalogHttpCache(ctx, res);
      res.json(product);
    } catch (err) {
      next(err);
    }
  };
}

export const storefrontCatalogController = {
  listCategories: (ctx) => listCategoriesHandler(ctx),
  listProducts: (ctx) => listProductsHandler(ctx),
  getProductBySlug: (ctx) => getProductBySlugHandler(ctx),

  forCtx(ctx) {
    return {
      listCategories: listCategoriesHandler(ctx),
      listProducts: listProductsHandler(ctx),
      getProductBySlug: getProductBySlugHandler(ctx)
    };
  }
};

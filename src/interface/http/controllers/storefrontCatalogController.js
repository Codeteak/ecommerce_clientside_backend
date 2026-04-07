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
    throw new ValidationError("shopId is required (query, x-shop-id header, or host resolution)");
  }
}

export const storefrontCatalogController = {
  listCategories: (ctx) => async (req, res, next) => {
    try {
      const shopId = shopIdForStorefront(req);
      const parentId = req.query.parent_id ?? undefined;
      const categories = await ctx.storefrontCatalog.listCategories(shopId, { parentId });
      res.json({ categories });
    } catch (err) {
      next(err);
    }
  },

  listProducts: (ctx) => async (req, res, next) => {
    try {
      const shopId = shopIdForStorefront(req);
      const result = await ctx.storefrontCatalog.listProducts(shopId, {
        categoryId: req.query.category_id,
        search: req.query.search,
        limit: req.query.limit,
        cursor: req.query.cursor,
        availability: req.query.availability
      });
      res.json(result);
    } catch (err) {
      next(err);
    }
  },

  getProductBySlug: (ctx) => async (req, res, next) => {
    try {
      const shopId = shopIdForStorefront(req);
      const { slug } = req.params;
      const product = await ctx.storefrontCatalog.getProductBySlug(shopId, slug);
      if (!product) {
        throw new NotFoundError("Product not found");
      }
      res.json(product);
    } catch (err) {
      next(err);
    }
  }
};

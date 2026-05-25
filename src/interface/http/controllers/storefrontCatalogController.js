import { requireShopId } from "../../../application/services/catalog/catalogShopId.js";
import { ValidationError } from "../../../domain/errors/ValidationError.js";
import { NotFoundError } from "../../../domain/errors/NotFoundError.js";
import { asyncHandler } from "../asyncHandler.js";

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
  return asyncHandler(async (req, res) => {
    if (!req.shopId) {
      res.json({});
      return;
    }
    const shopId = shopIdForStorefront(req);
    const parentId = req.query.parent_id ?? undefined;
    const result = await ctx.storefrontCatalog.listCategories(shopId, {
      parentId,
      all: req.query.all === true
    });
    setCatalogHttpCache(ctx, res);
    const categories = Array.isArray(result?.categories) ? result.categories : [];
    if (!categories.length) {
      res.json({
        shop_name: result?.shop_name ?? null,
        shop_image: result?.shop_image ?? null,
        categories: []
      });
      return;
    }
    res.json(result);
  });
}

function listProductsHandler(ctx) {
  return asyncHandler(async (req, res) => {
    if (!req.shopId) {
      res.json({});
      return;
    }
    const shopId = shopIdForStorefront(req);
    const result = await ctx.storefrontCatalog.listProducts(shopId, {
      categoryId: req.query.category_id,
      brandId: req.query.brand_id,
      search: req.query.search,
      limit: req.query.limit,
      cursor: req.query.cursor,
      offset: req.query.offset,
      availability: req.query.availability,
      includeAllAvailability: req.query.include_all_availability === true,
      minPriceMinor: req.query.min_price_minor,
      maxPriceMinor: req.query.max_price_minor,
      sortBy: req.query.sort_by,
      sortOrder: req.query.sort_order,
      layout: req.query.layout,
      searchMode: req.query.search_mode
    });
    setCatalogHttpCache(ctx, res);
    res.json(result);
  });
}

function getProductBySlugHandler(ctx) {
  return asyncHandler(async (req, res) => {
    if (!req.shopId) {
      throw new NotFoundError("Product not found");
    }
    const shopId = shopIdForStorefront(req);
    const { slug } = req.params;
    const product = await ctx.storefrontCatalog.getProductBySlug(shopId, slug);
    if (!product) {
      throw new NotFoundError("Product not found");
    }
    setCatalogHttpCache(ctx, res);
    res.json(product);
  });
}

function getProductByIdHandler(ctx) {
  return asyncHandler(async (req, res) => {
    if (!req.shopId) {
      throw new NotFoundError("Product not found");
    }
    const shopId = shopIdForStorefront(req);
    const { id } = req.params;
    const product = await ctx.storefrontCatalog.getProductById(shopId, id);
    if (!product) {
      throw new NotFoundError("Product not found");
    }
    setCatalogHttpCache(ctx, res);
    res.json(product);
  });
}

function getCategoryBySlugHandler(ctx) {
  return asyncHandler(async (req, res) => {
    const shopId = shopIdForStorefront(req);
    const { slug } = req.params;
    const category = await ctx.storefrontCatalog.getCategoryBySlug(shopId, slug);
    if (!category) {
      throw new NotFoundError("Category not found");
    }
    setCatalogHttpCache(ctx, res);
    res.json(category);
  });
}

export const storefrontCatalogController = {
  listCategories: (ctx) => listCategoriesHandler(ctx),
  listProducts: (ctx) => listProductsHandler(ctx),
  getProductBySlug: (ctx) => getProductBySlugHandler(ctx),
  getProductById: (ctx) => getProductByIdHandler(ctx),
  getCategoryBySlug: (ctx) => getCategoryBySlugHandler(ctx),

  forCtx(ctx) {
    return {
      listCategories: listCategoriesHandler(ctx),
      listProducts: listProductsHandler(ctx),
      getProductBySlug: getProductBySlugHandler(ctx),
      getProductById: getProductByIdHandler(ctx),
      getCategoryBySlug: getCategoryBySlugHandler(ctx)
    };
  }
};

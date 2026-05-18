// Purpose: This file handles catalog API requests and returns categories, products, and search results.
import { asyncHandler } from "../asyncHandler.js";

function shopIdFromRequest(req) {
  return req.shopId;
}

function createListProductsHandler() {
  return (ctx) =>
    asyncHandler(async (req, res) => {
      const items = await ctx.listProducts(shopIdFromRequest(req), {
        categoryId: req.query.categoryId
      });
      res.json({ items });
    });
}

const listProductsHandler = createListProductsHandler();

function listCategoriesHandler(ctx) {
  return asyncHandler(async (req, res) => {
    const categories = await ctx.listCategories(shopIdFromRequest(req), {
      parentId: req.query.parentId
    });
    res.json({ categories });
  });
}

function searchHandler(ctx) {
  return asyncHandler(async (req, res) => {
    const result = await ctx.searchCatalog(shopIdFromRequest(req), req.query);
    res.json(result);
  });
}

export const catalogController = {
  listCategories: (ctx) => listCategoriesHandler(ctx),

  listProducts: listProductsHandler,

  listItems: listProductsHandler,

  search: (ctx) => searchHandler(ctx),

  forCtx(ctx) {
    const listProducts = listProductsHandler(ctx);
    return {
      listCategories: listCategoriesHandler(ctx),
      listProducts,
      listItems: listProducts,
      search: searchHandler(ctx)
    };
  }
};

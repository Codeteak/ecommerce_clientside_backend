function shopIdFromRequest(req) {
  return req.query.shopId ?? req.headers["x-shop-id"];
}

function createListProductsHandler() {
  return (ctx) => async (req, res, next) => {
    try {
      const items = await ctx.listProducts(shopIdFromRequest(req), {
        categoryId: req.query.categoryId
      });
      res.json({ items });
    } catch (err) {
      next(err);
    }
  };
}

const listProductsHandler = createListProductsHandler();

export const catalogController = {
  listCategories: (ctx) => async (req, res, next) => {
    try {
      const categories = await ctx.listCategories(shopIdFromRequest(req), {
        parentId: req.query.parentId
      });
      res.json({ categories });
    } catch (err) {
      next(err);
    }
  },

  listProducts: listProductsHandler,

  /** Same handler as listProducts — prefer GET /api/catalog/products. */
  listItems: listProductsHandler
};

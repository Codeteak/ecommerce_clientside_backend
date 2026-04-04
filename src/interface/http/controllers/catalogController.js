export const catalogController = {
  listItems: (ctx) => async (_req, res, next) => {
    try {
      const items = await ctx.listCatalogItems();
      res.json({ items });
    } catch (err) {
      next(err);
    }
  }
};

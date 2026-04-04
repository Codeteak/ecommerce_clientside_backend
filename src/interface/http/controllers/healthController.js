export const healthController = {
  get: (ctx) => async (_req, res, next) => {
    try {
      const body = await ctx.getHealth();
      res.json(body);
    } catch (err) {
      next(err);
    }
  }
};

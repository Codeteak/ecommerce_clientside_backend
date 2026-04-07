import { z } from "zod";

/**
 * Purpose: This file defines and sanitizes query/param schemas for
 * storefront catalog endpoints so controllers receive safe input.
 */
const uuidOpt = z.preprocess((v) => (v === "" || v == null ? undefined : v), z.string().uuid().optional());

export const storefrontCategoriesQuerySchema = z.object({
  parent_id: uuidOpt
});

export const storefrontProductsQuerySchema = z.object({
  category_id: uuidOpt,
  search: z.preprocess((v) => {
    if (v == null || v === "") return undefined;
    return String(v).trim().slice(0, 200);
  }, z.string().optional()),
  limit: z.preprocess((v) => (v === "" || v == null ? undefined : Number(v)), z.number().int().min(1).max(100).optional()),
  cursor: z.preprocess((v) => (v === "" || v == null ? undefined : String(v)), z.string().max(500).optional()),
  availability: z.preprocess(
    (v) => (v === "" || v == null ? undefined : v),
    z.enum(["in_stock", "out_of_stock", "unknown"]).optional()
  )
});

export const storefrontProductSlugParamSchema = z.object({
  slug: z.string().min(1).max(128)
});

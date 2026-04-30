import { z } from "zod";

/**
 * Purpose: This file defines and sanitizes query/param schemas for
 * storefront catalog endpoints so controllers receive safe input.
 */
const uuidOpt = z.preprocess((v) => (v === "" || v == null ? undefined : v), z.string().uuid().optional());
const nonNegativeIntOpt = z.preprocess(
  (v) => (v === "" || v == null ? undefined : Number(v)),
  z.number().int().min(0).optional()
);
const booleanOpt = z.preprocess((v) => {
  if (v === "" || v == null) return undefined;
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v === 1 ? true : v === 0 ? false : v;
  if (typeof v === "string") {
    const normalized = v.trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(normalized)) return true;
    if (["0", "false", "no", "off"].includes(normalized)) return false;
  }
  return v;
}, z.boolean().optional());

export const storefrontCategoriesQuerySchema = z
  .object({
    parent_id: uuidOpt,
    all: booleanOpt
  })
  .superRefine((data, ctx) => {
    if (data.all === true && data.parent_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["parent_id"],
        message: "parent_id cannot be used when all=true"
      });
    }
  });

export const storefrontProductsQuerySchema = z.object({
  category_id: uuidOpt,
  brand_id: uuidOpt,
  search: z.preprocess((v) => {
    if (v == null || v === "") return undefined;
    return String(v).trim().slice(0, 200);
  }, z.string().optional()),
  limit: z.preprocess((v) => (v === "" || v == null ? undefined : Number(v)), z.number().int().min(1).max(50).optional()),
  cursor: z.preprocess((v) => (v === "" || v == null ? undefined : String(v)), z.string().max(500).optional()),
  offset: z.preprocess((v) => (v === "" || v == null ? undefined : Number(v)), z.number().int().min(0).max(50_000).optional()),
  min_price_minor: nonNegativeIntOpt,
  max_price_minor: nonNegativeIntOpt,
  availability: z.preprocess(
    (v) => (v === "" || v == null ? undefined : v),
    z.enum(["in_stock", "out_of_stock", "unknown"]).optional()
  ),
  sort_by: z.preprocess(
    (v) => (v === "" || v == null ? undefined : v),
    z.enum(["price", "created_at", "name"]).optional()
  ),
  sort_order: z.preprocess(
    (v) => (v === "" || v == null ? undefined : v),
    z.enum(["asc", "desc"]).optional()
  )
}).superRefine((data, ctx) => {
  if (
    Number.isInteger(data.min_price_minor) &&
    Number.isInteger(data.max_price_minor) &&
    data.min_price_minor > data.max_price_minor
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["min_price_minor"],
      message: "min_price_minor must be less than or equal to max_price_minor"
    });
  }

  if (data.cursor && data.sort_by && data.sort_by !== "created_at") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["cursor"],
      message: "cursor pagination is only supported with sort_by=created_at"
    });
  }

  if (data.cursor) {
    try {
      const parsed = JSON.parse(Buffer.from(data.cursor, "base64url").toString("utf8"));
      const hasTimestamp = typeof parsed?.t === "string" && Number.isFinite(Date.parse(parsed.t));
      const hasId =
        typeof parsed?.id === "string" &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(parsed.id);
      if (!hasTimestamp || !hasId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["cursor"],
          message: "cursor is invalid"
        });
      }
    } catch {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["cursor"],
        message: "cursor is invalid"
      });
    }
  }
});

export const storefrontProductSlugParamSchema = z.object({
  slug: z.string().min(1).max(128)
});

export const storefrontProductIdParamSchema = z.object({
  id: z.string().uuid()
});

export const storefrontCategorySlugParamSchema = z.object({
  slug: z.string().min(1).max(128)
});

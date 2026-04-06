import { z } from "zod";

function singleQuery(v) {
  if (Array.isArray(v)) return v[0];
  return v;
}

const optUuid = z.preprocess(
  (v) => {
    const s = singleQuery(v);
    if (s === undefined || s === null || s === "") return undefined;
    return s;
  },
  z.string().uuid().optional()
);

function coerceInt(v, fallback, min, max) {
  const s = singleQuery(v);
  if (s === undefined || s === null || s === "") return fallback;
  const n = Number(s);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

export const catalogSearchQuerySchema = z
  .object({
    shopId: optUuid,
    type: z.preprocess(
      (v) => singleQuery(v) ?? "both",
      z.enum(["products", "categories", "both"])
    ),
    q: z.preprocess((v) => {
      const s = singleQuery(v);
      if (s == null || String(s).trim() === "") return undefined;
      return String(s).trim();
    }, z.string().max(200).optional()),
    categoryId: optUuid,
    parentId: optUuid,
    availability: z.preprocess((v) => {
      const s = singleQuery(v);
      if (s === undefined || s === null || s === "") return undefined;
      return s;
    }, z.enum(["in_stock", "out_of_stock", "unknown"]).optional()),
    productSort: z.preprocess(
      (v) => singleQuery(v) ?? "name",
      z.enum(["name", "price", "created_at", "availability"])
    ),
    productOrder: z.preprocess(
      (v) => (singleQuery(v) === "desc" ? "desc" : "asc"),
      z.enum(["asc", "desc"])
    ),
    categorySort: z.preprocess(
      (v) => singleQuery(v) ?? "sort_order",
      z.enum(["sort_order", "name", "created_at"])
    ),
    categoryOrder: z.preprocess(
      (v) => (singleQuery(v) === "desc" ? "desc" : "asc"),
      z.enum(["asc", "desc"])
    ),
    productLimit: z.preprocess((v) => coerceInt(v, 100, 1, 100), z.number().int()),
    productOffset: z.preprocess((v) => coerceInt(v, 0, 0, 50_000), z.number().int()),
    categoryLimit: z.preprocess((v) => coerceInt(v, 500, 1, 500), z.number().int()),
    categoryOffset: z.preprocess((v) => coerceInt(v, 0, 0, 50_000), z.number().int())
  });

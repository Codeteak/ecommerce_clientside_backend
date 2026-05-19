import { z } from "zod";

/**
 * Purpose: This file defines request validation schemas for
 * storefront cart, profile, address, checkout, and order endpoints.
 */
const optionalCouponCode = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .optional()
  .nullable()
  .transform((v) => (v == null || v === "" ? undefined : v.toUpperCase()));

export const storefrontCartGetQuerySchema = z.object({
  couponCode: optionalCouponCode
});

export const storefrontCartItemBodySchema = z
  .object({
    productId: z.string().uuid(),
    quantity: z.coerce.number().positive().optional(),
    delta: z.coerce.number().int().optional(),
    couponCode: optionalCouponCode
  })
  .refine((b) => b.quantity !== undefined || b.delta !== undefined, {
    message: "quantity or delta is required"
  });

export const storefrontCartItemPatchSchema = z
  .object({
    quantity: z.coerce.number().positive().optional(),
    delta: z.coerce.number().int().optional(),
    couponCode: optionalCouponCode
  })
  .refine((b) => b.quantity !== undefined || b.delta !== undefined, {
    message: "quantity or delta is required"
  });

export const storefrontCartItemDeleteBodySchema = z.object({
  couponCode: optionalCouponCode
});

export const storefrontProfilePostSchema = z
  .object({
    displayName: z.string().max(120).optional().nullable()
  })
  .refine((b) => b.displayName !== undefined, {
    message: "displayName is required"
  });

const addressFields = {
  line1: z.string().min(1).max(200),
  line2: z.string().max(200).optional().nullable(),
  landmark: z.string().max(200).optional().nullable(),
  city: z.string().max(120).optional().nullable(),
  state: z.string().max(120).optional().nullable(),
  postalCode: z.string().max(32).optional().nullable(),
  country: z.string().max(120).optional().nullable(),
  lat: z.number().min(-90).max(90).optional().nullable(),
  lng: z.number().min(-180).max(180).optional().nullable(),
  raw: z.string().max(2000).optional().nullable()
};

export const storefrontAddressPostSchema = z.object(addressFields);

export const storefrontAddressPatchSchema = z.object(addressFields).partial();

export const storefrontCheckoutBodySchema = z.object({
  notes: z.string().max(2000).optional().nullable(),
  couponCode: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .optional()
    .nullable()
    .transform((v) => (v == null || v === "" ? undefined : v.toUpperCase()))
});

export const storefrontOrderIdParamSchema = z.object({
  id: z.string().uuid()
});

export const storefrontOrdersListQuerySchema = z.object({
  limit: z.preprocess(
    (v) => (v === undefined || v === "" ? undefined : Number(v)),
    z.number().int().min(1).max(100).optional()
  )
});

export const storefrontCouponsListQuerySchema = z.object({
  code: z.string().trim().min(1).max(64).optional(),
  cartSubtotalMinor: z.preprocess(
    (v) => (v === undefined || v === "" ? undefined : Number(v)),
    z.number().finite().int().min(0).optional()
  ),
  onlyApplicable: z.preprocess((v) => {
    if (v === undefined || v === "" || v === null) return false;
    const s = String(Array.isArray(v) ? v[0] : v).toLowerCase();
    return s === "true" || s === "1";
  }, z.boolean())
});

export const storefrontCatalogCacheInvalidateBodySchema = z.object({
  shopId: z.string().uuid(),
  prewarm: z.boolean().optional(),
  topCategoryLimit: z.coerce.number().int().min(1).max(20).optional()
});

export const storefrontCatalogCachePrewarmBodySchema = z.object({
  shopId: z.string().uuid(),
  topCategoryLimit: z.coerce.number().int().min(1).max(20).optional()
});

import { z } from "zod";

/**
 * Purpose: This file defines request validation schemas for
 * storefront cart, profile, address, checkout, and order endpoints.
 */
export const storefrontCartItemBodySchema = z.object({
  productId: z.string().uuid(),
  quantity: z.coerce.number().positive()
});

export const storefrontCartItemPatchSchema = z.object({
  quantity: z.coerce.number().positive()
});

export const storefrontProfilePostSchema = z
  .object({
    displayName: z.string().max(120).optional().nullable(),
    phone: z.string().max(32).optional().nullable()
  })
  .refine((b) => b.displayName !== undefined || b.phone !== undefined, {
    message: "At least one of displayName or phone is required"
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
  addressId: z.string().uuid(),
  notes: z.string().max(2000).optional().nullable()
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

export const storefrontCatalogCacheInvalidateBodySchema = z.object({
  shopId: z.string().uuid()
});

import { z } from "zod";

const addressPatchSchema = z
  .object({
    line1: z.string().max(500).nullable().optional(),
    line2: z.string().max(500).nullable().optional(),
    landmark: z.string().max(500).nullable().optional(),
    city: z.string().max(200).nullable().optional(),
    state: z.string().max(200).nullable().optional(),
    postalCode: z.string().max(32).nullable().optional(),
    country: z.string().max(200).nullable().optional(),
    lat: z.number().gte(-90).lte(90).nullable().optional(),
    lng: z.number().gte(-180).lte(180).nullable().optional(),
    raw: z.string().max(8000).nullable().optional()
  })
  .strict()
  .refine((val) => Object.keys(val).length > 0, {
    message: "address must include at least one field when provided"
  });

/** `PATCH /api/me/profile` — only include fields to change (partial nested address). */
export const patchProfileBodySchema = z
  .object({
    name: z.string().max(120).nullable().optional(),
    displayName: z.string().max(120).nullable().optional(),
    email: z.string().email().nullable().optional(),
    phone: z.string().max(32).nullable().optional(),
    address: addressPatchSchema.optional()
  })
  .strict()
  .superRefine((val, ctx) => {
    if (
      val.name === undefined &&
      val.displayName === undefined &&
      val.email === undefined &&
      val.phone === undefined &&
      val.address === undefined
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provide at least one field to update",
        path: []
      });
    }
  });

const phoneSchema = z.string().regex(/^[0-9+][0-9]{7,31}$/, "Invalid phone format");

export const phoneChangeRequestBodySchema = z
  .object({
    newPhone: phoneSchema
  })
  .strict();

export const phoneChangeVerifyBodySchema = z
  .object({
    newPhone: phoneSchema,
    code: z.string().regex(/^\d{6}$/, "OTP code must be 6 digits")
  })
  .strict();

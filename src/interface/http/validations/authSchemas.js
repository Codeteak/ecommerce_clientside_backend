import { z } from "zod";
import { customerPhoneSchema } from "./phoneSchema.js";

const phoneSchema = customerPhoneSchema;

export const otpRequestBodySchema = z
  .object({
    phone: phoneSchema,
    shopId: z.string().uuid()
  })
  .strict();

export const otpVerifyBodySchema = z
  .object({
    phone: phoneSchema,
    shopId: z.string().uuid(),
    code: z.string().regex(/^\d{4}$/, "OTP code must be 4 digits")
  })
  .strict();

export const refreshTokenBodySchema = z
  .object({
    refreshToken: z.string().min(20, "Refresh token is required")
  })
  .strict();

export const logoutBodySchema = z
  .object({
    refreshToken: z.string().min(20).optional()
  })
  .strict()
  .optional()
  .default({});

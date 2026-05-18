import { z } from "zod";
import { customerPhoneSchema } from "./phoneSchema.js";

const phoneSchema = customerPhoneSchema;
const emailSchema = z.string().trim().toLowerCase().email("Invalid email format");

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
    code: z.string().regex(/^\d{6}$/, "OTP code must be 6 digits")
  })
  .strict();

export const emailOtpRequestBodySchema = z
  .object({
    email: emailSchema,
    shopId: z.string().uuid()
  })
  .strict();

export const emailOtpVerifyBodySchema = z
  .object({
    email: emailSchema,
    shopId: z.string().uuid(),
    code: z.string().regex(/^\d{6}$/, "OTP code must be 6 digits")
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
  .strict();

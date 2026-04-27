import { z } from "zod";

const phoneSchema = z.string().regex(/^[0-9+][0-9]{7,31}$/, "Invalid phone format");
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

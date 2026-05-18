import { z } from "zod";
import { normalizeCustomerPhoneForStorage } from "../../../domain/phone/normalizeCustomerPhone.js";

/** Accepts +91 / 91 / 10-digit input; output is 10-digit storage form. */
export const customerPhoneSchema = z
  .string()
  .min(8, "Invalid phone format")
  .max(32, "Invalid phone format")
  .transform((val, ctx) => {
    try {
      return normalizeCustomerPhoneForStorage(val);
    } catch {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid phone number" });
      return z.NEVER;
    }
  });

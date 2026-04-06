import { z } from "zod";
import { ValidationError } from "../../../domain/errors/ValidationError.js";

export const catalogShopIdSchema = z.string().uuid("shopId must be a valid UUID");

export function requireShopId(shopId) {
  const parsed = catalogShopIdSchema.safeParse(shopId);
  if (!parsed.success) {
    throw new ValidationError("Invalid or missing shopId", { issues: parsed.error.flatten() });
  }
  return parsed.data;
}

const optionalUuid = z.string().uuid("Must be a valid UUID");

export function parseOptionalUuidParam(raw) {
  if (raw === undefined || raw === null || raw === "") {
    return null;
  }
  const parsed = optionalUuid.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError("Invalid query parameter", { issues: parsed.error.flatten() });
  }
  return parsed.data;
}

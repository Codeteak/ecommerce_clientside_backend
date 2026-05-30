import { AuthError } from "../../../domain/errors/AuthError.js";
import { ValidationError } from "../../../domain/errors/ValidationError.js";
import { NotFoundError } from "../../../domain/errors/NotFoundError.js";
import { shopAllowsCustomers } from "./shopPolicy.js";
import { verifyOtpCode } from "../../../infra/security/otpHasher.js";

function normalizeEmail(raw) {
  return String(raw || "").trim().toLowerCase();
}

/**
 * @param {{
 *   authRepo: import("../../ports/repositories/CustomerAuthRepo.js").CustomerAuthRepo,
 *   buildStorefrontSession: (
 *     client: import("pg").PoolClient,
 *     userId: string,
 *     sessionMeta?: object
 *   ) => Promise<object>,
 *   otpMaxAttempts?: number
 * }} deps
 */
export function createVerifyCustomerEmailOtp({ authRepo, buildStorefrontSession, otpMaxAttempts = 5 }) {
  return async function verifyCustomerEmailOtp(client, input) {
    const email = normalizeEmail(input.email);
    const shopId = input.shopId;
    const code = String(input.code || "").trim();
    const ip = input.ip ?? null;
    const userAgent = input.userAgent ?? null;

    const shop = await authRepo.getShopById(client, shopId);
    if (!shop) {
      throw new NotFoundError("Shop not found");
    }
    if (!shopAllowsCustomers(shop)) {
      throw new ValidationError("Shop is not available");
    }

    const challenge = await authRepo.findLatestEmailOtpChallenge(client, email, shopId);
    if (!challenge || challenge.consumed_at || new Date(challenge.expires_at) <= new Date()) {
      throw new AuthError("Invalid or expired OTP");
    }
    if (Number(challenge.attempts) >= otpMaxAttempts) {
      await authRepo.consumeEmailOtpChallenge(client, challenge.id);
      throw new AuthError("Invalid or expired OTP");
    }

    const ok = await verifyOtpCode(code, challenge.code_hash);
    if (!ok) {
      const updated = await authRepo.incrementEmailOtpChallengeAttempts(client, challenge.id);
      if (updated && Number(updated.attempts) >= otpMaxAttempts) {
        await authRepo.consumeEmailOtpChallenge(client, challenge.id);
      }
      throw new AuthError("Invalid or expired OTP");
    }

    await authRepo.consumeEmailOtpChallenge(client, challenge.id);

    let user = await authRepo.getUserByEmail(client, email);
    if (!user) {
      user = await authRepo.insertUser(client, { email, phone: null, password_hash: null });
    } else if (!user.is_active) {
      throw new AuthError("Invalid credentials");
    }
    let customer = await authRepo.getCustomerByUserId(client, user.id);
    if (!customer) {
      customer = await authRepo.insertCustomer(client, {
        user_id: user.id,
        display_name: null
      });
    } else if (customer.is_blocked || customer.is_deleted) {
      throw new AuthError("Invalid credentials");
    }

    const membership = await authRepo.upsertCustomerShopMembership(client, {
      shop_id: shop.id,
      customer_id: customer.id
    });
    if (membership.is_blocked) {
      throw new AuthError("Invalid credentials");
    }

    return buildStorefrontSession(client, user.id, { ip, userAgent });
  };
}

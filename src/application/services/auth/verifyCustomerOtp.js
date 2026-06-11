import { AuthError } from "../../../domain/errors/AuthError.js";
import { ValidationError } from "../../../domain/errors/ValidationError.js";
import { NotFoundError } from "../../../domain/errors/NotFoundError.js";
import { shopAllowsCustomers } from "./shopPolicy.js";
import { verifyOtpCode } from "../../../infra/security/otpHasher.js";
import { normalizeCustomerPhoneForStorage } from "../../../domain/phone/normalizeCustomerPhone.js";
import { getRequestLogger } from "../../../infra/logging/requestContext.js";
import { setTenantContext } from "../../../infra/db/tenantContext.js";
import {
  ensureCustomerForUser,
  resolveUserByPhoneForCustomerLogin,
  syncUserPhoneForCustomerLogin
} from "./resolveUserForCustomerLogin.js";

function maskPhone(phone) {
  const raw = String(phone || "");
  if (raw.length <= 4) return raw;
  return `${"*".repeat(Math.max(0, raw.length - 4))}${raw.slice(-4)}`;
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
export function createVerifyCustomerOtp({ authRepo, buildStorefrontSession, otpMaxAttempts = 5 }) {
  return async function verifyCustomerOtp(client, input) {
    const log = getRequestLogger();
    const phone = normalizeCustomerPhoneForStorage(input.phone);
    const shopId = input.shopId;
    const code = String(input.code || "").trim();
    const ip = input.ip ?? null;
    const userAgent = input.userAgent ?? null;
    const logBase = {
      event: "security.otp.verify.rejected",
      shopId,
      phoneMasked: maskPhone(phone)
    };
    const shop = await authRepo.getShopById(client, shopId);
    if (!shop) {
      throw new NotFoundError("Shop not found");
    }
    if (!shopAllowsCustomers(shop)) {
      throw new ValidationError("Shop is not available");
    }

    await setTenantContext(client, shopId);

    const now = new Date();
    const challengeCandidates = typeof authRepo.listRecentOtpChallenges === "function"
      ? await authRepo.listRecentOtpChallenges(client, phone, shopId, 5)
      : [await authRepo.findLatestOtpChallenge(client, phone, shopId)].filter(Boolean);
    const activeCandidates = challengeCandidates.filter(
      (c) => c && !c.consumed_at && new Date(c.expires_at) > now
    );
    const challenge = activeCandidates[0] ?? null;
    if (!challenge) {
      throw new AuthError("Invalid or expired OTP");
    }
    if (Number(challenge.attempts) >= otpMaxAttempts) {
      await authRepo.consumeOtpChallenge(client, challenge.id);
      throw new AuthError("Invalid or expired OTP");
    }

    let matchedChallenge = null;
    for (const candidate of activeCandidates) {
      // Accept any still-active OTP challenge for this phone/shop to avoid false negatives
      // when users receive multiple valid OTP messages close together.
      const ok = await verifyOtpCode(code, candidate.code_hash);
      if (ok) {
        matchedChallenge = candidate;
        break;
      }
    }
    const ok = matchedChallenge != null;
    if (!ok) {
      const updated = await authRepo.incrementOtpChallengeAttempts(client, challenge.id);
      if (updated && Number(updated.attempts) >= otpMaxAttempts) {
        await authRepo.consumeOtpChallenge(client, challenge.id);
      }
      throw new AuthError("Invalid or expired OTP");
    }

    await authRepo.consumeOtpChallenge(client, matchedChallenge.id);

    let user = await resolveUserByPhoneForCustomerLogin(authRepo, client, phone);
    if (!user.is_active) {
      log.warn({ ...logBase, reason: "user_inactive", userId: user.id }, "OTP verify rejected");
      throw new AuthError("Invalid credentials");
    }
    user = await syncUserPhoneForCustomerLogin(authRepo, client, user, phone);

    const isStaffUser =
      typeof authRepo.isUserActiveShopStaff === "function" &&
      (await authRepo.isUserActiveShopStaff(client, user.id));

    let customer = await ensureCustomerForUser(authRepo, client, user.id, null);
    if (customer.is_blocked || customer.is_deleted) {
      log.warn(
        { ...logBase, reason: customer.is_blocked ? "customer_blocked" : "customer_deleted", userId: user.id, customerId: customer.id },
        "OTP verify rejected"
      );
      throw new AuthError("Invalid credentials");
    }

    const existingMembership = await authRepo.getCustomerShopMembership(client, customer.id, shopId);
    if (existingMembership?.is_blocked) {
      log.warn({ ...logBase, reason: "membership_blocked", userId: user.id, customerId: customer.id }, "OTP verify rejected");
      throw new AuthError("Invalid credentials");
    }

    const membership = await authRepo.upsertCustomerShopMembership(client, {
      shop_id: shop.id,
      customer_id: customer.id
    });
    if (membership.is_blocked) {
      log.warn({ ...logBase, reason: "membership_blocked_after_upsert", userId: user.id, customerId: customer.id }, "OTP verify rejected");
      throw new AuthError("Invalid credentials");
    }

    if (isStaffUser) {
      log.info(
        { event: "security.otp.verify.staff_as_customer", shopId, userId: user.id, customerId: customer.id },
        "Staff user verified as storefront customer"
      );
    }

    return buildStorefrontSession(client, user.id, { ip, userAgent });
  };
}

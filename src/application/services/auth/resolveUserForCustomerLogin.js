import { normalizeCustomerPhoneForStorage } from "../../../domain/phone/normalizeCustomerPhone.js";

function phonesEquivalent(stored, normalizedPhone) {
  if (!stored) return false;
  try {
    return normalizeCustomerPhoneForStorage(stored) === normalizedPhone;
  } catch {
    return false;
  }
}

/**
 * Align legacy stored phone formats without violating users_phone_key.
 * @param {import("../../ports/repositories/CustomerAuthRepo.js").CustomerAuthRepo} authRepo
 * @param {import("pg").PoolClient} client
 * @param {{ id: string, phone?: string | null }} user
 * @param {string} phone normalized 10-digit phone
 */
export async function syncUserPhoneForCustomerLogin(authRepo, client, user, phone) {
  if (phonesEquivalent(user.phone, phone)) {
    return user.phone === phone ? user : { ...user, phone };
  }

  const existing = await authRepo.getUserByPhone(client, phone);
  if (existing && existing.id !== user.id) {
    return existing;
  }

  try {
    await authRepo.updateUserPhone(client, user.id, phone);
    return { ...user, phone };
  } catch (err) {
    if (err?.code === "23505" && err?.constraint === "users_phone_key") {
      const owner = await authRepo.getUserByPhone(client, phone);
      if (owner) return owner;
    }
    throw err;
  }
}

/**
 * Resolve or create a users row for storefront customer login (including active shop staff).
 * @param {import("../../ports/repositories/CustomerAuthRepo.js").CustomerAuthRepo} authRepo
 * @param {import("pg").PoolClient} client
 * @param {string} phone normalized 10-digit phone
 */
export async function resolveUserByPhoneForCustomerLogin(authRepo, client, phone) {
  let user = await authRepo.getUserByPhone(client, phone);
  if (user) return user;

  if (typeof authRepo.getActiveShopStaffUserByPhone === "function") {
    user = await authRepo.getActiveShopStaffUserByPhone(client, phone);
    if (user) return user;
  }

  try {
    return await authRepo.insertUser(client, { email: null, phone, password_hash: null });
  } catch (err) {
    if (err?.code !== "23505") throw err;
    user = await authRepo.getUserByPhone(client, phone);
    if (user) return user;
    if (typeof authRepo.getActiveShopStaffUserByPhone === "function") {
      user = await authRepo.getActiveShopStaffUserByPhone(client, phone);
      if (user) return user;
    }
    throw err;
  }
}

/**
 * @param {import("../../ports/repositories/CustomerAuthRepo.js").CustomerAuthRepo} authRepo
 * @param {import("pg").PoolClient} client
 * @param {string} email normalized email
 */
export async function resolveUserByEmailForCustomerLogin(authRepo, client, email) {
  let user = await authRepo.getUserByEmail(client, email);
  if (user) return user;

  if (typeof authRepo.getActiveShopStaffUserByEmail === "function") {
    user = await authRepo.getActiveShopStaffUserByEmail(client, email);
    if (user) return user;
  }

  try {
    return await authRepo.insertUser(client, { email, phone: null, password_hash: null });
  } catch (err) {
    if (err?.code !== "23505") throw err;
    user = await authRepo.getUserByEmail(client, email);
    if (user) return user;
    if (typeof authRepo.getActiveShopStaffUserByEmail === "function") {
      user = await authRepo.getActiveShopStaffUserByEmail(client, email);
      if (user) return user;
    }
    throw err;
  }
}

/**
 * @param {import("../../ports/repositories/CustomerAuthRepo.js").CustomerAuthRepo} authRepo
 * @param {import("pg").PoolClient} client
 * @param {string} userId
 * @param {string | null | undefined} displayName
 */
export async function ensureCustomerForUser(authRepo, client, userId, displayName = null) {
  let customer = await authRepo.getCustomerByUserId(client, userId);
  if (customer) return customer;

  await authRepo.insertCustomer(client, {
    user_id: userId,
    display_name: displayName
  });
  customer = await authRepo.getCustomerByUserId(client, userId);
  if (!customer) {
    throw new Error("Failed to create customer profile");
  }
  return customer;
}

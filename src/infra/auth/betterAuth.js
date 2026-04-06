import { betterAuth } from "better-auth";
import { getOAuthState } from "better-auth/api";
import { CustomerAuthRepoPg } from "../../adapters/repositories/postgres/CustomerAuthRepoPg.js";
import { provisionCustomerForOAuthShop } from "../../application/usecases/auth/provisionCustomerForOAuthShop.js";
import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import { pool } from "../db/pool.js";

const googleConfigured =
  Boolean(env.GOOGLE_CLIENT_ID?.trim()) && Boolean(env.GOOGLE_CLIENT_SECRET?.trim());

const customerAuthRepo = new CustomerAuthRepoPg();
const provisionOAuthShop = provisionCustomerForOAuthShop({ authRepo: customerAuthRepo });

/**
 * Better Auth instance (Google OAuth). Mounted at {@link env.BETTER_AUTH_BASE_PATH}.
 *
 * Email/password remains on legacy `POST /api/auth/register` and `POST /api/auth/login` (JWT).
 */
export const auth = betterAuth({
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  basePath: env.BETTER_AUTH_BASE_PATH,
  database: pool,
  trustedOrigins: [env.CORS_ORIGIN],
  /**
   * OAuth state: with a DB, Better Auth defaults to `database` (verification row + signed cookie).
   * In development, `POST …/sign-in/social` from Postman then opening the Google URL in Chrome
   * never sends Postman's cookie → `auth state cookie not found` / `please_restart_the_process`.
   * Skipping the cookie check keeps the PKCE verifier in the verification table only; production
   * keeps the stricter check.
   */
  account: {
    storeStateStrategy: "database",
    skipStateCookieCheck: env.NODE_ENV !== "production"
  },
  databaseHooks: {
    session: {
      create: {
        after: async (session) => {
          let oauth;
          try {
            oauth = await getOAuthState();
          } catch {
            return;
          }
          const shopId = oauth?.shopId;
          if (!shopId || typeof shopId !== "string") {
            return;
          }

          const userId = session.userId ?? session.user_id;
          if (!userId) {
            return;
          }

          const {
            rows: [baUser]
          } = await pool.query(`SELECT email, name FROM "user" WHERE id = $1`, [userId]);
          if (!baUser?.email) {
            return;
          }

          const client = await pool.connect();
          try {
            await client.query("BEGIN");
            await provisionOAuthShop(client, {
              shopId,
              email: baUser.email,
              displayName: baUser.name ?? null
            });
            await client.query("COMMIT");
          } catch (err) {
            await client.query("ROLLBACK");
            logger.error({ err, shopId }, "OAuth shop provisioning failed (Better Auth session still created)");
          } finally {
            client.release();
          }
        }
      }
    }
  },
  emailAndPassword: {
    enabled: false
  },
  socialProviders: googleConfigured
    ? {
        google: {
          clientId: env.GOOGLE_CLIENT_ID,
          clientSecret: env.GOOGLE_CLIENT_SECRET,
          prompt: "select_account"
        }
      }
    : {}
});

export const isGoogleOAuthConfigured = googleConfigured;

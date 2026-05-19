import { z } from "zod";
import { patchRequestContext } from "../../../infra/logging/requestContext.js";

// Purpose: Resolves shop ID from x-shop-id header, then subdomain, then custom domain (no query params).
const uuidSchema = z.string().uuid();

/**
 * @param {{
 *   shopResolveCache?: {
 *     findShopIdBySlug: (slug: string) => Promise<string | null>,
 *     findShopIdByCustomDomain: (host: string) => Promise<string | null>
 *   },
 *   shopLookupRepo?: {
 *     findShopIdBySlug: (slug: string) => Promise<string | null>,
 *     findShopIdByCustomDomain: (host: string) => Promise<string | null>
 *   },
 *   storefrontRootDomain: string | null
 * }} deps
 */
export function createShopResolver({ shopResolveCache, shopLookupRepo, storefrontRootDomain }) {
  const root = storefrontRootDomain?.trim()?.toLowerCase() || null;
  const resolveSlug =
    shopResolveCache?.findShopIdBySlug?.bind(shopResolveCache) ??
    shopLookupRepo?.findShopIdBySlug?.bind(shopLookupRepo);
  const resolveHost =
    shopResolveCache?.findShopIdByCustomDomain?.bind(shopResolveCache) ??
    shopLookupRepo?.findShopIdByCustomDomain?.bind(shopLookupRepo);

  function skipCustomDomainLookup(hostRaw) {
    const host = String(hostRaw || "")
      .trim()
      .toLowerCase()
      .split(":")[0];
    if (!host) return true;
    if (host === "localhost" || host === "[::1]" || host === "::1") return true;
    if (host.startsWith("127.")) return true;
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return true;
    return false;
  }

  return async function shopResolver(req, res, next) {
    try {
      const headerRaw = req.headers["x-shop-id"];
      const header = Array.isArray(headerRaw) ? headerRaw[0] : headerRaw;

      let shopId = null;

      if (header != null && String(header).trim() !== "") {
        const parsed = uuidSchema.safeParse(String(header).trim());
        if (parsed.success) shopId = parsed.data;
      }

      if (!shopId && root && resolveSlug) {
        const host = (req.hostname || "").trim().toLowerCase();
        if (host.endsWith(`.${root}`)) {
          const slug = host.slice(0, -(root.length + 1));
          if (slug && slug !== "www") {
            shopId = await resolveSlug(slug);
          }
        }
      }

      if (!shopId && resolveHost) {
        const hostHdr = req.get("host") || "";
        const host = (req.hostname || hostHdr.split(":")[0] || "").trim().toLowerCase();
        if (host && !skipCustomDomainLookup(hostHdr || host)) {
          shopId = await resolveHost(host);
        }
      }

      req.shopId = shopId ?? undefined;
      if (req.shopId) {
        patchRequestContext({ shopId: req.shopId });
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

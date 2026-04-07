import { z } from "zod";

// Purpose: This middleware finds the shop ID from query, header, subdomain, or custom domain.
const uuidSchema = z.string().uuid();

export function createShopResolver({ shopLookupRepo, storefrontRootDomain }) {
  const root = storefrontRootDomain?.trim()?.toLowerCase() || null;

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
      const qRaw = req.query?.shopId ?? req.query?.shop_id;
      const q = Array.isArray(qRaw) ? qRaw[0] : qRaw;
      const headerRaw = req.headers["x-shop-id"];
      const header = Array.isArray(headerRaw) ? headerRaw[0] : headerRaw;

      let shopId = null;

      if (q != null && String(q).trim() !== "") {
        const parsed = uuidSchema.safeParse(String(q).trim());
        if (parsed.success) shopId = parsed.data;
      }

      if (!shopId && header != null && String(header).trim() !== "") {
        const parsed = uuidSchema.safeParse(String(header).trim());
        if (parsed.success) shopId = parsed.data;
      }

      if (!shopId && root) {
        const host = (req.hostname || "").trim().toLowerCase();
        if (host.endsWith(`.${root}`)) {
          const slug = host.slice(0, -(root.length + 1));
          if (slug && slug !== "www") {
            shopId = await shopLookupRepo.findShopIdBySlug(slug);
          }
        }
      }

      if (!shopId) {
        const hostHdr = req.get("host") || "";
        const host = (req.hostname || hostHdr.split(":")[0] || "").trim().toLowerCase();
        if (host && !skipCustomDomainLookup(hostHdr || host)) {
          shopId = await shopLookupRepo.findShopIdByCustomDomain(host);
        }
      }

      req.shopId = shopId ?? undefined;
      next();
    } catch (err) {
      next(err);
    }
  };
}

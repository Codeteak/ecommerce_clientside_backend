/**
 * CORS allowlist for storefront + explicit origins.
 * Allows https://{label}.ROOT and https://www.{label}.ROOT when STOREFRONT_ROOT_DOMAIN is set.
 */

/**
 * @param {string | string[] | null | undefined} corsOrigin
 * @param {string | null | undefined} storefrontRootDomain
 * @returns {(origin: string | undefined, cb: (err: Error | null, allow?: boolean | string) => void) => void}
 */
export function createCorsOriginDelegate(corsOrigin, storefrontRootDomain) {
  const allowed = new Set(
    (Array.isArray(corsOrigin) ? corsOrigin : String(corsOrigin || "").split(","))
      .map((o) => String(o || "").trim())
      .filter(Boolean)
  );

  const root = String(storefrontRootDomain || "")
    .trim()
    .toLowerCase()
    .replace(/^\.+/, "");

  return function corsOriginDelegate(origin, callback) {
    // Non-browser / same-server tools
    if (!origin) {
      callback(null, true);
      return;
    }

    if (allowed.has(origin)) {
      callback(null, true);
      return;
    }

    if (root) {
      try {
        const { protocol, hostname } = new URL(origin);
        if (protocol === "https:" || protocol === "http:") {
          const host = hostname.toLowerCase();
          if (host === root || host.endsWith(`.${root}`)) {
            callback(null, true);
            return;
          }
        }
      } catch {
        /* ignore */
      }
    }

    callback(null, false);
  };
}

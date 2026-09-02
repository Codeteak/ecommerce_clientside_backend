/**
 * Purpose: Answer "can this shop take customers right now?"
 * Shop availability is `shops.status` only (`active` | `blocked` | `deleted`).
 */
export function shopAllowsCustomers(shop) {
  if (!shop) return false;
  return String(shop.status || "").trim().toLowerCase() === "active";
}

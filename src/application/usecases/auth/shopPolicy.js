/**
 * Purpose: Answer "can this shop take customers right now?" (exists, active, not blocked).
 */
export function shopAllowsCustomers(shop) {
  if (!shop) return false;
  return (
    shop.status === "active" &&
    shop.is_active === true &&
    shop.is_blocked === false &&
    shop.is_deleted === false
  );
}

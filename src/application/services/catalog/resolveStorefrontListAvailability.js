/**
 * Storefront catalog lists sellable offers by default (active + in_stock),
 * matching cart add / checkout. Pass includeAllAvailability to list every
 * active row regardless of stock, or set availability explicitly.
 *
 * @param {string | null | undefined} availability
 * @param {boolean | undefined} includeAllAvailability
 * @returns {'in_stock' | 'out_of_stock' | 'unknown' | null}
 */
export function resolveStorefrontListAvailability(availability, includeAllAvailability) {
  if (includeAllAvailability === true) {
    return availability ?? null;
  }
  return availability ?? "in_stock";
}

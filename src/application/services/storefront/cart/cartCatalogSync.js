import {
  assertLineQuantity,
  assertSellableProductSnapshot,
  cartError,
  cartLineRemovalReason,
  parseBillableCartQuantity
} from "./cartLineRules.js";

export function createCartCatalogSync({ cartRepo }) {
  function productIdsFromCartItems(items) {
    const ids = new Set();
    for (const it of items) {
      if (!it.is_custom && it.product_id) {
        ids.add(String(it.product_id));
      }
    }
    return [...ids];
  }

  async function loadSnapshotsByProductId(client, shopId, items) {
    const ids = productIdsFromCartItems(items);
    if (!ids.length) {
      return new Map();
    }
    const rows = await cartRepo.listProductSnapshotsForCart(client, shopId, ids);
    const map = new Map();
    for (const row of rows) {
      map.set(String(row.id), row);
    }
    return map;
  }

  async function pruneUnsellableCartLines(client, shopId, items, snapshots) {
    let removed = false;
    const snap = snapshots ?? (await loadSnapshotsByProductId(client, shopId, items));

    for (const it of items) {
      if (it.is_custom || !it.product_id) continue;

      const p = snap.get(String(it.product_id));
      const reason = cartLineRemovalReason(p, it.quantity);
      if (reason) {
        await cartRepo.deleteCartItem(client, shopId, it.id);
        removed = true;
      }
    }

    return { removed, snapshots: snap };
  }

  async function syncCartLinesFromCatalog(client, shopId, items, snapshots) {
    /** @type {Map<string, { priceUpdated: boolean, previousUnitPriceMinor?: number }>} */
    const metaByItemId = new Map();
    const snap = snapshots ?? (await loadSnapshotsByProductId(client, shopId, items));
    let mutated = false;

    for (const it of items) {
      if (it.is_custom || !it.product_id) continue;

      const p = snap.get(String(it.product_id));
      if (!p) {
        throw cartError(
          "PRODUCT_UNAVAILABLE",
          "One or more products are unavailable. Please refresh your cart."
        );
      }
      assertSellableProductSnapshot(p);

      const listPrice = Number(p.price_minor_per_unit);
      const prevUnit = Number(it.unit_price_minor);
      const priceUpdated = prevUnit !== listPrice;
      const qty = parseBillableCartQuantity(it.quantity);

      assertLineQuantity(qty);

      if (priceUpdated || String(it.title_snapshot) !== String(p.name)) {
        await cartRepo.updateCartItemSnapshot(client, shopId, it.id, {
          quantity: qty,
          unitPriceMinor: listPrice,
          titleSnapshot: p.name,
          unitLabel: p.base_unit
        });
        mutated = true;
      }

      metaByItemId.set(String(it.id), {
        priceUpdated,
        previousUnitPriceMinor: priceUpdated ? prevUnit : undefined
      });
    }

    return { metaByItemId, mutated, snapshots: snap };
  }

  return {
    loadSnapshotsByProductId,
    pruneUnsellableCartLines,
    syncCartLinesFromCatalog
  };
}

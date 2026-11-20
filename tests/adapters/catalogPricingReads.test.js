import { describe, expect, it, vi } from "vitest";
import { CatalogRepoPg } from "../../src/adapters/repositories/postgres/catalog/CatalogRepoPg.js";

describe("CatalogRepoPg pricing reads", () => {
  const repo = new CatalogRepoPg();

  it("returns category parents from the caller client", async () => {
    const client = {
      query: vi.fn(async () => ({
        rows: [
          { id: "child", parent_id: "parent" },
          { id: "parent", parent_id: null }
        ]
      }))
    };
    const map = await repo.listCategoryParents(client, ["child", "child", " "]);
    expect(map.get("child")).toBe("parent");
    expect(map.get("parent")).toBe(null);
    expect(client.query).toHaveBeenCalledTimes(1);
  });

  it("skips the parent query when there are no category ids", async () => {
    const client = { query: vi.fn() };
    const map = await repo.listCategoryParents(client, [null, ""]);
    expect(map.size).toBe(0);
    expect(client.query).not.toHaveBeenCalled();
  });

  it("rolls the reward query back to a savepoint when it fails", async () => {
    const queries = [];
    const client = {
      query: vi.fn(async (sql) => {
        const text = String(sql);
        queries.push(text);
        if (
          text.startsWith("SAVEPOINT") ||
          text.startsWith("RELEASE") ||
          text.startsWith("ROLLBACK")
        ) {
          return { rows: [] };
        }
        throw Object.assign(new Error('column "image_url" does not exist'), { code: "42703" });
      })
    };

    const rows = await repo.listRewardProductsForPricing(client, "shop-1", ["prod-1"]);

    expect(rows).toEqual([]);
    expect(queries[0]).toBe("SAVEPOINT sp_reward_products_for_pricing");
    expect(queries.some((sql) => sql.startsWith("ROLLBACK TO SAVEPOINT"))).toBe(true);
    expect(queries.at(-1)).toBe("RELEASE SAVEPOINT sp_reward_products_for_pricing");
  });

  it("releases the reward savepoint after a successful read", async () => {
    const queries = [];
    const client = {
      query: vi.fn(async (sql) => {
        const text = String(sql);
        queries.push(text);
        if (text.startsWith("SAVEPOINT") || text.startsWith("RELEASE")) return { rows: [] };
        return { rows: [{ id: "prod-1", price_minor_per_unit: "100" }] };
      })
    };

    const rows = await repo.listRewardProductsForPricing(client, "shop-1", ["prod-1"]);

    expect(rows).toEqual([{ id: "prod-1", price_minor_per_unit: "100" }]);
    expect(queries.at(-1)).toBe("RELEASE SAVEPOINT sp_reward_products_for_pricing");
    expect(queries.some((sql) => sql.startsWith("ROLLBACK"))).toBe(false);
  });
});

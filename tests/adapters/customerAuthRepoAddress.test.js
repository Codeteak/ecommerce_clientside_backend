import { describe, it, expect, vi } from "vitest";
import { CustomerAuthRepoPg } from "../../src/adapters/repositories/postgres/CustomerAuthRepoPg.js";

function mockClient(handlers) {
  return {
    query: vi.fn(async (sql, params) => {
      for (const h of handlers) {
        if (h.match(sql)) return h.result(sql, params);
      }
      throw new Error(`Unexpected query: ${sql}`);
    })
  };
}

describe("CustomerAuthRepoPg.clearCustomerAddress", () => {
  const repo = new CustomerAuthRepoPg();

  it("returns false when no address linked", async () => {
    const client = mockClient([
      {
        match: (sql) => sql.includes("FROM customers") && sql.includes("address_id"),
        result: () => ({ rows: [{ id: "c1", address_id: null }] })
      }
    ]);
    const ok = await repo.clearCustomerAddress(client, {
      customerId: "c1",
      userId: "u1"
    });
    expect(ok).toBe(false);
    expect(client.query).toHaveBeenCalledTimes(1);
  });

  it("unlinks and deletes when address exists", async () => {
    const queries = [];
    const client = mockClient([
      {
        match: (sql) => sql.includes("FROM customers") && sql.includes("FOR UPDATE"),
        result: () => ({
          rows: [{ id: "c1", address_id: "addr-1" }]
        })
      },
      {
        match: (sql) => sql.includes("SET address_id = NULL"),
        result: (_sql, params) => {
          queries.push({ type: "unlink", params });
          return { rows: [] };
        }
      },
      {
        match: (sql) => sql.includes("DELETE FROM addresses"),
        result: (_sql, params) => {
          queries.push({ type: "delete", params });
          return { rows: [] };
        }
      }
    ]);
    const ok = await repo.clearCustomerAddress(client, {
      customerId: "c1",
      userId: "u1"
    });
    expect(ok).toBe(true);
    expect(queries).toEqual([
      { type: "unlink", params: ["c1"] },
      { type: "delete", params: ["addr-1"] }
    ]);
  });
});

describe("CustomerAuthRepoPg.patchCustomerProfile address merge", () => {
  const repo = new CustomerAuthRepoPg();

  it("merges landmark-only patch and preserves other fields", async () => {
    const updates = [];
    const client = mockClient([
      {
        match: (sql) => sql.includes("FROM customers") && sql.includes("FOR UPDATE"),
        result: () => ({
          rows: [{ id: "c1", address_id: "addr-1", display_name: "A", status: "active" }]
        })
      },
      {
        match: (sql) => sql.includes("FROM addresses") && sql.includes("FOR UPDATE"),
        result: () => ({
          rows: [
            {
              raw: JSON.stringify({
                line1: "12 Hill",
                line2: "Apt 1",
                city: "Mumbai"
              }),
              lat: 19.1,
              lng: 72.8
            }
          ]
        })
      },
      {
        match: (sql) => sql.includes("UPDATE addresses"),
        result: (_sql, params) => {
          updates.push(params);
          return { rows: [] };
        }
      }
    ]);

    await repo.patchCustomerProfile(client, {
      customerId: "c1",
      userId: "u1",
      addressPatch: { landmark: "Near metro" }
    });

    expect(updates).toHaveLength(1);
    const [raw, lat, lng, id] = updates[0];
    expect(id).toBe("addr-1");
    expect(lat).toBe(19.1);
    expect(lng).toBe(72.8);
    expect(JSON.parse(raw)).toEqual({
      line1: "12 Hill",
      line2: "Apt 1",
      landmark: "Near metro",
      city: "Mumbai"
    });
  });

  it("clears line2 with null and replaces on create", async () => {
    const inserts = [];
    const client = mockClient([
      {
        match: (sql) => sql.includes("FROM customers") && sql.includes("FOR UPDATE"),
        result: () => ({
          rows: [{ id: "c1", address_id: null, display_name: "A", status: "active" }]
        })
      },
      {
        match: (sql) => sql.includes("INSERT INTO addresses"),
        result: (_sql, params) => {
          inserts.push(params);
          return { rows: [{ id: "new-addr" }] };
        }
      },
      {
        match: (sql) => sql.includes("SET address_id = $1"),
        result: () => ({ rows: [] })
      }
    ]);

    await repo.patchCustomerProfile(client, {
      customerId: "c1",
      userId: "u1",
      addressPatch: {
        line1: "New home",
        line2: null,
        city: "Pune",
        lat: 18.5,
        lng: 73.8
      }
    });

    expect(inserts).toHaveLength(1);
    expect(JSON.parse(inserts[0][0])).toEqual({
      line1: "New home",
      city: "Pune"
    });
  });

  it("rejects lat without lng", async () => {
    const client = mockClient([
      {
        match: (sql) => sql.includes("FROM customers"),
        result: () => ({
          rows: [{ id: "c1", address_id: null, display_name: "A", status: "active" }]
        })
      }
    ]);
    await expect(
      repo.patchCustomerProfile(client, {
        customerId: "c1",
        userId: "u1",
        addressPatch: { line1: "x", lat: 12.9 }
      })
    ).rejects.toMatchObject({ message: expect.stringMatching(/lat and lng/i) });
  });
});

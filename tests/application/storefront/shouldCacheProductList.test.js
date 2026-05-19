import { describe, expect, it } from "vitest";
import { shouldCacheProductList } from "../../../src/application/services/storefront/shouldCacheProductList.js";

describe("shouldCacheProductList", () => {
  it("caches default browsing shape", () => {
    expect(
      shouldCacheProductList({
        limit: 24,
        maxLimit: 50,
        maxOffset: 100,
        searchMinChars: 3
      })
    ).toEqual({ cache: true, reason: "eligible" });
  });

  it("skips short search", () => {
    expect(
      shouldCacheProductList({
        search: "ab",
        limit: 24
      })
    ).toEqual({ cache: false, reason: "search_too_short" });
  });

  it("skips limit above max", () => {
    expect(
      shouldCacheProductList({
        limit: 60,
        maxLimit: 50
      })
    ).toEqual({ cache: false, reason: "limit_above_max" });
  });

  it("skips high offset", () => {
    expect(
      shouldCacheProductList({
        limit: 24,
        offset: 120,
        maxOffset: 100
      })
    ).toEqual({ cache: false, reason: "offset_above_max" });
  });

  it("skips cursor pagination", () => {
    expect(
      shouldCacheProductList({
        limit: 24,
        cursor: "abc"
      })
    ).toEqual({ cache: false, reason: "cursor_pagination" });
  });
});

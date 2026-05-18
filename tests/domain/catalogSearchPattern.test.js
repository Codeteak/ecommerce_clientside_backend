import { describe, it, expect } from "vitest";
import {
  resolveCatalogSearchPattern,
  toIlikePattern,
  toPrefixIlikePattern
} from "../../src/application/services/catalog/catalogSearchPattern.js";

describe("catalogSearchPattern", () => {
  it("builds contains pattern with leading and trailing wildcards", () => {
    expect(toIlikePattern("milk")).toBe("%milk%");
  });

  it("builds prefix pattern without leading wildcard", () => {
    expect(toPrefixIlikePattern("mil")).toBe("mil%");
  });

  it("escapes special characters in prefix mode", () => {
    expect(toPrefixIlikePattern("100%")).toBe("100\\%%");
  });

  it("defaults resolveCatalogSearchPattern to contains", () => {
    expect(resolveCatalogSearchPattern("tea")).toBe("%tea%");
  });

  it("uses prefix mode when requested", () => {
    expect(resolveCatalogSearchPattern("tea", "prefix")).toBe("tea%");
  });
});

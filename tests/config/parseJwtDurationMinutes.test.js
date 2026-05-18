import { describe, it, expect } from "vitest";
import { parseJwtDurationMinutes } from "../../src/config/env/parseJwtDurationMinutes.js";

describe("parseJwtDurationMinutes", () => {
  it("parses minute, hour, and day units", () => {
    expect(parseJwtDurationMinutes("15m")).toBe(15);
    expect(parseJwtDurationMinutes("1h")).toBe(60);
    expect(parseJwtDurationMinutes("7d")).toBe(7 * 24 * 60);
  });

  it("returns null for invalid strings", () => {
    expect(parseJwtDurationMinutes("")).toBe(null);
    expect(parseJwtDurationMinutes("7x")).toBe(null);
  });
});

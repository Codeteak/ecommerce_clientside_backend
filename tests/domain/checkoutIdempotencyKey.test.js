import { describe, it, expect } from "vitest";
import { assertValidIdempotencyKey } from "../../src/application/services/checkout/checkoutInput.js";

describe("assertValidIdempotencyKey", () => {
  it("requires a non-empty key", () => {
    expect(() => assertValidIdempotencyKey("")).toThrow(
      expect.objectContaining({ code: "IDEMPOTENCY_KEY_REQUIRED" })
    );
    expect(() => assertValidIdempotencyKey(null)).toThrow(
      expect.objectContaining({ code: "IDEMPOTENCY_KEY_REQUIRED" })
    );
  });

  it("rejects keys shorter than 8 or longer than 128", () => {
    expect(() => assertValidIdempotencyKey("short")).toThrow(
      expect.objectContaining({ code: "INVALID_IDEMPOTENCY_KEY" })
    );
    expect(() => assertValidIdempotencyKey("x".repeat(129))).toThrow(
      expect.objectContaining({ code: "INVALID_IDEMPOTENCY_KEY" })
    );
  });

  it("rejects control characters", () => {
    expect(() => assertValidIdempotencyKey("checkout\nbad-key")).toThrow(
      expect.objectContaining({ code: "INVALID_IDEMPOTENCY_KEY" })
    );
  });

  it("accepts a valid key", () => {
    expect(() => assertValidIdempotencyKey("checkout-key-abcdefgh")).not.toThrow();
  });
});

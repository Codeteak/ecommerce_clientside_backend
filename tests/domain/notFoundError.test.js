import { describe, it, expect, vi } from "vitest";
import { NotFoundError } from "../../src/domain/errors/NotFoundError.js";
import { errorHandler } from "../../src/interface/http/middleware/errorHandler.js";

describe("NotFoundError via errorHandler", () => {
  it("returns 404 with { error: { code, message } } shape", () => {
    const err = new NotFoundError("Order not found");
    const req = { method: "GET", path: "/storefront/orders/x" };
    const res = {
      statusCode: 200,
      body: null,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(payload) {
        this.body = payload;
        return this;
      }
    };
    const next = vi.fn();

    errorHandler(err, req, res, next);

    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({
      error: {
        code: "NOT_FOUND",
        message: "Order not found"
      }
    });
  });
});

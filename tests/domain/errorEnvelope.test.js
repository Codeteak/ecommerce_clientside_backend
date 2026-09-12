import { describe, it, expect, vi } from "vitest";
import { errorHandler } from "../../src/interface/http/middleware/errorHandler.js";
import { AppError } from "../../src/domain/errors/AppError.js";
import { ValidationError } from "../../src/domain/errors/ValidationError.js";
import { normalizeErrorDetails } from "../../src/domain/errors/errorCodes.js";

vi.mock("../../src/infra/observability/sentry.js", () => ({
  captureApiError: vi.fn()
}));

function fakeRes() {
  return {
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
}

const req = { method: "POST", path: "/storefront/checkout" };

describe("error envelope", () => {
  it("keeps business codes and messages intact", () => {
    const res = fakeRes();
    errorHandler(new AppError("This coupon has expired.", { statusCode: 400, code: "COUPON_EXPIRED" }), req, res, vi.fn());

    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toEqual({ code: "COUPON_EXPIRED", message: "This coupon has expired." });
  });

  it("never echoes an internal error message", () => {
    const res = fakeRes();
    errorHandler(new TypeError("Cannot read properties of undefined (reading 'id')"), req, res, vi.fn());

    expect(res.statusCode).toBe(500);
    expect(res.body.error.code).toBe("INTERNAL_ERROR");
    expect(res.body.error.message).toBe("Something went wrong on our side. Please try again.");
    expect(JSON.stringify(res.body)).not.toContain("Cannot read properties");
  });

  it("translates a unique violation into a conflict without leaking the constraint", () => {
    const res = fakeRes();
    const pgErr = Object.assign(
      new Error('duplicate key value violates unique constraint "customers_phone_key"'),
      { code: "23505" }
    );
    errorHandler(pgErr, req, res, vi.fn());

    expect(res.statusCode).toBe(409);
    expect(res.body.error.code).toBe("ALREADY_EXISTS");
    expect(JSON.stringify(res.body)).not.toContain("customers_phone_key");
  });

  it("maps an invalid uuid cast to a validation error", () => {
    const res = fakeRes();
    errorHandler(Object.assign(new Error('invalid input syntax for type uuid: "abc"'), { code: "22P02" }), req, res, vi.fn());

    expect(res.statusCode).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("exposes field errors in one shape", () => {
    const res = fakeRes();
    errorHandler(
      new ValidationError("Please check the highlighted fields.", {
        formErrors: [],
        fieldErrors: { phone: ["Please enter a valid phone number."] }
      }),
      req,
      res,
      vi.fn()
    );

    expect(res.body.error.details).toEqual({
      fieldErrors: { phone: ["Please enter a valid phone number."] },
      formErrors: []
    });
  });

  it("unwraps the legacy { issues } detail wrapper", () => {
    expect(normalizeErrorDetails({ issues: { formErrors: [], fieldErrors: { shopId: ["Invalid"] } } })).toEqual({
      fieldErrors: { shopId: ["Invalid"] },
      formErrors: []
    });
  });

  it("replaces a bare status phrase with actionable copy", () => {
    const res = fakeRes();
    errorHandler(new AppError("Forbidden", { statusCode: 403, code: "FORBIDDEN" }), req, res, vi.fn());

    expect(res.body.error.message).toBe("You don't have permission to perform this action.");
  });
});

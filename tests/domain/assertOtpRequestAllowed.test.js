import { describe, it, expect } from "vitest";
import { assertOtpRequestAllowed } from "../../src/application/services/auth/assertOtpRequestAllowed.js";

describe("assertOtpRequestAllowed", () => {
  const base = {
    otpResendSeconds: 60,
    otpRequestWindowSeconds: 900,
    otpMaxRequestsPerWindow: 4,
    sentCountInWindow: 0,
    latestChallenge: null
  };

  it("allows request when under limits", () => {
    expect(() => assertOtpRequestAllowed(base)).not.toThrow();
  });

  it("blocks resend during cooldown with retryAfterSeconds", () => {
    const now = new Date("2026-05-21T12:00:00.000Z");
    expect(() =>
      assertOtpRequestAllowed({
        ...base,
        now,
        latestChallenge: {
          consumed_at: null,
          created_at: new Date("2026-05-21T11:59:30.000Z").toISOString()
        }
      })
    ).toThrow(
      expect.objectContaining({
        code: "VALIDATION_ERROR",
        details: expect.objectContaining({
          reason: "resend_cooldown",
          retryAfterSeconds: 30
        })
      })
    );
  });

  it("blocks when max requests per window reached", () => {
    expect(() =>
      assertOtpRequestAllowed({
        ...base,
        sentCountInWindow: 4
      })
    ).toThrow(
      expect.objectContaining({
        code: "VALIDATION_ERROR",
        details: expect.objectContaining({
          reason: "max_requests_per_window",
          maxRequestsPerWindow: 4,
          requestsUsed: 4
        })
      })
    );
  });

  it("allows fourth send when sentCount is 3", () => {
    expect(() =>
      assertOtpRequestAllowed({
        ...base,
        sentCountInWindow: 3
      })
    ).not.toThrow();
  });
});

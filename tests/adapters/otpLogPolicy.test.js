import { describe, it, expect } from "vitest";
import { canLogOtpCode, maskPhoneForLog } from "../../src/adapters/sms/otpLogPolicy.js";

describe("otpLogPolicy", () => {
  it("allows OTP in logs only when not production and logOtpInDev is true", () => {
    expect(canLogOtpCode({ nodeEnv: "development", logOtpInDev: true })).toBe(true);
    expect(canLogOtpCode({ nodeEnv: "test", logOtpInDev: true })).toBe(true);
    expect(canLogOtpCode({ nodeEnv: "development", logOtpInDev: false })).toBe(false);
    expect(canLogOtpCode({ nodeEnv: "production", logOtpInDev: true })).toBe(false);
    expect(canLogOtpCode({ nodeEnv: "production", logOtpInDev: false })).toBe(false);
  });

  it("masks phones keeping last 4 digits", () => {
    expect(maskPhoneForLog("919876543210")).toBe("********3210");
    expect(maskPhoneForLog("12")).toBe("****");
  });
});

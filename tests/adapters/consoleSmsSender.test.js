import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ConsoleSmsSender } from "../../src/adapters/sms/consoleSmsSender.js";

describe("ConsoleSmsSender", () => {
  let infoSpy;

  beforeEach(() => {
    infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("includes OTP code in development when logOtpInDev is true", async () => {
    const { logger } = await import("../../src/config/logger.js");
    const logSpy = vi.spyOn(logger, "info").mockImplementation(() => {});
    const sender = new ConsoleSmsSender({ nodeEnv: "development", logOtpInDev: true });
    await sender.sendOtp({ to: "919876543210", code: "4242", shopName: "Demo" });
    expect(logSpy).toHaveBeenCalled();
    const payload = logSpy.mock.calls[0][0];
    expect(payload.code).toBe("4242");
    expect(payload.phoneMasked).toBe("********3210");
    logSpy.mockRestore();
  });

  it("omits OTP code in production even if logOtpInDev is true", async () => {
    const { logger } = await import("../../src/config/logger.js");
    const logSpy = vi.spyOn(logger, "info").mockImplementation(() => {});
    const sender = new ConsoleSmsSender({ nodeEnv: "production", logOtpInDev: true });
    await sender.sendOtp({ to: "919876543210", code: "4242", shopName: "Demo" });
    const payload = logSpy.mock.calls[0][0];
    expect(payload.code).toBeUndefined();
    expect(payload.phoneMasked).toBe("********3210");
    logSpy.mockRestore();
  });

  void infoSpy;
});

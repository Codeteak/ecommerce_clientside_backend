import { describe, it, expect, vi } from "vitest";
import { normalizePhoneForMsg91, sendMsg91FlowOtp } from "../../src/infra/msg91/msg91FlowSend.js";

describe("normalizePhoneForMsg91", () => {
  it("keeps 12-digit India numbers", () => {
    expect(normalizePhoneForMsg91("+91 98765 43210")).toBe("919876543210");
    expect(normalizePhoneForMsg91("919876543210")).toBe("919876543210");
  });

  it("prefixes 10-digit Indian mobiles with 91", () => {
    expect(normalizePhoneForMsg91("9876543210")).toBe("919876543210");
  });

  it("strips leading 0 for 11-digit local format", () => {
    expect(normalizePhoneForMsg91("09876543210")).toBe("919876543210");
  });
});

describe("sendMsg91FlowOtp", () => {
  it("posts flow payload and maps VAR1/VAR2", async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ type: "success" })
    });

    await sendMsg91FlowOtp({
      authKey: "test-key",
      templateId: "tpl-1",
      mobileRaw: "+919876543210",
      otp: "123456",
      shopDisplayName: "My Shop",
      fetchFn
    });

    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [, init] = fetchFn.mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body.template_id).toBe("tpl-1");
    expect(body.recipients).toEqual([
      { mobiles: "919876543210", VAR1: "123456", VAR2: "My Shop" }
    ]);
    expect(init.headers.authkey).toBe("test-key");
  });

  it("throws on HTTP error", async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => JSON.stringify({ message: "bad key" })
    });

    await expect(
      sendMsg91FlowOtp({
        authKey: "x",
        templateId: "t",
        mobileRaw: "9876543210",
        otp: "111111",
        shopDisplayName: "S",
        fetchFn
      })
    ).rejects.toThrow(/MSG91 HTTP 401/);
  });

  it("throws on HTTP 200 with non-JSON body", async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => "<html>error</html>"
    });

    await expect(
      sendMsg91FlowOtp({
        authKey: "k",
        templateId: "t",
        mobileRaw: "9876543210",
        otp: "111111",
        shopDisplayName: "S",
        fetchFn
      })
    ).rejects.toThrow(/non-JSON/);
  });
});

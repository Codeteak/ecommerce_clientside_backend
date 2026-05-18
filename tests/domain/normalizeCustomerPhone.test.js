import { describe, it, expect } from "vitest";
import {
  formatCustomerPhoneForSms,
  normalizeCustomerPhoneForStorage
} from "../../src/domain/phone/normalizeCustomerPhone.js";
import { ValidationError } from "../../src/domain/errors/ValidationError.js";

describe("normalizeCustomerPhoneForStorage", () => {
  it("stores last 10 digits from +91 input", () => {
    expect(normalizeCustomerPhoneForStorage("+91 98765-43210")).toBe("9876543210");
    expect(normalizeCustomerPhoneForStorage("919876543210")).toBe("9876543210");
  });

  it("accepts plain 10-digit Indian mobile", () => {
    expect(normalizeCustomerPhoneForStorage("9876543210")).toBe("9876543210");
  });

  it("strips leading 0", () => {
    expect(normalizeCustomerPhoneForStorage("09876543210")).toBe("9876543210");
  });

  it("rejects invalid numbers", () => {
    expect(() => normalizeCustomerPhoneForStorage("12345")).toThrow(ValidationError);
    expect(() => normalizeCustomerPhoneForStorage("+911234")).toThrow(ValidationError);
  });

  it("rejects when last 10 digits do not start with 6-9", () => {
    expect(() => normalizeCustomerPhoneForStorage("+911234567890")).toThrow(ValidationError);
    expect(() => normalizeCustomerPhoneForStorage("915123456789")).toThrow(ValidationError);
    expect(() => normalizeCustomerPhoneForStorage("5123456789")).toThrow(ValidationError);
    expect(() => normalizeCustomerPhoneForStorage("01234567890")).toThrow(ValidationError);
  });

  it("accepts each valid leading digit 6 through 9", () => {
    expect(normalizeCustomerPhoneForStorage("6123456789")).toBe("6123456789");
    expect(normalizeCustomerPhoneForStorage("7123456789")).toBe("7123456789");
    expect(normalizeCustomerPhoneForStorage("8123456789")).toBe("8123456789");
    expect(normalizeCustomerPhoneForStorage("9123456789")).toBe("9123456789");
  });
});

describe("formatCustomerPhoneForSms", () => {
  it("prefixes 91 for MSG91", () => {
    expect(formatCustomerPhoneForSms("9876543210")).toBe("919876543210");
  });
});

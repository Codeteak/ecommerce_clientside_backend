import { SmsSender } from "../../application/ports/SmsSender.js";
import { logger } from "../../config/logger.js";

function maskPhone(phone) {
  const p = String(phone || "");
  if (p.length <= 4) return "****";
  return `${"*".repeat(Math.max(0, p.length - 4))}${p.slice(-4)}`;
}

export class ConsoleSmsSender extends SmsSender {
  constructor({ logOtpInDev = true, nodeEnv = "development" } = {}) {
    super();
    this.logOtpInDev = logOtpInDev;
    this.nodeEnv = nodeEnv;
  }

  async sendOtp({ to, code, shopName }) {
    const payload = {
      event: "api.auth.otp.sent",
      provider: "console",
      phoneMasked: maskPhone(to),
      shopName: shopName ? String(shopName).slice(0, 80) : undefined
    };
    if (this.nodeEnv !== "production" && this.logOtpInDev) {
      payload.code = code;
    }
    logger.info(payload, "OTP sent (console sender)");
  }
}

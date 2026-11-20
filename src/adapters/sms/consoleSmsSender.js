import { SmsSender } from "../../application/ports/SmsSender.js";
import { logger } from "../../config/logger.js";
import { canLogOtpCode, maskPhoneForLog } from "./otpLogPolicy.js";

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
      phoneMasked: maskPhoneForLog(to),
      shopName: shopName ? String(shopName).slice(0, 80) : undefined
    };
    if (canLogOtpCode({ nodeEnv: this.nodeEnv, logOtpInDev: this.logOtpInDev })) {
      payload.code = code;
    }
    logger.info(payload, "OTP sent (console sender)");
  }
}

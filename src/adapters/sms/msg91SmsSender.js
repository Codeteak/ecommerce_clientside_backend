import { SmsSender } from "../../application/ports/SmsSender.js";
import { sendMsg91FlowOtp } from "../../infra/msg91/msg91FlowSend.js";
import { ServiceUnavailableError } from "../../domain/errors/ServiceUnavailableError.js";
import { logger } from "../../config/logger.js";
import { canLogOtpCode, maskPhoneForLog } from "./otpLogPolicy.js";

export class Msg91SmsSender extends SmsSender {
  /**
   * @param {object} opts
   * @param {string} opts.authKey
   * @param {string} opts.templateId
   * @param {string} [opts.shortUrl="0"]
   * @param {number} [opts.timeoutMs=15000]
   * @param {string} [opts.nodeEnv="development"]
   * @param {boolean} [opts.logOtpInDev=false]
   */
  constructor({
    authKey,
    templateId,
    shortUrl = "0",
    timeoutMs = 15_000,
    nodeEnv = "development",
    logOtpInDev = false
  }) {
    super();
    this.authKey = authKey;
    this.templateId = templateId;
    this.shortUrl = shortUrl;
    this.timeoutMs = timeoutMs;
    this.nodeEnv = nodeEnv;
    this.logOtpInDev = logOtpInDev;
  }

  async sendOtp(input) {
    const { to, code, shopName } = input;
    try {
      await sendMsg91FlowOtp({
        authKey: this.authKey,
        templateId: this.templateId,
        mobileRaw: to,
        otp: String(code),
        shopDisplayName: shopName && String(shopName).trim() ? String(shopName).trim() : "our store",
        shortUrl: this.shortUrl,
        timeoutMs: this.timeoutMs
      });
      const payload = {
        event: "api.auth.otp.sent",
        provider: "msg91",
        phoneMasked: maskPhoneForLog(to),
        templateId: this.templateId,
        shopName: shopName ? String(shopName).slice(0, 80) : undefined
      };
      if (canLogOtpCode({ nodeEnv: this.nodeEnv, logOtpInDev: this.logOtpInDev })) {
        payload.code = String(code);
      }
      logger.info(payload, "OTP sent (msg91 sender)");
    } catch (err) {
      logger.warn(
        {
          err: err?.message,
          event: "api.auth.otp.msg91.failed",
          templateId: this.templateId,
          phoneMasked: maskPhoneForLog(to)
        },
        "MSG91 OTP send failed"
      );
      throw new ServiceUnavailableError("Unable to send OTP. Please try again shortly.", {
        reason: "msg91_send_failed"
      });
    }
  }
}

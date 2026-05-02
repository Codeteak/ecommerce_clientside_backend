import { SmsSender } from "../../application/ports/SmsSender.js";
import { sendMsg91FlowOtp } from "../../infra/msg91/msg91FlowSend.js";
import { ServiceUnavailableError } from "../../domain/errors/ServiceUnavailableError.js";
import { logger } from "../../config/logger.js";

export class Msg91SmsSender extends SmsSender {
  /**
   * @param {object} opts
   * @param {string} opts.authKey
   * @param {string} opts.templateId — MSG91 Flow OTP template id (`OTP_TEMPLATE_ID`, DLT)
   * @param {string} [opts.shortUrl="0"] — MSG91 short URL flag
   * @param {number} [opts.timeoutMs=15000]
   */
  constructor({ authKey, templateId, shortUrl = "0", timeoutMs = 15_000 }) {
    super();
    this.authKey = authKey;
    this.templateId = templateId;
    this.shortUrl = shortUrl;
    this.timeoutMs = timeoutMs;
  }

  /**
   * @param {{ to: string, code: string, shopName?: string | null }} input
   */
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
    } catch (err) {
      logger.warn(
        {
          err: err?.message,
          event: "api.auth.otp.msg91.failed",
          templateId: this.templateId
        },
        "MSG91 OTP send failed"
      );
      throw new ServiceUnavailableError("Unable to send OTP. Please try again shortly.", {
        reason: "msg91_send_failed"
      });
    }
  }
}

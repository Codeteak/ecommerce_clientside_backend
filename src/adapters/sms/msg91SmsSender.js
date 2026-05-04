import { SmsSender } from "../../application/ports/SmsSender.js";
import { sendMsg91FlowOtp } from "../../infra/msg91/msg91FlowSend.js";
import { ServiceUnavailableError } from "../../domain/errors/ServiceUnavailableError.js";
import { logger } from "../../config/logger.js";

export class Msg91SmsSender extends SmsSender {
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

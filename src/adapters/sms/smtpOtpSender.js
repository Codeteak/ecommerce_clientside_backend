import nodemailer from "nodemailer";
import { SmsSender } from "../../application/ports/SmsSender.js";
import { logger } from "../../config/logger.js";
import { withRetry } from "../../utils/withRetry.js";

export class SmtpOtpSender extends SmsSender {
  constructor({
    host,
    port = 587,
    user,
    pass,
    fromEmail,
    secure = false
  }) {
    super();
    this.fromEmail = fromEmail;
    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: {
        user,
        pass
      }
    });
  }

  async sendOtp({ to, code }) {
    const info = await withRetry(
      () =>
        this.transporter.sendMail({
          from: this.fromEmail,
          to,
          subject: "Your OTP Code",
          text: `Your OTP code is ${code}. This code expires soon.`
        }),
      {
        attempts: 3,
        baseDelayMs: 200,
        maxDelayMs: 2000,
        event: "smtp_send_retry",
        context: { recipient: to }
      }
    );

    const rejected = Array.isArray(info?.rejected) ? info.rejected : [];
    if (rejected.length > 0) {
      throw new Error(`SMTP rejected OTP recipient: ${rejected.join(", ")}`);
    }

    logger.info(
      {
        event: "api.auth.otp.sent",
        provider: "smtp",
        recipient: to
      },
      "OTP sent (smtp sender)"
    );
  }
}

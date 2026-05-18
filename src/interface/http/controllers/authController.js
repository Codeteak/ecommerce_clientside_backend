import { withClient, withTx } from "../../../infra/db/tx.js";
import { logSecurityEvent } from "../../../infra/logging/apiLog.js";
import { AppError } from "../../../domain/errors/AppError.js";
import { asyncHandler } from "../asyncHandler.js";

/**
 * Purpose: This file handles authentication HTTP endpoints.
 * OTP login handlers.
 */
function withSecurityAudit(successEvent, failureEvent, successMeta, handler) {
  return asyncHandler(async (req, res) => {
    try {
      const out = await handler(req, res);
      logSecurityEvent(successEvent, req, successMeta?.(req, out) ?? {});
      res.json(out);
    } catch (err) {
      const level = err instanceof AppError ? "warn" : "error";
      logSecurityEvent(
        failureEvent,
        req,
        {
          code: err?.code || "INTERNAL_ERROR",
          message: err?.message
        },
        level
      );
      throw err;
    }
  });
}

function otpRequestHandler(ctx) {
  return withSecurityAudit(
    "otp.requested",
    "otp.request.failed",
    (req) => ({ phone: req.body?.phone ? "provided" : "missing" }),
    (req) => withClient((client) => ctx.requestCustomerOtp(client, req.body))
  );
}

function otpVerifyHandler(ctx) {
  return withSecurityAudit("otp.verified", "otp.verify.failed", null, (req) =>
    withTx((client) =>
      ctx.verifyCustomerOtp(client, {
        ...req.body,
        ip: req.ip,
        userAgent: req.get("user-agent") || null
      })
    )
  );
}

function emailOtpRequestHandler(ctx) {
  return withSecurityAudit(
    "otp.email.requested",
    "otp.email.request.failed",
    (req) => ({ email: req.body?.email ? "provided" : "missing" }),
    (req) => withClient((client) => ctx.requestCustomerEmailOtp(client, req.body))
  );
}

function emailOtpVerifyHandler(ctx) {
  return withSecurityAudit("otp.email.verified", "otp.email.verify.failed", null, (req) =>
    withTx((client) =>
      ctx.verifyCustomerEmailOtp(client, {
        ...req.body,
        ip: req.ip,
        userAgent: req.get("user-agent") || null
      })
    )
  );
}

function refreshHandler(ctx) {
  return withSecurityAudit("auth.refresh.succeeded", "auth.refresh.failed", null, (req) =>
    withTx((client) =>
      ctx.rotateCustomerRefreshToken(client, {
        refreshToken: req.body.refreshToken,
        ip: req.ip,
        userAgent: req.get("user-agent") || null
      })
    )
  );
}

function logoutHandler(ctx) {
  return withSecurityAudit("auth.logout", "auth.logout.failed", null, (req) => {
    const raw = req.headers.authorization || "";
    const accessToken = raw.startsWith("Bearer ") ? raw.slice(7).trim() : "";
    return withTx((client) =>
      ctx.logoutCustomer(client, {
        accessToken,
        refreshToken: req.body?.refreshToken ?? null
      })
    );
  });
}

export const authController = {
  otpRequest: (ctx) => otpRequestHandler(ctx),
  otpVerify: (ctx) => otpVerifyHandler(ctx),
  refresh: (ctx) => refreshHandler(ctx),
  emailOtpRequest: (ctx) => emailOtpRequestHandler(ctx),
  emailOtpVerify: (ctx) => emailOtpVerifyHandler(ctx),
  logout: (ctx) => logoutHandler(ctx),

  forCtx(ctx) {
    return {
      otpRequest: otpRequestHandler(ctx),
      otpVerify: otpVerifyHandler(ctx),
      refresh: refreshHandler(ctx),
      emailOtpRequest: emailOtpRequestHandler(ctx),
      emailOtpVerify: emailOtpVerifyHandler(ctx),
      logout: logoutHandler(ctx)
    };
  }
};

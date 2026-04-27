import { withClient, withTx } from "../../../infra/db/tx.js";
import { logSecurityEvent } from "../../../infra/logging/apiLog.js";
import { AppError } from "../../../domain/errors/AppError.js";

/**
 * Purpose: This file handles authentication HTTP endpoints.
 * OTP login handlers.
 */
function otpRequestHandler(ctx) {
  return async (req, res, next) => {
    try {
      const out = await withClient((client) => ctx.requestCustomerOtp(client, req.body));
      logSecurityEvent("otp.requested", req, { phone: req.body?.phone ? "provided" : "missing" });
      res.json(out);
    } catch (err) {
      const level = err instanceof AppError ? "warn" : "error";
      logSecurityEvent(
        "otp.request.failed",
        req,
        {
          code: err?.code || "INTERNAL_ERROR",
          message: err?.message
        },
        level
      );
      next(err);
    }
  };
}

function otpVerifyHandler(ctx) {
  return async (req, res, next) => {
    try {
      const out = await withTx((client) =>
        ctx.verifyCustomerOtp(client, {
          ...req.body,
          ip: req.ip,
          userAgent: req.get("user-agent") || null
        })
      );
      logSecurityEvent("otp.verified", req);
      res.json(out);
    } catch (err) {
      const level = err instanceof AppError ? "warn" : "error";
      logSecurityEvent(
        "otp.verify.failed",
        req,
        {
          code: err?.code || "INTERNAL_ERROR",
          message: err?.message
        },
        level
      );
      next(err);
    }
  };
}

//  funciton for requesting email OTP
function emailOtpRequestHandler(ctx) {
  return async (req, res, next) => {
    try {
      const out = await withClient((client) => ctx.requestCustomerEmailOtp(client, req.body));
      logSecurityEvent("otp.email.requested", req, { email: req.body?.email ? "provided" : "missing" });
      res.json(out);
    } catch (err) {
      const level = err instanceof AppError ? "warn" : "error";
      logSecurityEvent(
        "otp.email.request.failed",
        req,
        {
          code: err?.code || "INTERNAL_ERROR",
          message: err?.message
        },
        level
      );
      next(err);
    }
  };
}

function emailOtpVerifyHandler(ctx) {
  return async (req, res, next) => {
    try {
      const out = await withTx((client) =>
        ctx.verifyCustomerEmailOtp(client, {
          ...req.body,
          ip: req.ip,
          userAgent: req.get("user-agent") || null
        })
      );
      logSecurityEvent("otp.email.verified", req);
      res.json(out);
    } catch (err) {
      const level = err instanceof AppError ? "warn" : "error";
      logSecurityEvent(
        "otp.email.verify.failed",
        req,
        {
          code: err?.code || "INTERNAL_ERROR",
          message: err?.message
        },
        level
      );
      next(err);
    }
  };
}

export const authController = {
  otpRequest: (ctx) => otpRequestHandler(ctx),
  otpVerify: (ctx) => otpVerifyHandler(ctx),
  emailOtpRequest: (ctx) => emailOtpRequestHandler(ctx),
  emailOtpVerify: (ctx) => emailOtpVerifyHandler(ctx),

  forCtx(ctx) {
    return {
      otpRequest: otpRequestHandler(ctx),
      otpVerify: otpVerifyHandler(ctx),
      emailOtpRequest: emailOtpRequestHandler(ctx),
      emailOtpVerify: emailOtpVerifyHandler(ctx)
    };
  }
};

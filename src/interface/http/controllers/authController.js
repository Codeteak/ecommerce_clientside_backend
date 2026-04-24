import { withClient, withTx } from "../../../infra/db/tx.js";
import { oauthExchangeCookieOptions, verifyOAuthExchangeCookie } from "../../../infra/oauth/oauthExchangeCookie.js";
import { logSecurityEvent } from "../../../infra/logging/apiLog.js";
import { AppError } from "../../../domain/errors/AppError.js";

/**
 * Purpose: This file handles authentication HTTP endpoints.
 * OAuth JWT exchange and OTP login handlers.
 */
function oauthJwtHandler(ctx) {
  return async (req, res, next) => {
    const cookieOpts = oauthExchangeCookieOptions();
    try {
      const rawCookie = req.cookies?.storefront_oauth_exchange;
      if (rawCookie) {
        try {
          const payload = verifyOAuthExchangeCookie(rawCookie);
          const result = await withClient((client) =>
            ctx.buildStorefrontSessionResponse(client, payload.sub, {
              ip: req.ip,
              userAgent: req.get("user-agent") || null
            })
          );
          res.clearCookie("storefront_oauth_exchange", cookieOpts);
          return res.json(result);
        } catch {
          res.clearCookie("storefront_oauth_exchange", cookieOpts);
          return res.status(401).json({
            error: {
              code: "UNAUTHORIZED",
              message:
                "OAuth exchange cookie expired or invalid. Complete Google sign-in again."
            }
          });
        }
      }
      return res.status(401).json({
        error: {
          code: "UNAUTHORIZED",
          message: "Missing storefront_oauth_exchange cookie. Complete Google sign-in first."
        }
      });
    } catch (err) {
      next(err);
    }
  };
}

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
  oauthJwt: (ctx) => oauthJwtHandler(ctx),

  forCtx(ctx) {
    return {
      otpRequest: otpRequestHandler(ctx),
      otpVerify: otpVerifyHandler(ctx),
      emailOtpRequest: emailOtpRequestHandler(ctx),
      emailOtpVerify: emailOtpVerifyHandler(ctx),
      oauthJwt: oauthJwtHandler(ctx)
    };
  }
};

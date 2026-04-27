// Purpose: Customer auth JSON routes.

export function mountAuthRoutes(r, deps) {
  const {
    authLimiter,
    otpRequestLimiter,
    otpVerifyLimiter,
    validate,
    handlers,
    otpRequestBodySchema,
    otpVerifyBodySchema,
    emailOtpRequestBodySchema,
    emailOtpVerifyBodySchema
  } = deps;

  r.post(
    "/api/auth/otp/request",
    otpRequestLimiter ?? authLimiter,
    validate({ body: otpRequestBodySchema }),
    handlers.otpRequest
  );
  r.post(
    "/api/auth/otp/verify",
    otpVerifyLimiter ?? authLimiter,
    validate({ body: otpVerifyBodySchema }),
    handlers.otpVerify
  );
  r.post(
    "/api/auth/email-otp/request",
    otpRequestLimiter ?? authLimiter,
    validate({ body: emailOtpRequestBodySchema }),
    handlers.emailOtpRequest
  );
  r.post(
    "/api/auth/email-otp/verify",
    otpVerifyLimiter ?? authLimiter,
    validate({ body: emailOtpVerifyBodySchema }),
    handlers.emailOtpVerify
  );
}

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
    refreshTokenBodySchema,
    logoutBodySchema
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
    "/api/auth/refresh",
    otpVerifyLimiter ?? authLimiter,
    validate({ body: refreshTokenBodySchema }),
    handlers.refresh
  );
  r.post(
    "/api/auth/logout",
    authLimiter,
    validate({ body: logoutBodySchema }),
    handlers.logout
  );
}

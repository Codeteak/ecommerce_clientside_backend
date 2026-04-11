// Schemas and shared parameters for OpenAPI (Swagger) documentation.

export const parameters = {
  XShopId: {
    name: "x-shop-id",
    in: "header",
    description:
      "Tenant shop UUID for cross-origin API clients. Also resolved from storefront host (subdomain/custom domain) when applicable.",
    schema: { type: "string", format: "uuid" }
  },
  Slug: {
    name: "slug",
    in: "path",
    required: true,
    schema: { type: "string", minLength: 1, maxLength: 128 }
  },
  CartItemId: {
    name: "itemId",
    in: "path",
    required: true,
    schema: { type: "string", format: "uuid" }
  },
  OrderId: {
    name: "id",
    in: "path",
    required: true,
    schema: { type: "string", format: "uuid" }
  },
  IdempotencyKey: {
    name: "Idempotency-Key",
    in: "header",
    required: false,
    description:
      "Optional. Send the same value on retries so duplicate checkouts are not created (8–128 characters).",
    schema: { type: "string", minLength: 8, maxLength: 128 }
  },
  OrdersLimit: {
    name: "limit",
    in: "query",
    required: false,
    description: "Max orders to return (1–100, default 50).",
    schema: { type: "integer", minimum: 1, maximum: 100, default: 50 }
  }
};

export const schemas = {
  Error: {
    type: "object",
    properties: {
      error: {
        type: "object",
        properties: {
          code: { type: "string" },
          message: { type: "string" },
          details: {}
        },
        required: ["code", "message"]
      }
    },
    required: ["error"]
  },
  OauthJwtRequest: {
    type: "object",
    additionalProperties: false,
    properties: {
      shopId: { type: "string", format: "uuid" }
    }
  },
  OtpRequestBody: {
    type: "object",
    required: ["phone", "shopId"],
    additionalProperties: false,
    properties: {
      phone: { type: "string", pattern: "^[0-9+][0-9]{7,31}$" },
      shopId: { type: "string", format: "uuid" }
    }
  },
  OtpVerifyBody: {
    type: "object",
    required: ["phone", "shopId", "code"],
    additionalProperties: false,
    properties: {
      phone: { type: "string", pattern: "^[0-9+][0-9]{7,31}$" },
      shopId: { type: "string", format: "uuid" },
      code: { type: "string", pattern: "^\\d{6}$" }
    }
  },
  OtpRequestResponse: {
    type: "object",
    properties: {
      ok: { type: "boolean" },
      message: { type: "string" }
    }
  },
  SessionResponse: {
    type: "object",
    properties: {
      accessToken: { type: "string" },
      role: { type: "string", example: "customer" },
      user: { type: "object" },
      customer: { type: "object" },
      shopIds: { type: "array", items: { type: "string", format: "uuid" } },
      shop: { type: "object" }
    }
  },
  ProfileResponse: {
    type: "object",
    properties: {
      user: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          name: { type: "string", nullable: true },
          email: { type: "string", format: "email", nullable: true },
          phone: { type: "string", nullable: true }
        }
      },
      customer: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          displayName: { type: "string", nullable: true }
        }
      },
      address: { oneOf: [{ $ref: "#/components/schemas/StorefrontAddress" }, { type: "null" }] }
    }
  },
  PatchProfileRequest: {
    type: "object",
    additionalProperties: false,
    properties: {
      name: { type: "string", maxLength: 120, nullable: true },
      displayName: { type: "string", maxLength: 120, nullable: true },
      email: { type: "string", format: "email", nullable: true },
      phone: { type: "string", maxLength: 32, nullable: true },
      address: {
        type: "object",
        additionalProperties: false,
        properties: {
          line1: { type: "string", maxLength: 500, nullable: true },
          line2: { type: "string", maxLength: 500, nullable: true },
          landmark: { type: "string", maxLength: 500, nullable: true },
          city: { type: "string", maxLength: 200, nullable: true },
          state: { type: "string", maxLength: 200, nullable: true },
          postalCode: { type: "string", maxLength: 32, nullable: true },
          country: { type: "string", maxLength: 200, nullable: true },
          lat: { type: "number", minimum: -90, maximum: 90, nullable: true },
          lng: { type: "number", minimum: -180, maximum: 180, nullable: true },
          raw: { type: "string", maxLength: 8000, nullable: true }
        }
      }
    }
  },
  LocationCheckRequest: {
    type: "object",
    required: ["lat", "lng"],
    additionalProperties: false,
    properties: {
      lat: { type: "number", minimum: -90, maximum: 90 },
      lng: { type: "number", minimum: -180, maximum: 180 }
    }
  },
  LocationCheckResponse: {
    type: "object",
    properties: {
      serviceable: { type: "boolean" },
      distanceM: { type: "integer", nullable: true },
      maxRadiusM: { type: "integer", nullable: true }
    }
  },
  StorefrontAddress: {
    type: "object",
    properties: {
      id: { type: "string", format: "uuid" },
      line1: { type: "string" },
      line2: { type: "string", nullable: true },
      landmark: { type: "string", nullable: true },
      city: { type: "string", nullable: true },
      state: { type: "string", nullable: true },
      postalCode: { type: "string", nullable: true },
      country: { type: "string", nullable: true },
      lat: { type: "number", nullable: true },
      lng: { type: "number", nullable: true },
      raw: { type: "string", nullable: true }
    }
  },
  AddressPostRequest: {
    type: "object",
    required: ["line1"],
    properties: {
      line1: { type: "string", minLength: 1, maxLength: 200 },
      line2: { type: "string", maxLength: 200, nullable: true },
      landmark: { type: "string", maxLength: 200, nullable: true },
      city: { type: "string", maxLength: 120, nullable: true },
      state: { type: "string", maxLength: 120, nullable: true },
      postalCode: { type: "string", maxLength: 32, nullable: true },
      country: { type: "string", maxLength: 120, nullable: true },
      lat: { type: "number", minimum: -90, maximum: 90, nullable: true },
      lng: { type: "number", minimum: -180, maximum: 180, nullable: true },
      raw: { type: "string", maxLength: 2000, nullable: true }
    }
  },
  StorefrontProfilePost: {
    type: "object",
    properties: {
      displayName: { type: "string", maxLength: 120, nullable: true },
      phone: { type: "string", maxLength: 32, nullable: true }
    },
    description: "At least one of displayName or phone required"
  },
  CartItemBody: {
    type: "object",
    required: ["productId", "quantity"],
    properties: {
      productId: { type: "string", format: "uuid" },
      quantity: { type: "number", exclusiveMinimum: 0 }
    }
  },
  CartItemPatch: {
    type: "object",
    required: ["quantity"],
    properties: {
      quantity: { type: "number", exclusiveMinimum: 0 }
    }
  },
  CheckoutBody: {
    type: "object",
    required: ["addressId"],
    properties: {
      addressId: { type: "string", format: "uuid" },
      notes: { type: "string", maxLength: 2000, nullable: true }
    }
  },
  SocialSignInBody: {
    type: "object",
    required: ["provider"],
    additionalProperties: false,
    properties: {
      provider: { type: "string", enum: ["google"] },
      disableRedirect: { type: "boolean" },
      callbackURL: { type: "string", format: "uri" },
      additionalData: {
        type: "object",
        additionalProperties: false,
        properties: {
          shopId: {
            type: "string",
            format: "uuid",
            description: "Optional if `x-shop-id` is sent; header wins when both are present."
          }
        }
      }
    }
  },
  OauthUrlResponse: {
    type: "object",
    properties: {
      url: { type: "string", format: "uri" }
    }
  }
};

// Purpose: Defines OpenAPI path operations, request params, and responses for all public API endpoints.
import { parameters as P } from "./components.js";

const jsonErr = {
  description: "Error",
  content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } }
};

const shopParams = [P.XShopId];

export function buildPaths() {
  return {
    "/": {
      get: {
        tags: ["Root"],
        summary: "Service info",
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    ok: { type: "boolean" },
                    service: { type: "string" },
                    health: { type: "string" },
                    openapi: { type: "string" },
                    swaggerUi: { type: "string" }
                  }
                }
              }
            }
          },
          "500": jsonErr
        }
      }
    },
    "/health": {
      get: {
        tags: ["Root"],
        summary: "Health check",
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string", example: "ok" },
                    service: { type: "string" }
                  }
                }
              }
            }
          },
          "500": jsonErr
        }
      }
    },
    "/api/auth/oauth/jwt": {
      post: {
        tags: ["Auth"],
        summary: "Exchange OAuth cookie for JWT",
        description: "Requires a valid `storefront_oauth_exchange` cookie from Google OAuth callback.",
        parameters: [P.XShopId],
        requestBody: {
          content: { "application/json": { schema: { $ref: "#/components/schemas/OauthJwtRequest" } } }
        },
        responses: {
          "200": {
            description: "OK",
            content: { "application/json": { schema: { $ref: "#/components/schemas/SessionResponse" } } }
          },
          "400": jsonErr,
          "401": jsonErr,
          "429": jsonErr
        }
      }
    },
    "/api/auth/otp/request": {
      post: {
        tags: ["Auth"],
        summary: "Request customer OTP",
        description: "Creates an OTP challenge for `{ phone, shopId }` and sends OTP through configured sender.",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/OtpRequestBody" } } }
        },
        responses: {
          "200": {
            description: "OK",
            content: { "application/json": { schema: { $ref: "#/components/schemas/OtpRequestResponse" } } }
          },
          "400": jsonErr,
          "404": jsonErr,
          "429": jsonErr
        }
      }
    },
    "/api/auth/otp/verify": {
      post: {
        tags: ["Auth"],
        summary: "Verify customer OTP and issue JWT session",
        description: "Verifies `{ phone, shopId, code }`, consumes challenge, and returns customer session JWT payload.",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/OtpVerifyBody" } } }
        },
        responses: {
          "200": {
            description: "OK",
            content: { "application/json": { schema: { $ref: "#/components/schemas/SessionResponse" } } }
          },
          "400": jsonErr,
          "401": jsonErr,
          "404": jsonErr,
          "429": jsonErr
        }
      }
    },
    "/api/oauth/sign-in/social": {
      post: {
        tags: ["OAuth"],
        summary: "Start Google OAuth",
        description:
          "Starts Google OAuth flow. Use `x-shop-id` header for tenant context (or `additionalData.shopId` in body).",
        parameters: [P.XShopId],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/SocialSignInBody" } } }
        },
        responses: {
          "200": {
            description: "Authorize URL (when disableRedirect true)",
            content: { "application/json": { schema: { $ref: "#/components/schemas/OauthUrlResponse" } } }
          },
          "302": { description: "Redirect to Google" },
          "400": jsonErr,
          "429": jsonErr,
          "503": jsonErr
        }
      }
    },
    "/api/oauth/callback/google": {
      get: {
        tags: ["OAuth"],
        summary: "Google OAuth callback",
        description:
          "Google redirect URI. On success sets `storefront_oauth_exchange` cookie and redirects to callback URL.",
        parameters: [
          { name: "code", in: "query", schema: { type: "string" } },
          { name: "state", in: "query", schema: { type: "string" } },
          { name: "error", in: "query", schema: { type: "string" } },
          { name: "error_description", in: "query", schema: { type: "string" } }
        ],
        responses: {
          "302": { description: "Redirect to callback; sets storefront_oauth_exchange cookie" },
          "400": jsonErr,
          "401": jsonErr,
          "429": jsonErr,
          "503": jsonErr
        }
      }
    },
    "/api/me/profile": {
      get: {
        tags: ["Profile"],
        summary: "Get customer profile",
        description: "Returns current authenticated customer profile and linked address.",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    customer: { type: "object" },
                    address: { oneOf: [{ $ref: "#/components/schemas/StorefrontAddress" }, { type: "null" }] }
                  }
                }
              }
            }
          },
          "401": jsonErr,
          "404": jsonErr
        }
      },
      patch: {
        tags: ["Profile"],
        summary: "Patch customer profile",
        description: "Partial profile update for authenticated customer.",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/PatchProfileRequest" } } }
        },
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    customer: { type: "object" },
                    address: {}
                  }
                }
              }
            }
          },
          "400": jsonErr,
          "401": jsonErr,
          "404": jsonErr
        }
      }
    },
    "/storefront/location/check": {
      post: {
        tags: ["Storefront"],
        summary: "Check delivery service area",
        description: "Checks whether given coordinates are serviceable for the resolved shop.",
        parameters: [...shopParams],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/LocationCheckRequest" } } }
        },
        responses: {
          "200": {
            description: "OK",
            content: { "application/json": { schema: { $ref: "#/components/schemas/LocationCheckResponse" } } }
          },
          "400": jsonErr,
          "404": jsonErr,
          "429": jsonErr
        }
      }
    },
    "/storefront/categories": {
      get: {
        tags: ["Storefront catalog"],
        summary: "List categories",
        parameters: [
          ...shopParams,
          {
            name: "parent_id",
            in: "query",
            schema: { type: "string", format: "uuid" }
          }
        ],
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: { type: "object", properties: { categories: { type: "array", items: { type: "object" } } } }
              }
            }
          },
          "400": jsonErr
        }
      }
    },
    "/storefront/products": {
      get: {
        tags: ["Storefront catalog"],
        summary: "List products (cursor page)",
        description:
          "Returns products with product thumbnail image and embedded category object (`parent_id`, `name`, `slug`, `image`). Supports filtering and sorting.",
        parameters: [
          ...shopParams,
          { name: "category_id", in: "query", schema: { type: "string", format: "uuid" } },
          { name: "brand_id", in: "query", schema: { type: "string", format: "uuid" } },
          { name: "search", in: "query", schema: { type: "string" } },
          { name: "min_price_minor", in: "query", schema: { type: "integer", minimum: 0 } },
          { name: "max_price_minor", in: "query", schema: { type: "integer", minimum: 0 } },
          { name: "sort_by", in: "query", schema: { type: "string", enum: ["price", "created_at", "name"] } },
          { name: "sort_order", in: "query", schema: { type: "string", enum: ["asc", "desc"] } },
          { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100 } },
          {
            name: "cursor",
            in: "query",
            description: "Supported only with sort_by=created_at.",
            schema: { type: "string" }
          },
          {
            name: "availability",
            in: "query",
            schema: { type: "string", enum: ["in_stock", "out_of_stock", "unknown"] }
          }
        ],
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    products: { type: "array", items: { type: "object" } },
                    nextCursor: { type: "string", nullable: true }
                  }
                }
              }
            }
          },
          "400": jsonErr
        }
      }
    },
    "/storefront/products/{slug}": {
      get: {
        tags: ["Storefront catalog"],
        summary: "Product by slug",
        parameters: [...shopParams, P.Slug],
        responses: {
          "200": {
            description: "OK",
            content: { "application/json": { schema: { type: "object" } } }
          },
          "400": jsonErr,
          "404": jsonErr
        }
      }
    },
    "/storefront/cart": {
      post: {
        tags: ["Storefront cart"],
        summary: "Create or get cart",
        security: [{ bearerAuth: [] }],
        parameters: [...shopParams],
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    cartId: { type: "string", format: "uuid" },
                    shopId: { type: "string", format: "uuid" }
                  }
                }
              }
            }
          },
          "400": jsonErr,
          "401": jsonErr
        }
      },
      get: {
        tags: ["Storefront cart"],
        summary: "Get cart with items",
        security: [{ bearerAuth: [] }],
        parameters: [...shopParams],
        responses: {
          "200": {
            description: "OK",
            content: { "application/json": { schema: { type: "object" } } }
          },
          "400": jsonErr,
          "401": jsonErr
        }
      }
    },
    "/storefront/cart/items": {
      post: {
        tags: ["Storefront cart"],
        summary: "Add cart line",
        security: [{ bearerAuth: [] }],
        parameters: [...shopParams],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/CartItemBody" } } }
        },
        responses: {
          "201": { description: "Created", content: { "application/json": { schema: { type: "object" } } } },
          "400": jsonErr,
          "401": jsonErr,
          "404": jsonErr,
          "429": jsonErr
        }
      }
    },
    "/storefront/cart/items/{itemId}": {
      patch: {
        tags: ["Storefront cart"],
        summary: "Update line quantity",
        description: "Updates quantity for one cart item by `itemId`.",
        security: [{ bearerAuth: [] }],
        parameters: [...shopParams, P.CartItemId],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/CartItemPatch" } } }
        },
        responses: {
          "200": { description: "OK", content: { "application/json": { schema: { type: "object" } } } },
          "400": jsonErr,
          "401": jsonErr,
          "404": jsonErr,
          "429": jsonErr
        }
      },
      delete: {
        tags: ["Storefront cart"],
        summary: "Remove line",
        description: "Deletes one cart item by `itemId`.",
        security: [{ bearerAuth: [] }],
        parameters: [...shopParams, P.CartItemId],
        responses: {
          "204": { description: "No content" },
          "401": jsonErr,
          "404": jsonErr,
          "429": jsonErr
        }
      }
    },
    "/storefront/checkout": {
      post: {
        tags: ["Storefront checkout"],
        summary: "Place order",
        description:
          "Send `Idempotency-Key` (optional) on the client to make retries safe (same key returns the same order).",
        security: [{ bearerAuth: [] }],
        parameters: [...shopParams, P.IdempotencyKey],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/CheckoutBody" } } }
        },
        responses: {
          "201": {
            description: "Created",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    orderId: { type: "string", format: "uuid" },
                    orderNumber: { type: "string" },
                    total_minor: { type: "number" }
                  }
                }
              }
            }
          },
          "400": jsonErr,
          "403": jsonErr,
          "404": jsonErr,
          "429": jsonErr
        }
      }
    },
    "/storefront/profile": {
      post: {
        tags: ["Storefront account"],
        summary: "Update phone / display name",
        security: [{ bearerAuth: [] }],
        parameters: [...shopParams],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/StorefrontProfilePost" } } }
        },
        responses: {
          "204": { description: "No content" },
          "400": jsonErr,
          "401": jsonErr
        }
      }
    },
    "/storefront/address": {
      get: {
        tags: ["Storefront account"],
        summary: "Get linked address",
        security: [{ bearerAuth: [] }],
        parameters: [...shopParams],
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    address: { oneOf: [{ $ref: "#/components/schemas/StorefrontAddress" }, { type: "null" }] }
                  }
                }
              }
            }
          },
          "401": jsonErr
        }
      },
      post: {
        tags: ["Storefront account"],
        summary: "Create/replace address",
        security: [{ bearerAuth: [] }],
        parameters: [...shopParams],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/AddressPostRequest" } } }
        },
        responses: {
          "204": { description: "No content" },
          "400": jsonErr,
          "401": jsonErr
        }
      },
      patch: {
        tags: ["Storefront account"],
        summary: "Patch address",
        security: [{ bearerAuth: [] }],
        parameters: [...shopParams],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object" } } }
        },
        responses: {
          "204": { description: "No content" },
          "400": jsonErr,
          "401": jsonErr
        }
      }
    },
    "/storefront/orders": {
      get: {
        tags: ["Storefront orders"],
        summary: "List customer orders",
        security: [{ bearerAuth: [] }],
        parameters: [...shopParams],
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { orders: { type: "array", items: { type: "object" } } }
                }
              }
            }
          },
          "401": jsonErr
        }
      }
    },
    "/storefront/orders/{id}": {
      get: {
        tags: ["Storefront orders"],
        summary: "Order detail",
        description: "Returns one order by `id` for authenticated customer and resolved shop.",
        security: [{ bearerAuth: [] }],
        parameters: [...shopParams, P.OrderId],
        responses: {
          "200": { description: "OK", content: { "application/json": { schema: { type: "object" } } } },
          "401": jsonErr,
          "404": jsonErr
        }
      }
    },
  };
}

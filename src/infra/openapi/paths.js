// Purpose: Defines OpenAPI path operations, request params, and responses for all public API endpoints.
import { parameters as P } from "./components.js";

const jsonErr = {
  description: "Error",
  content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } }
};

const shopParams = [P.XShopId, P.XTenantId];

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
                    healthReady: { type: "string" },
                    metrics: { type: "string" },
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
    "/health/ready": {
      get: {
        tags: ["Root"],
        summary: "Readiness probe",
        description: "Checks database and cache (Redis/Valkey) when `REDIS_URL` is set. Returns 503 if a dependency is down.",
        responses: {
          "200": {
            description: "Ready",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string", example: "ready" },
                    service: { type: "string" },
                    checks: {
                      type: "object",
                      properties: {
                        database: { type: "string", enum: ["ok", "fail", "unknown"] },
                        redis: { type: "string", enum: ["ok", "fail", "skipped"], description: "Cache dependency status" }
                      }
                    }
                  }
                }
              }
            }
          },
          "503": jsonErr
        }
      }
    },
    "/metrics": {
      get: {
        tags: ["Root"],
        summary: "Prometheus metrics scrape endpoint",
        description:
          "Prometheus text exposition format. When `METRICS_SCRAPE_TOKEN` is set, send it as `Authorization: Bearer <token>` or `X-Metrics-Token`. Legacy JSON snapshot: `GET /metrics/json`.",
        parameters: [
          {
            name: "Authorization",
            in: "header",
            required: false,
            schema: { type: "string" }
          },
          {
            name: "X-Metrics-Token",
            in: "header",
            required: false,
            schema: { type: "string" }
          }
        ],
        responses: {
          "200": {
            description: "Prometheus metrics text",
            content: {
              "text/plain": {
                schema: { type: "string" }
              }
            }
          },
          "403": jsonErr
        }
      }
    },
    "/api/shops/resolve-by-domain": {
      get: {
        tags: ["Shops"],
        summary: "Resolve shop by domain",
        description: "Returns the `shopId` for a matching `shops.domain` or `shops.custom_domain`.",
        parameters: [
          {
            name: "domain",
            in: "query",
            required: true,
            schema: { type: "string", minLength: 1, maxLength: 255 }
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
                    shopId: { type: "string", format: "uuid" }
                  },
                  required: ["shopId"]
                }
              }
            }
          },
          "400": jsonErr,
          "404": jsonErr
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
    "/api/auth/email-otp/request": {
      post: {
        tags: ["Auth"],
        summary: "Request customer email OTP",
        description: "Creates an OTP challenge for `{ email, shopId }` and sends OTP via configured sender.",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/EmailOtpRequestBody" } } }
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
    "/api/auth/email-otp/verify": {
      post: {
        tags: ["Auth"],
        summary: "Verify customer email OTP and issue JWT session",
        description: "Verifies `{ email, shopId, code }`, consumes challenge, and returns customer session JWT payload.",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/EmailOtpVerifyBody" } } }
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
    "/api/auth/logout": {
      post: {
        tags: ["Auth"],
        summary: "Logout and revoke access token",
        description:
          "Revokes the current access token jti (Redis allowlist) and all refresh tokens for the user. Optional `refreshToken` in body revokes that family as well.",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: false,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/LogoutBody" } }
          }
        },
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { ok: { type: "boolean", example: true } }
                }
              }
            }
          },
          "401": jsonErr
        }
      }
    },
    "/api/catalog/categories": {
      get: {
        tags: ["Catalog"],
        summary: "Legacy list categories",
        description: "Legacy catalog categories endpoint under `/api/catalog` (shared global categories only).",
        parameters: [
          P.XShopId,
          {
            name: "parentId",
            in: "query",
            required: false,
            schema: { type: "string", format: "uuid" }
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
                    categories: { type: "array", items: { type: "object" } }
                  }
                }
              }
            }
          },
          "400": jsonErr,
          "404": jsonErr
        }
      }
    },
    "/api/catalog/products": {
      get: {
        tags: ["Catalog"],
        summary: "Legacy list products",
        description: "Legacy catalog products endpoint under `/api/catalog` (shared global products only).",
        parameters: [
          P.XShopId,
          {
            name: "categoryId",
            in: "query",
            required: false,
            schema: { type: "string", format: "uuid" }
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
                    items: { type: "array", items: { type: "object" } }
                  }
                }
              }
            }
          },
          "400": jsonErr,
          "404": jsonErr
        }
      }
    },
    "/api/catalog/items": {
      get: {
        tags: ["Catalog"],
        summary: "Legacy list items alias",
        description: "Alias of `/api/catalog/products` returning the same payload shape (shared global products only).",
        parameters: [
          P.XShopId,
          {
            name: "categoryId",
            in: "query",
            required: false,
            schema: { type: "string", format: "uuid" }
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
                    items: { type: "array", items: { type: "object" } }
                  }
                }
              }
            }
          },
          "400": jsonErr,
          "404": jsonErr
        }
      }
    },
    "/api/catalog/search": {
      get: {
        tags: ["Catalog"],
        summary: "Legacy catalog search",
        description:
          "Searches shared global products/categories with independent sorting and pagination controls.",
        parameters: [
          P.XShopId,
          { name: "type", in: "query", schema: { type: "string", enum: ["products", "categories", "both"] } },
          { name: "q", in: "query", schema: { type: "string", maxLength: 200 } },
          { name: "categoryId", in: "query", schema: { type: "string", format: "uuid" } },
          { name: "parentId", in: "query", schema: { type: "string", format: "uuid" } },
          {
            name: "availability",
            in: "query",
            schema: { type: "string", enum: ["in_stock", "out_of_stock", "unknown"] }
          },
          {
            name: "productSort",
            in: "query",
            schema: { type: "string", enum: ["name", "price", "created_at", "availability"] }
          },
          { name: "productOrder", in: "query", schema: { type: "string", enum: ["asc", "desc"] } },
          {
            name: "categorySort",
            in: "query",
            schema: { type: "string", enum: ["sort_order", "name", "created_at"] }
          },
          { name: "categoryOrder", in: "query", schema: { type: "string", enum: ["asc", "desc"] } },
          { name: "productLimit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100 } },
          { name: "productOffset", in: "query", schema: { type: "integer", minimum: 0, maximum: 50000 } },
          { name: "categoryLimit", in: "query", schema: { type: "integer", minimum: 1, maximum: 500 } },
          { name: "categoryOffset", in: "query", schema: { type: "integer", minimum: 0, maximum: 50000 } }
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
                    categories: { type: "array", items: { type: "object" } }
                  }
                }
              }
            }
          },
          "400": jsonErr,
          "404": jsonErr
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
        description:
          "Lists shared global categories. When `STOREFRONT_CATALOG_HTTP_CACHE_SEC` is set on the server, responses may include `Cache-Control` for CDN/browser caching. Use `all=true` to fetch the full category list in one request.",
        parameters: [
          ...shopParams,
          {
            name: "parent_id",
            in: "query",
            schema: { type: "string", format: "uuid" }
          },
          {
            name: "all",
            in: "query",
            description: "When true, returns all active categories for the shop. Cannot be used with parent_id.",
            schema: { type: "boolean" }
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
    "/storefront/categories/{slug}": {
      get: {
        tags: ["Storefront catalog"],
        summary: "Category by slug",
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
    "/storefront/catalog/cache/invalidate": {
      post: {
        tags: ["Storefront catalog"],
        summary: "Purge catalog cache for a shop",
        description:
          "Only available when the API is configured with `CATALOG_CACHE_INVALIDATE_TOKEN`. Send that token in `X-Catalog-Cache-Invalidate`.",
        parameters: [
          ...shopParams,
          {
            name: "X-Catalog-Cache-Invalidate",
            in: "header",
            required: true,
            schema: { type: "string" }
          }
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                additionalProperties: false,
                required: ["shopId"],
                properties: { shopId: { type: "string", format: "uuid" } }
              }
            }
          }
        },
        responses: {
          "204": { description: "No content" },
          "403": jsonErr,
          "429": jsonErr
        }
      }
    },
    "/storefront/products": {
      get: {
        tags: ["Storefront catalog"],
        summary: "Search and list products",
        description:
          "Returns shop products with thumbnails, category metadata, and unit pricing (minor currency, string integers). **Default filter:** `status=active` and **`availability=in_stock`** (sellable rows only, aligned with cart/checkout). Pass **`include_all_availability=true`** to list all active rows regardless of stock, or set **`availability`** explicitly (`out_of_stock`, `unknown`). **`actual_price_minor`** = list/MRP; **`offer_price_minor`** = catalog offer when set; **`promo_price_minor`** = campaign SKU replacement unit from `promotion_products` or null. **`total_price_minor`** = compare-at anchor (max of list and catalog baseline) for strikethrough UIs; **`final_price_minor`** = payable unit (`promo` when present, else catalog baseline). **`offer_discount_minor`** = savings from list to baseline; **`promo_discount_minor`** = extra savings from baseline to final when a promo applies; **`total_discount_minor`** = `total_price_minor - final_price_minor` (non-negative). Each product includes **`bundle_rules`**. List rows expose **`thumbnail`** only (empty **`images`**). Default **`layout=grouped`** returns **`categories`** only; **`layout=flat`** includes both **`products`** and **`categories`**. Empty arrays, null **`nextCursor`**, and false **`promotions_paused`** are omitted. Catalog cache uses versioned Redis keys.",
        parameters: [
          ...shopParams,
          { name: "category_id", in: "query", schema: { type: "string", format: "uuid" } },
          { name: "brand_id", in: "query", schema: { type: "string", format: "uuid" } },
          {
            name: "search",
            in: "query",
            description: "Partial text search over product name and slug.",
            schema: { type: "string", maxLength: 200 }
          },
          { name: "min_price_minor", in: "query", schema: { type: "integer", minimum: 0 } },
          { name: "max_price_minor", in: "query", schema: { type: "integer", minimum: 0 } },
          { name: "sort_by", in: "query", schema: { type: "string", enum: ["price", "created_at", "name"] } },
          { name: "sort_order", in: "query", schema: { type: "string", enum: ["asc", "desc"] } },
          { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 50 } },
          {
            name: "offset",
            in: "query",
            description: "Legacy offset pagination fallback. When provided, cursor pagination is not used.",
            schema: { type: "integer", minimum: 0, maximum: 50000 }
          },
          {
            name: "cursor",
            in: "query",
            description: "Opaque cursor token for forward pagination. Supported only with sort_by=created_at.",
            schema: { type: "string" }
          },
          {
            name: "availability",
            in: "query",
            schema: { type: "string", enum: ["in_stock", "out_of_stock", "unknown"] }
          },
          {
            name: "layout",
            in: "query",
            description:
              "Response shape: `grouped` (default) returns categories with nested products only; `flat` returns both top-level products and categories.",
            schema: { type: "string", enum: ["grouped", "flat"], default: "grouped" }
          },
          {
            name: "search_mode",
            in: "query",
            description:
              "Search pattern: `contains` (default, substring `%term%`) or `prefix` (typeahead `term%`, better index use).",
            schema: { type: "string", enum: ["contains", "prefix"], default: "contains" }
          }
        ],
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  description:
                    "Omitted keys are absent (not null): empty product/category arrays, absent nextCursor, promotions_paused only when true. Default layout omits top-level products when categories are present.",
                  properties: {
                    promotions_paused: { type: "boolean" },
                    products: { type: "array", items: { type: "object" } },
                    categories: { type: "array", items: { type: "object" } },
                    nextCursor: { type: "string" }
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
        description:
          "Product by slug. Only **active** + **in_stock** shop offers are returned (404 otherwise). Pricing: `actual_price_minor`, `offer_price_minor` (nullable), `promo_price_minor` (nullable), `total_price_minor`, `final_price_minor`, `offer_discount_minor`, `promo_discount_minor`, `total_discount_minor` (see list endpoint). **`bundle_rules`**: BXGY rules for this SKU or category. `promo_price_minor` is the campaign **unit** price (replacement), not a delta off list/offer.",
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
    "/storefront/products/id/{id}": {
      get: {
        tags: ["Storefront catalog"],
        summary: "Product by shop product ID",
        description: "Product by `shop_products.id`. Same sellability rules, pricing, and `bundle_rules` fields as slug detail.",
        parameters: [...shopParams, P.ProductId],
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
        summary: "Get cart with live pricing",
        description:
          "Returns cart lines with **SKU** and **bundle** promos applied. Optional `couponCode` query previews a coupon without persisting it (`promotions.coupon.status`: `applied` | `not_applicable`). Unsellable lines are pruned on read. Use `summary.subtotal_before_coupon_minor` for `GET /storefront/coupons`. Set `includeSuggestedCoupons=false` to skip suggested-coupon DB reads on repeat polls.",
        security: [{ bearerAuth: [] }],
        parameters: [
          ...shopParams,
          P.CouponCodeQuery,
          {
            name: "includeSuggestedCoupons",
            in: "query",
            description: "When false, skips loading suggested coupons (default true).",
            schema: { type: "boolean", default: true }
          }
        ],
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/StorefrontCartResponse" }
              }
            }
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
        description:
          "Use `productId` as shop product UUID (`shop_products.id`). Merges quantity when the same product is already in the cart. Returns the full repriced cart (`StorefrontCartResponse`).",
        security: [{ bearerAuth: [] }],
        parameters: [...shopParams],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/CartItemBody" } } }
        },
        responses: {
          "201": {
            description: "Created — full cart view",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/StorefrontCartResponse" }
              }
            }
          },
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
        description:
          "Set absolute `quantity` or relative `delta`. Returns full repriced cart (bundle free units appear as `offer_quantity` on the line).",
        security: [{ bearerAuth: [] }],
        parameters: [...shopParams, P.CartItemId],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/CartItemPatch" } } }
        },
        responses: {
          "200": {
            description: "OK — full cart view",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/StorefrontCartResponse" }
              }
            }
          },
          "400": jsonErr,
          "401": jsonErr,
          "404": jsonErr,
          "429": jsonErr
        }
      },
      delete: {
        tags: ["Storefront cart"],
        summary: "Remove line",
        description:
          "Deletes one cart item by `itemId` (not bundle reward ids). Optional body `couponCode` reprices the remaining cart. Returns full cart view.",
        security: [{ bearerAuth: [] }],
        parameters: [...shopParams, P.CartItemId],
        requestBody: {
          required: false,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/CartItemDeleteBody" } }
          }
        },
        responses: {
          "200": {
            description: "OK — full cart view",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/StorefrontCartResponse" }
              }
            }
          },
          "400": jsonErr,
          "401": jsonErr,
          "404": jsonErr,
          "429": jsonErr
        }
      }
    },
    "/storefront/coupons": {
      get: {
        tags: ["Storefront promotions"],
        summary: "List applicable coupons",
        description:
          "Read-only coupon list for the authenticated customer. Pass `cartSubtotalMinor` from `GET /storefront/cart` `summary.subtotal_minor` (after SKU/bundle, before coupon). There is no separate apply-coupon endpoint — send `couponCode` on `POST /storefront/checkout`.",
        security: [{ bearerAuth: [] }],
        parameters: [
          ...shopParams,
          {
            name: "code",
            in: "query",
            required: false,
            schema: { type: "string", minLength: 1, maxLength: 64 }
          },
          {
            name: "cartSubtotalMinor",
            in: "query",
            required: false,
            schema: { type: "integer", minimum: 0 }
          },
          {
            name: "onlyApplicable",
            in: "query",
            required: false,
            schema: { type: "boolean", default: false }
          }
        ],
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/CouponsListResponse" }
              }
            }
          },
          "400": jsonErr,
          "401": jsonErr,
          "403": jsonErr,
          "429": jsonErr
        }
      }
    },
    "/storefront/checkout": {
      post: {
        tags: ["Storefront checkout"],
        summary: "Place order",
        description:
          "Send `Idempotency-Key` (optional) on the client to make retries safe (same key returns the same order). Optional `couponCode` applies cart-level coupon discount; SKU and bundle promos are automatic.",
        security: [{ bearerAuth: [] }],
        parameters: [...shopParams, P.IdempotencyKey],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/CheckoutBody" } } }
        },
        responses: {
          "201": {
            description: "Created — cart cleared on success",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/CheckoutResponse" }
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
        description:
          "Each order includes `items` with catalog-resolved `image` (nullable for custom lines or products without media). Same shape as `/storefront/orders/{id}` line items.",
        security: [{ bearerAuth: [] }],
        parameters: [...shopParams, P.OrdersLimit],
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/StorefrontOrdersListResponse" }
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
        description:
          "Returns one order by `id` for authenticated customer and resolved shop. Use the `id` from `/storefront/orders` list response. Line items include `image` when a shop product and media exist.",
        security: [{ bearerAuth: [] }],
        parameters: [...shopParams, P.OrderId],
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/StorefrontOrderDetailResponse" }
              }
            }
          },
          "401": jsonErr,
          "404": jsonErr
        }
      }
    },
  };
}

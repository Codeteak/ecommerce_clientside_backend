// Schemas and shared parameters for OpenAPI (Swagger) documentation.

export const parameters = {
  XShopId: {
    name: "x-shop-id",
    in: "header",
    description:
      "Tenant shop UUID for API clients. Alias header `x-tenant-id` is also accepted. Shop can also be resolved from storefront host.",
    schema: { type: "string", format: "uuid" }
  },
  XTenantId: {
    name: "x-tenant-id",
    in: "header",
    description:
      "Alias of `x-shop-id`. Send either header with the tenant shop UUID for cross-origin API clients.",
    schema: { type: "string", format: "uuid" }
  },
  Slug: {
    name: "slug",
    in: "path",
    required: true,
    schema: { type: "string", minLength: 1, maxLength: 128 }
  },
  ProductId: {
    name: "id",
    in: "path",
    required: true,
    description: "Shop product UUID (`shop_products.id`).",
    schema: { type: "string", format: "uuid" }
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
  EmailOtpRequestBody: {
    type: "object",
    required: ["email", "shopId"],
    additionalProperties: false,
    properties: {
      email: { type: "string", format: "email" },
      shopId: { type: "string", format: "uuid" }
    }
  },
  EmailOtpVerifyBody: {
    type: "object",
    required: ["email", "shopId", "code"],
    additionalProperties: false,
    properties: {
      email: { type: "string", format: "email" },
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
      maxRadiusM: { type: "integer", nullable: true },
      shopLocation: {
        oneOf: [
          {
            type: "object",
            properties: {
              lat: { type: "number" },
              lng: { type: "number" }
            },
            required: ["lat", "lng"]
          },
          { type: "null" }
        ]
      }
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
      productId: {
        type: "string",
        format: "uuid",
        description: "Shop product UUID (`shop_products.id`), not global product ID."
      },
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
    properties: {
      notes: { type: "string", maxLength: 2000, nullable: true }
    }
  },
  /** Resolved from live shop/global product media when `product_id` matches a shop product. */
  StorefrontOrderLineItemImage: {
    type: "object",
    description:
      "Primary product image for the line item. Omitted in JSON when null; when present, `url` may still be null if `OBJECT_STORAGE_PUBLIC_BASE_URL` is not set.",
    properties: {
      mediaAssetId: { type: "string", format: "uuid", nullable: true },
      storageKey: { type: "string" },
      contentType: { type: "string", nullable: true },
      url: { type: "string", nullable: true, description: "Absolute public object URL when storage base URL is configured." }
    },
    required: ["storageKey"]
  },
  StorefrontOrderLineItem: {
    type: "object",
    properties: {
      id: { type: "string", format: "uuid" },
      product_id: { type: "string", format: "uuid", nullable: true },
      product_slug: { type: "string", nullable: true },
      product_name_snapshot: { type: "string" },
      unit_label_snapshot: { type: "string" },
      quantity: { type: "string", description: "Decimal quantity (Postgres numeric serialized as string)." },
      unit_price_minor_snapshot: { type: "integer", description: "Minor units (e.g. paise)." },
      line_total_minor: { type: "integer" },
      is_custom: { type: "boolean" },
      custom_note: { type: "string", nullable: true },
      image: {
        nullable: true,
        allOf: [{ $ref: "#/components/schemas/StorefrontOrderLineItemImage" }]
      }
    },
    required: [
      "id",
      "product_name_snapshot",
      "unit_label_snapshot",
      "quantity",
      "unit_price_minor_snapshot",
      "line_total_minor",
      "is_custom",
      "image"
    ]
  },
  StorefrontOrderListEntry: {
    type: "object",
    description: "Order summary row from list endpoint, including nested line items.",
    properties: {
      id: { type: "string", format: "uuid" },
      order_number: { type: "string" },
      status: { type: "string" },
      total_minor: {
        description: "Order total in minor units; may be string when serialized from Postgres bigint.",
        oneOf: [{ type: "integer" }, { type: "string" }]
      },
      currency: { type: "string" },
      placed_at: { type: "string", format: "date-time" },
      picker_id: { type: "string", format: "uuid", nullable: true },
      picker_name: { type: "string", nullable: true },
      items: {
        type: "array",
        items: { $ref: "#/components/schemas/StorefrontOrderLineItem" }
      }
    },
    required: ["id", "order_number", "status", "total_minor", "currency", "placed_at", "items"]
  },
  StorefrontOrdersListResponse: {
    type: "object",
    properties: {
      orders: { type: "array", items: { $ref: "#/components/schemas/StorefrontOrderListEntry" } }
    },
    required: ["orders"]
  },
  StorefrontOrderDetail: {
    type: "object",
    properties: {
      id: { type: "string", format: "uuid" },
      shop_id: { type: "string", format: "uuid" },
      customer_id: { type: "string", description: "Customer identifier as stored on the order (text)." },
      order_number: { type: "string" },
      status: { type: "string" },
      payment_method: { type: "string" },
      subtotal_minor: { oneOf: [{ type: "integer" }, { type: "string" }] },
      delivery_fee_minor: { oneOf: [{ type: "integer" }, { type: "string" }] },
      total_minor: { oneOf: [{ type: "integer" }, { type: "string" }] },
      currency: { type: "string" },
      notes: { type: "string", nullable: true },
      picker_id: { type: "string", format: "uuid", nullable: true },
      picker_name: { type: "string", nullable: true },
      placed_at: { type: "string", format: "date-time" },
      accepted_at: { type: "string", format: "date-time", nullable: true },
      out_for_delivery_at: { type: "string", format: "date-time", nullable: true },
      delivered_at: { type: "string", format: "date-time", nullable: true },
      rejected_at: { type: "string", format: "date-time", nullable: true }
    },
    required: [
      "id",
      "shop_id",
      "customer_id",
      "order_number",
      "status",
      "payment_method",
      "subtotal_minor",
      "delivery_fee_minor",
      "total_minor",
      "currency",
      "placed_at"
    ]
  },
  StorefrontOrderDetailResponse: {
    type: "object",
    properties: {
      order: { $ref: "#/components/schemas/StorefrontOrderDetail" },
      items: { type: "array", items: { $ref: "#/components/schemas/StorefrontOrderLineItem" } }
    },
    required: ["order", "items"]
  }
};

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
  },
  CouponCodeQuery: {
    name: "couponCode",
    in: "query",
    required: false,
    description:
      "Optional coupon code to **preview** on the cart (uppercased server-side). Does not persist until checkout. When invalid, cart still returns 200 with `promotions.coupon.status: not_applicable`.",
    schema: { type: "string", minLength: 1, maxLength: 64 }
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
    required: ["productId"],
    description: "Provide `quantity` (absolute) or `delta` (relative, integer). Optional `couponCode` reprices the returned cart.",
    properties: {
      productId: {
        type: "string",
        format: "uuid",
        description: "Shop product UUID (`shop_products.id`), not global product ID."
      },
      quantity: { type: "number", exclusiveMinimum: 0, description: "Absolute quantity after add/merge." },
      delta: {
        type: "integer",
        description: "Relative change when adding (must be positive for new lines)."
      },
      couponCode: {
        type: "string",
        minLength: 1,
        maxLength: 64,
        description: "Preview coupon on the cart response."
      }
    }
  },
  CartItemPatch: {
    type: "object",
    description: "Provide `quantity` (absolute) or `delta` (relative, integer). Optional `couponCode` reprices the returned cart.",
    properties: {
      quantity: { type: "number", exclusiveMinimum: 0 },
      delta: { type: "integer", description: "Relative change; use -1 to decrement. At qty 1, negative delta returns MINIMUM_QUANTITY." },
      couponCode: { type: "string", minLength: 1, maxLength: 64 }
    }
  },
  CartItemDeleteBody: {
    type: "object",
    properties: {
      couponCode: { type: "string", minLength: 1, maxLength: 64, description: "Reprice remaining cart after delete." }
    }
  },
  CheckoutBody: {
    type: "object",
    properties: {
      notes: { type: "string", maxLength: 2000, nullable: true },
      couponCode: {
        type: "string",
        minLength: 1,
        maxLength: 64,
        nullable: true,
        description: "Optional coupon code (uppercased server-side). Apply happens at checkout only."
      }
    }
  },
  CouponsListResponse: {
    type: "object",
    required: ["promotionsPaused", "settings", "coupons"],
    properties: {
      promotionsPaused: { type: "boolean" },
      settings: {
        type: "object",
        properties: {
          maxCouponsPerOrder: { type: "integer" },
          allowCombineAutoCampaigns: { type: "boolean" },
          firstCouponEligibilityDays: { type: "integer" }
        }
      },
      coupons: {
        type: "array",
        items: { $ref: "#/components/schemas/CouponListEntry" }
      }
    }
  },
  CouponListEntry: {
    type: "object",
    properties: {
      id: { type: "string", format: "uuid" },
      code: { type: "string" },
      promotionId: { type: "string", format: "uuid" },
      promotionName: { type: "string" },
      startsAt: { type: "string", format: "date-time" },
      endsAt: { type: "string", format: "date-time", nullable: true },
      minSubtotalMinor: { type: "integer", nullable: true },
      firstOrderOnly: { type: "boolean" },
      newCustomerOnly: { type: "boolean" },
      benefits: {
        type: "array",
        items: {
          type: "object",
          properties: {
            kind: { type: "string" },
            percentBps: { type: "integer" },
            amountMinor: { type: "integer" },
            minSubtotalMinor: { type: "integer" }
          }
        }
      },
      eligibility: {
        type: "object",
        properties: {
          applicable: { type: "boolean" },
          ineligibilityCodes: { type: "array", items: { type: "string" } }
        }
      }
    }
  },
  StorefrontCartSummary: {
    type: "object",
    description: "All amounts in minor units (INR paise).",
    properties: {
      subtotal_minor: { type: "integer", description: "Payable subtotal after SKU/bundle and coupon preview." },
      subtotal_before_coupon_minor: {
        type: "integer",
        description: "Subtotal after auto promos, before coupon (use for GET /coupons eligibility)."
      },
      promotion_discount_minor: { type: "integer", description: "SKU + bundle + coupon discount combined." },
      coupon_discount_minor: { type: "integer" },
      units_display_total: {
        type: "integer",
        description: "Sum of quantity + offer_quantity across all cart lines."
      },
      currency: { type: "string", example: "INR" }
    }
  },
  StorefrontCartPromotions: {
    type: "object",
    properties: {
      paused: { type: "boolean" },
      types: {
        type: "array",
        items: { type: "string", enum: ["offer", "sku", "bundle", "coupon"] },
        description: "Promotion kinds active on this cart."
      },
      promotion_ids: { type: "array", items: { type: "string", format: "uuid" } },
      coupon: {
        type: "object",
        properties: {
          code: { type: "string", nullable: true },
          status: { type: "string", enum: ["none", "applied", "not_applicable"] },
          discount_minor: { type: "integer" },
          reason_code: { type: "string", nullable: true },
          reason_message: { type: "string", nullable: true }
        }
      },
      suggested_coupons: {
        type: "array",
        maxItems: 3,
        items: {
          type: "object",
          properties: {
            code: { type: "string" },
            applicable: { type: "boolean" },
            reason_codes: { type: "array", items: { type: "string" } }
          }
        }
      }
    }
  },
  StorefrontCartLinePricing: {
    type: "object",
    description: "Per-unit amounts in minor units unless noted.",
    properties: {
      list_minor: { type: "string", nullable: true },
      offer_minor: { type: "string", nullable: true },
      final_minor: { type: "string", nullable: true },
      line_total_minor: { type: "string", nullable: true }
    }
  },
  StorefrontCartLinePromo: {
    type: "object",
    properties: {
      types: {
        type: "array",
        items: { type: "string", enum: ["offer", "sku", "bundle"] }
      },
      promotion_ids: { type: "array", items: { type: "string" } }
    }
  },
  StorefrontCartLineItem: {
    type: "object",
    description:
      "One row per cart line. `quantity` is what the customer added; `offer_quantity` is bundle free units (e.g. buy 2 get 1 → quantity 2, offer_quantity 1).",
    properties: {
      id: { type: "string" },
      product_id: { type: "string", format: "uuid", nullable: true },
      slug: { type: "string", nullable: true },
      title: { type: "string", nullable: true },
      unit: { type: "string", nullable: true },
      image_url: { type: "string", nullable: true, format: "uri" },
      quantity: {
        type: "number",
        description: "Billable units in cart (matches PATCH/DELETE quantity)."
      },
      offer_quantity: {
        type: "number",
        description: "Free units from bundle promos (0 when no bundle applies)."
      },
      pricing: { $ref: "#/components/schemas/StorefrontCartLinePricing" },
      promo: { $ref: "#/components/schemas/StorefrontCartLinePromo" },
      price_updated: { type: "boolean" },
      previous_list_minor: { type: "string", nullable: true }
    }
  },
  StorefrontCartResponse: {
    type: "object",
    required: ["cart_id", "items", "summary", "promotions"],
    properties: {
      cart_id: { type: "string", format: "uuid" },
      items: { type: "array", items: { $ref: "#/components/schemas/StorefrontCartLineItem" } },
      summary: { $ref: "#/components/schemas/StorefrontCartSummary" },
      promotions: { $ref: "#/components/schemas/StorefrontCartPromotions" }
    }
  },
  CheckoutResponse: {
    type: "object",
    required: ["orderId", "orderNumber", "total_minor"],
    properties: {
      orderId: { type: "string", format: "uuid" },
      orderNumber: { type: "string" },
      subtotal_minor: { type: "integer", description: "Merchandise total after promos (excludes delivery)." },
      promotion_discount_minor: { type: "integer" },
      coupon_discount_minor: { type: "integer" },
      delivery_fee_minor: { type: "integer" },
      total_minor: { type: "integer", description: "subtotal_minor + delivery_fee_minor" },
      coupon_code: { type: "string", nullable: true }
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

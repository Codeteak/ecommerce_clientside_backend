// Purpose: Storefront location, catalog, cart, checkout, account, and orders.

import { z } from "zod";
import { env } from "../../../config/env.js";
import { validate } from "../middleware/validate.js";
import {
  storefrontCatalogCacheInvalidateBodySchema,
  storefrontOrdersListQuerySchema
} from "../validations/storefrontRestSchemas.js";

const cartItemIdParamSchema = z.object({
  itemId: z.string().uuid()
});

export function mountStorefrontRoutes(r, deps) {
  const {
    authLimiter,
    cartMutateLimiter,
    profileMutateLimiter,
    addressMutateLimiter,
    requireCustomerJwt,
    locationGuard,
    validate,
    storefrontLocationBodySchema,
    storefrontCategoriesQuerySchema,
    storefrontProductsQuerySchema,
    storefrontProductSlugParamSchema,
    storefrontProductIdParamSchema,
    storefrontCategorySlugParamSchema,
    storefrontCartItemBodySchema,
    storefrontCartItemPatchSchema,
    storefrontCheckoutBodySchema,
    storefrontProfilePostSchema,
    storefrontAddressPostSchema,
    storefrontAddressPatchSchema,
    storefrontOrderIdParamSchema,
    storefrontCtl,
    storefrontCat,
    storefrontCart,
    storefrontCheckout,
    storefrontAccount,
    storefrontOrders,
    invalidateShopCatalogCache
  } = deps;

  function mountForPrefix(prefix) {
    r.post(
      `${prefix}/location/check`,
      authLimiter,
      validate({ body: storefrontLocationBodySchema }),
      storefrontCtl.checkLocation
    );

    r.get(
      `${prefix}/categories`,
      validate({ query: storefrontCategoriesQuerySchema }),
      storefrontCat.listCategories
    );
    r.get(
      `${prefix}/categories/:slug`,
      validate({ params: storefrontCategorySlugParamSchema }),
      storefrontCat.getCategoryBySlug
    );
    r.get(
      `${prefix}/products`,
      validate({ query: storefrontProductsQuerySchema }),
      storefrontCat.listProducts
    );
    r.get(
      `${prefix}/products/:slug`,
      validate({ params: storefrontProductSlugParamSchema }),
      storefrontCat.getProductBySlug
    );
    r.get(
      `${prefix}/products/id/:id`,
      validate({ params: storefrontProductIdParamSchema }),
      storefrontCat.getProductById
    );

    r.post(`${prefix}/cart`, requireCustomerJwt, storefrontCart.getOrCreate);
    r.get(`${prefix}/cart`, requireCustomerJwt, storefrontCart.get);
    r.post(
      `${prefix}/cart/items`,
      requireCustomerJwt,
      cartMutateLimiter,
      validate({ body: storefrontCartItemBodySchema }),
      storefrontCart.addItem
    );
    r.patch(
      `${prefix}/cart/items/:itemId`,
      requireCustomerJwt,
      cartMutateLimiter,
      validate({ params: cartItemIdParamSchema, body: storefrontCartItemPatchSchema }),
      storefrontCart.patchItem
    );
    r.delete(
      `${prefix}/cart/items/:itemId`,
      requireCustomerJwt,
      cartMutateLimiter,
      validate({ params: cartItemIdParamSchema }),
      storefrontCart.deleteItem
    );

    r.post(
      `${prefix}/checkout`,
      authLimiter,
      cartMutateLimiter,
      requireCustomerJwt,
      locationGuard,
      validate({ body: storefrontCheckoutBodySchema }),
      storefrontCheckout.post
    );

    r.post(
      `${prefix}/profile`,
      requireCustomerJwt,
      profileMutateLimiter,
      validate({ body: storefrontProfilePostSchema }),
      storefrontAccount.postProfile
    );
    r.get(`${prefix}/address`, requireCustomerJwt, storefrontAccount.getAddress);
    r.post(
      `${prefix}/address`,
      requireCustomerJwt,
      addressMutateLimiter,
      validate({ body: storefrontAddressPostSchema }),
      storefrontAccount.postAddress
    );
    r.patch(
      `${prefix}/address`,
      requireCustomerJwt,
      addressMutateLimiter,
      validate({ body: storefrontAddressPatchSchema }),
      storefrontAccount.patchAddress
    );

    r.get(
      `${prefix}/orders`,
      requireCustomerJwt,
      validate({ query: storefrontOrdersListQuerySchema }),
      storefrontOrders.list
    );

    if (env.CATALOG_CACHE_INVALIDATE_TOKEN && typeof invalidateShopCatalogCache === "function") {
      r.post(
        `${prefix}/catalog/cache/invalidate`,
        authLimiter,
        validate({ body: storefrontCatalogCacheInvalidateBodySchema }),
        (req, res, next) => {
          const token = req.get("X-Catalog-Cache-Invalidate");
          if (!token || token !== env.CATALOG_CACHE_INVALIDATE_TOKEN) {
            return res.status(403).json({
              error: {
                code: "FORBIDDEN",
                message: "Invalid or missing X-Catalog-Cache-Invalidate token"
              }
            });
          }
          Promise.resolve(invalidateShopCatalogCache(req.body.shopId))
            .then(() => res.status(204).send())
            .catch(next);
        }
      );
    }
    r.get(
      `${prefix}/orders/:id`,
      requireCustomerJwt,
      validate({ params: storefrontOrderIdParamSchema }),
      storefrontOrders.getById
    );
  }

  mountForPrefix("/storefront");
  mountForPrefix("/api/storefront");
}

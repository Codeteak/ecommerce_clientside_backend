// Builds OpenAPI 3.0 document for Swagger UI and /openapi.json.
import { schemas, parameters } from "./components.js";
import { buildPaths } from "./paths.js";

/**
 * @param {{ API_PUBLIC_URL: string }} envSlice
 */
export function getOpenApiDocument(envSlice) {
  const base = envSlice.API_PUBLIC_URL.replace(/\/$/, "");
  return {
    openapi: "3.0.3",
    info: {
      title: "Client storefront API",
      version: "0.1.0",
      description:
        "Customer storefront, auth, catalog, cart, and checkout. See `docs/API_FRONTEND.md` for narrative specs. **Dashboard / superadmin APIs are not on this service.**"
    },
    servers: [{ url: base, description: "Configured API host" }],
    tags: [
      { name: "Root", description: "Discovery and health" },
      { name: "Auth", description: "OTP login" },
      { name: "Profile", description: "Authenticated `/api/me/profile`" },
      { name: "Storefront", description: "Location / service area" },
      { name: "Storefront catalog", description: "Public shop catalog" },
      { name: "Storefront cart", description: "Bearer JWT cart" },
      { name: "Storefront checkout", description: "Place order" },
      { name: "Storefront account", description: "Profile + address under storefront" },
      { name: "Storefront orders", description: "Order history" },
      { name: "Catalog", description: "Tenant `/api/catalog/*`" }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
          description: "Customer access token from OTP verification endpoints"
        }
      },
      schemas,
      parameters
    },
    paths: buildPaths()
  };
}

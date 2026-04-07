// Purpose: This file validates the request body for storefront location checks.
import { z } from "zod";

export const storefrontLocationBodySchema = z
  .object({
    lat: z.number().gte(-90).lte(90),
    lng: z.number().gte(-180).lte(180)
  })
  .strict();

import { z } from "zod";

export const shopIdParamSchema = z.object({
  shopId: z.string().uuid()
});

export const serviceAreaCheckBodySchema = z
  .object({
    lat: z.number().gte(-90).lte(90),
    lng: z.number().gte(-180).lte(180)
  })
  .strict();

export const shopDomainQuerySchema = z
  .object({
    domain: z.string().trim().min(1).max(255)
  })
  .strict();

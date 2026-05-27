import { z } from "zod";

export const seoMetadataQuerySchema = z
  .object({
    pageType: z.enum(["shop", "product"]),
    slug: z.string().trim().min(1).max(200).optional()
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.pageType === "product" && !data.slug) {
      ctx.addIssue({
        code: "custom",
        message: "slug is required when pageType is product",
        path: ["slug"]
      });
    }
  });

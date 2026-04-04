import { Router } from "express";
import { healthController } from "../controllers/healthController.js";
import { catalogController } from "../controllers/catalogController.js";

/**
 * @param {import("../../../main/composition.js").AppContext} ctx
 */
export function createRoutes(ctx) {
  const r = Router();

  r.get("/health", healthController.get(ctx));
  r.get("/api/catalog/items", catalogController.listItems(ctx));

  return r;
}

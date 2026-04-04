import { CatalogRepo } from "../../../application/ports/repositories/CatalogRepo.js";

export class CatalogRepoMemory extends CatalogRepo {
  constructor() {
    super();
    /** @type {import("../../../application/ports/repositories/CatalogRepo.js").CatalogItem[]} */
    this._items = [
      { id: "demo-1", name: "Sample item" },
      { id: "demo-2", name: "Another sample" }
    ];
  }

  async list() {
    return [...this._items];
  }
}

/**
 * @typedef {Object} CatalogItem
 * @property {string} id
 * @property {string} name
 */

export class CatalogRepo {
  /**
   * @returns {Promise<CatalogItem[]>}
   */
  // eslint-disable-next-line no-unused-vars
  async list() {
    throw new Error("Not implemented");
  }
}

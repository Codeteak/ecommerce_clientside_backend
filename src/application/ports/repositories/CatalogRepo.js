/**
 * @typedef {Object} CatalogItem
 * @property {string} id
 * @property {string} shop_id
 * @property {string|null} category_id
 * @property {string} name
 * @property {string} slug
 * @property {string} base_unit
 * @property {string} status
 * @property {string} price_minor_per_unit
 * @property {string} created_at
 * @property {string} updated_at
 */

/**
 * @typedef {Object} CategoryRow
 * @property {string} id
 * @property {string} shop_id
 * @property {string|null} parent_id
 * @property {string} name
 * @property {string} slug
 * @property {number} sort_order
 * @property {boolean} is_active
 * @property {unknown} metadata
 */

export class CatalogRepo {
  /**
   * @param {string} _shopId
   * @param {{ categoryId?: string|null }} _filters
   * @returns {Promise<CatalogItem[]>}
   */
  // eslint-disable-next-line no-unused-vars
  async listProducts(_shopId, _filters) {
    throw new Error("Not implemented");
  }

  /**
   * @param {string} _shopId
   * @param {{ parentId?: string|null }} _filters — omit or null: root categories; UUID: children of that parent
   * @returns {Promise<CategoryRow[]>}
   */
  // eslint-disable-next-line no-unused-vars
  async listCategories(_shopId, _filters) {
    throw new Error("Not implemented");
  }
}

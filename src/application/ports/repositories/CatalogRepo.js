/**
 * Purpose: This file defines the catalog repository contract.
 * It lists the catalog methods the application can call, while
 * database-specific repositories provide the real implementation.
 */
export class CatalogRepo {
  async listProducts(_shopId, _filters) {
    void _shopId;
    void _filters;
    throw new Error("Not implemented");
  }

  async listCategories(_shopId, _filters) {
    void _shopId;
    void _filters;
    throw new Error("Not implemented");
  }

  async searchProducts(_shopId, _params) {
    void _shopId;
    void _params;
    throw new Error("Not implemented");
  }

  async searchCategories(_shopId, _params) {
    void _shopId;
    void _params;
    throw new Error("Not implemented");
  }

  /**
   * Category IDs that have sellable products at the shop (includes ancestor categories).
   * @param {string} _shopId
   * @returns {Promise<string[]>}
   */
  async listCategoryIdsWithSellableProducts(_shopId) {
    void _shopId;
    throw new Error("Not implemented");
  }

  async listCategoriesStorefront(_shopId, _filters) {
    void _shopId;
    void _filters;
    throw new Error("Not implemented");
  }

  async listAllCategoriesStorefront(_shopId, _filters = {}) {
    void _shopId;
    void _filters;
    throw new Error("Not implemented");
  }

  async listProductsStorefront(_shopId, _params) {
    void _shopId;
    void _params;
    throw new Error("Not implemented");
  }

  async getProductBySlugStorefront(_shopId, _slug) {
    void _shopId;
    void _slug;
    throw new Error("Not implemented");
  }

  /**
   * @param {string} _shopId
   * @param {string} _slug
   * @returns {Promise<{ product: object, primary_image_storage_key?: string | null } | null>}
   */
  async getProductSeoBySlugStorefront(_shopId, _slug) {
    void _shopId;
    void _slug;
    throw new Error("Not implemented");
  }

  async listEnabledHomeSectionsStorefront(_shopId) {
    void _shopId;
    throw new Error("Not implemented");
  }

  async listSellableProductsByIdsStorefront(_shopId, _ids) {
    void _shopId;
    void _ids;
    throw new Error("Not implemented");
  }

  /**
   * Active + in-stock products in category trees (root + descendants), capped.
   * Used to expand home-section category_ids into shelf products.
   */
  async listSellableProductsByCategoryIdsStorefront(_shopId, _categoryIds, _limit) {
    void _shopId;
    void _categoryIds;
    void _limit;
    throw new Error("Not implemented");
  }

  /**
   * Same shelf fill as listSellableProductsByCategoryIdsStorefront, one query for every shelf.
   * Each section keeps its own newest rows, capped per shelf.
   * @param {string} _shopId
   * @param {{ sectionId: string, categoryIds: string[] }[]} _sections
   * @param {number} [_limit]
   * @returns {Promise<object[]>} rows include section_id
   */
  async listSellableProductsBySectionCategoriesStorefront(_shopId, _sections, _limit) {
    void _shopId;
    void _sections;
    void _limit;
    throw new Error("Not implemented");
  }

  /** Any non-deleted home section row (ignores enabled / date window). */
  async getHomeSectionByIdStorefront(_shopId, _sectionId) {
    void _shopId;
    void _sectionId;
    throw new Error("Not implemented");
  }

  async listActiveCategoriesByIdsStorefront(_shopId, _ids) {
    void _shopId;
    void _ids;
    throw new Error("Not implemented");
  }

  async getCategoryBySlugStorefront(_shopId, _slug) {
    void _shopId;
    void _slug;
    throw new Error("Not implemented");
  }

  /**
   * Parent id for each category in the walk, including the starting ids.
   * Uses the caller's transaction client.
   * @param {import("pg").PoolClient} _client
   * @param {Iterable<string | null | undefined>} _categoryIds
   * @returns {Promise<Map<string, string | null>>}
   */
  async listCategoryParents(_client, _categoryIds) {
    void _client;
    void _categoryIds;
    throw new Error("Not implemented");
  }

  /**
   * Sellable reward SKUs for cross buy-x-get-y injection.
   * A query failure returns an empty list so checkout can skip the free line.
   * @param {import("pg").PoolClient} _client
   * @param {string} _shopId
   * @param {string[]} _productIds
   * @returns {Promise<object[]>}
   */
  async listRewardProductsForPricing(_client, _shopId, _productIds) {
    void _client;
    void _shopId;
    void _productIds;
    throw new Error("Not implemented");
  }
}

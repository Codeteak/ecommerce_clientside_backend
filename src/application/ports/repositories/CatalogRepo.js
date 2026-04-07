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

  async listCategoriesStorefront(_shopId, _filters) {
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
}

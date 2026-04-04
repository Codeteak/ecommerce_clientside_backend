export function createGetHealth() {
  return async function getHealth() {
    return { status: "ok", service: "clientside-ecommerce-api" };
  };
}

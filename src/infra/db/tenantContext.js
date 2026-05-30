export async function setTenantContext(client, shopId) {
  if (!shopId || typeof client?.query !== "function") return;
  await client.query("select set_config('app.current_shop_id', $1, true)", [shopId]);
}

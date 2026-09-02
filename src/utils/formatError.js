/**
 * Normalize unknown errors for structured logs (pg, Node, fetch, etc.).
 * @param {unknown} err
 * @returns {{ message: string, code: string, name: string }}
 */
export function formatError(err) {
  if (!err) {
    return { message: "unknown error", code: "", name: "Error" };
  }
  if (err instanceof Error) {
    const cause = /** @type {Error & { code?: string }} | undefined} */ (err.cause);
    return {
      message: err.message?.trim() || err.name || "Error",
      code: String(/** @type {{ code?: string }} */ (err).code || cause?.code || ""),
      name: err.name || "Error"
    };
  }
  return {
    message: String(err),
    code: "",
    name: "Error"
  };
}

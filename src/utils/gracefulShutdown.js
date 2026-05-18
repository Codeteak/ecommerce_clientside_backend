/**
 * Close an HTTP server with a bounded wait (SIGTERM-friendly for ECS/CodeDeploy).
 * @param {import("node:http").Server} server
 * @param {number} timeoutMs
 * @returns {Promise<'closed' | 'timeout'>}
 */
export function closeServerWithTimeout(server, timeoutMs) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };

    const timer = setTimeout(() => finish("timeout"), Math.max(0, timeoutMs));

    server.close((err) => {
      if (err && err.code !== "ERR_SERVER_NOT_RUNNING") {
        finish("timeout");
        return;
      }
      finish("closed");
    });
  });
}

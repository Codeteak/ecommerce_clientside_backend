import { describe, it, expect, vi } from "vitest";
import http from "node:http";
import { closeServerWithTimeout } from "../../src/utils/gracefulShutdown.js";

describe("closeServerWithTimeout", () => {
  it("returns closed when server.close completes", async () => {
    const server = http.createServer((_req, res) => {
      res.end("ok");
    });
    await new Promise((resolve) => server.listen(0, resolve));
    const result = await closeServerWithTimeout(server, 5000);
    expect(result).toBe("closed");
  });

  it("returns timeout when server.close never completes", async () => {
    const server = http.createServer();
    server.close = vi.fn();
    const result = await closeServerWithTimeout(server, 20);
    expect(result).toBe("timeout");
  });
});

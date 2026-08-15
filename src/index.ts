#!/usr/bin/env node
import "dotenv/config";

import { loadBridgeConfig } from "./config.js";
import { createApp } from "./server.js";

let wakeService: () => void = () => {};
let shuttingDown = false;

function requestShutdown(): void {
  shuttingDown = true;
  wakeService();
}

process.once("SIGINT", requestShutdown);
process.once("SIGTERM", requestShutdown);

while (!shuttingDown) {
  const recycleRequested = new Promise<void>((resolve) => {
    wakeService = resolve;
  });
  const config = loadBridgeConfig();
  const app = await createApp({
    config,
    restart: async () => {
      wakeService();
    },
  });

  try {
    await app.listen({ host: config.host, port: config.port });
    app.log.info({ host: config.host, port: config.port }, "Freebuff Bridge listening");
    await recycleRequested;
    await app.close();
  } catch (error) {
    app.log.error(error, "Failed to run Freebuff Bridge");
    process.exitCode = 1;
    shuttingDown = true;
  }
}

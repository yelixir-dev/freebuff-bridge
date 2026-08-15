#!/usr/bin/env node
import "dotenv/config";

import { loadBridgeConfig } from "./config.js";
import { createApp } from "./server.js";

const config = loadBridgeConfig();
const app = await createApp({ config });

try {
  await app.listen({ host: config.host, port: config.port });
  app.log.info({ host: config.host, port: config.port }, "Freebuff Bridge listening");
} catch (error) {
  app.log.error(error, "Failed to start Freebuff Bridge");
  process.exit(1);
}

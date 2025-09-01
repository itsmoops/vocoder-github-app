import { App, Octokit } from "octokit";
import { createDebugMiddleware, createHealthCheck } from "./debug-endpoints.js";

import { EventHandler } from "./utils/event-handler.js";
import { Logger } from "./logger.js";
import { WebhookUtils } from "./utils/webhook-utils.js";
import { createNodeMiddleware } from "@octokit/webhooks";
import dotenv from "dotenv";
import fs from "fs";
import http from "http";

// Load environment variables
dotenv.config();

// Initialize logger
const logger = new Logger("MainApp");

// Validate required environment variables
const requiredEnvVars = ["APP_ID", "APP_URL", "PRIVATE_KEY_PATH", "WEBHOOK_SECRET"];
for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    logger.error(`Missing required environment variable: ${envVar}`);
    process.exit(1);
  }
}

// Create GitHub App instance
const app = new App({
  appId: process.env.APP_ID,
  privateKey: fs.readFileSync(process.env.PRIVATE_KEY_PATH, "utf8"),
  webhooks: {
    secret: process.env.WEBHOOK_SECRET
  },
  ...(process.env.ENTERPRISE_HOSTNAME && {
    Octokit: Octokit.defaults({
      baseUrl: `https://${process.env.ENTERPRISE_HOSTNAME}/api/v3`,
    }),
  }),
});

// Configure Octokit logging
if (process.env.DEBUG === "true") {
  app.octokit.log.debug = (message, ...args) => {
    logger.debug(`[Octokit] ${message}`, args.length > 0 ? args : null);
  };
  app.octokit.log.info = (message, ...args) => {
    logger.info(`[Octokit] ${message}`, args.length > 0 ? args : null);
  };
  app.octokit.log.warn = (message, ...args) => {
    logger.warn(`[Octokit] ${message}`, args.length > 0 ? args : null);
  };
  app.octokit.log.error = (message, ...args) => {
    logger.error(`[Octokit] ${message}`, args.length > 0 ? args : null);
  };
}

// Log app authentication
const { data } = await app.octokit.request("/app");
logger.success(`GitHub App authenticated as '${data.name}'`);

// Initialize utilities
const webhookUtils = new WebhookUtils(app);
const eventHandler = new EventHandler(app, process.env.APP_NAME);

// Webhook event handlers
const prEvents = ["opened", "synchronize", "reopened"];
prEvents.forEach(action => {
  app.webhooks.on(`pull_request.${action}`, async ({ octokit, payload }) => {
    if (await webhookUtils.shouldProcessWebhook(payload)) {
      logger.logWebhook("pull_request", action, payload);
      await eventHandler.handlePullRequestEvent(payload, action);
    }
  });
});

// Handle push events
app.webhooks.on("push", async ({ octokit, payload }) => {
  if (await webhookUtils.shouldProcessWebhook(payload)) {
    logger.logWebhook("push", "push", payload);
    await eventHandler.handlePushEvent(payload);
  }
});

// Error handling
app.webhooks.onError((error) => {
  if (error.name === "AggregateError") {
    logger.error(`Webhook error processing request: ${error.event}`, error);
  } else {
    logger.error("Webhook error", error);
  }
});

// Server setup
const port = process.env.PORT || 3011;
const webhookPath = "/api/webhook";

// Create webhook middleware
const middleware = createNodeMiddleware(app.webhooks, { path: webhookPath });

// Add debug logging for webhook processing
app.webhooks.onAny((event) => {
  logger.info(`Webhook event received: ${event.name}`, {
    event: event.name,
    action: event.payload?.action,
    repository: event.payload?.repository?.full_name,
  });
});

// Add error logging for webhook processing
app.webhooks.onError((error) => {
  logger.error("Webhook processing error", error, {
    errorName: error.name,
    errorMessage: error.message,
    stack: error.stack,
  });
});

// Create HTTP server with debug endpoints
const server = http.createServer((req, res) => {
  // Set CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  // Handle preflight requests
  if (req.method === "OPTIONS") {
    res.writeHead(200);
    res.end();
    return;
  }

  let requestHandled = false;

  // Handle health check
  const healthCheck = createHealthCheck();
  if (healthCheck(req, res)) {
    requestHandled = true;
    return;
  }

  // Handle debug endpoints
  const debugMiddleware = createDebugMiddleware(eventHandler.handlePullRequestEvent.bind(eventHandler));
  if (debugMiddleware(req, res)) {
    requestHandled = true;
    return;
  }

  // Handle webhooks
  if (!requestHandled) {
    middleware(req, res);
  }
});

// Start server with port fallback
function startServer(port) {
  server
    .listen(port, () => {
      logger.success(
        `Vocoder Localization App listening at http://localhost:${port}${webhookPath}`
      );
      logger.info(`Debug endpoints:`);
      logger.info(`  - Health: http://localhost:${port}/health`);
      logger.info(`  - Test: http://localhost:${port}/debug/test`);
      logger.info(`Press Ctrl+C to quit`);
    })
    .on("error", (err) => {
      if (err.code === "EADDRINUSE") {
        logger.warn(`Port ${port} busy, trying ${port + 1}`);
        startServer(port + 1);
      } else {
        logger.error("Server error:", err);
        process.exit(1);
      }
    });
}

startServer(port);

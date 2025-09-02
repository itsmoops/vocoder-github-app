import { App, Octokit } from "octokit";

import { Logger } from "./logger.js";
import { createHealthCheck } from "./debug-endpoints.js";
import { createNodeMiddleware } from "@octokit/webhooks";
import dotenv from "dotenv";
import fs from "fs";
import http from "http";

class WebhookEvent {
  constructor(octokit = {}, payload = {}) {
    this.octokit = octokit;
    this.owner = payload?.repository?.owner?.login;
    this.repo = payload?.repository?.name;
    this.payload = payload;
  }
}

// Load environment variables
dotenv.config();

// Initialize logger
const logger = new Logger("MainApp");

// Validate required environment variables
const requiredEnvVars = [
  "APP_ID",
  "APP_URL",
  "PRIVATE_KEY_PATH",
  "WEBHOOK_SECRET",
];
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
    secret: process.env.WEBHOOK_SECRET,
  },
  ...(process.env.ENTERPRISE_HOSTNAME && {
    Octokit: Octokit.defaults({
      baseUrl: `https://${process.env.ENTERPRISE_HOSTNAME}/api/v3`,
    }),
  }),
});

/**
 * Get file content from a specific commit/branch
 * Returns parsed JSON content or null if file doesn't exist
 */
async function getFileContent(event, path, ref) {
  try {
    const { octokit, owner, repo } = event;

    const { data: fileContent } = await octokit.rest.repos.getContent({
      owner,
      repo,
      path,
      ref,
    });

    if (fileContent.type === "file") {
      return JSON.parse(Buffer.from(fileContent.content, "base64").toString());
    }
  } catch (error) {
    if (error.status === 404) {
      return null; // File doesn't exist
    }
    throw error;
  }
  return null;
}

// /**
//  * Get configuration for the repository
//  * @param {string} ref - Optional branch/commit reference (defaults to main)
//  * Returns null if no config file exists
//  */
// async function getConfig(ref = "main") {
//   try {
//     const configContent = await this.apiUtils.getFileContent(
//       process.env.CONFIG_FILE_PATH,
//       ref
//     );

//     if (configContent) {
//       const validatedConfig = validateConfig(configContent);

//       this.logger.info("Repository configuration loaded", {
//         ref: ref,
//         targetBranches: validatedConfig.targetBranches,
//         sourceFile: validatedConfig.sourceFile,
//         targetLocales: validatedConfig.targetLocales,
//         hasApiKey: !!validatedConfig.projectApiKey,
//       });

//       return validatedConfig;
//     }

//     this.logger.info(
//       `No ${process.env.CONFIG_FILE_PATH} found in repository at ref: ${ref}`
//     );
//     return null;
//   } catch (error) {
//     this.logger.error("Error reading configuration", error);
//     return null;
//   }
// }

// Get configuration with appropriate fallback logic
function getConfigRef(event = {}) {
  const { payload = {} } = event;
  const { pull_request: pullRequest = {}, commits = [], ref = "" } = payload;

  if (pullRequest) {
    const { head = {}, base = {} } = pullRequest;
    const { sha: headSha } = head;
    const { sha: baseSha } = base;
    return headSha || baseSha;
  } else if (commits?.length > 0) {
    return commits[0]?.sha;
  }

  return ref.replace("refs/heads/", "");
}

// Check if a webhook should be processed based on source file changes
async function shouldProcessEvent(event = {}) {
  try {
    const config = await getFileContent(
      event,
      process.env.CONFIG_FILE_PATH,
      getConfigRef(event)
    );

    if (!config?.sourceFile) {
      logger.warn(
        "No configuration or source file found, processing webhook anyway"
      );
      return true;
    }

    // const apiUtils = new GitHubApiUtils(app, owner, repo);

    // if (payload.pull_request) {
    //   return await checkPRSourceFileChanges(apiUtils, payload, config);
    // }

    // if (payload.commits?.length > 0) {
    //   return await checkPushSourceFileChanges(apiUtils, payload, config);
    // }

    return true;
  } catch (error) {
    logger.warn(
      "Error checking source file changes, processing webhook anyway",
      error
    );
    return true;
  }
}

// Log app authentication
const { data } = await app.octokit.request("/app");
logger.success(`GitHub App authenticated as '${data.name}'`);

// Webhook event handlers
const prEvents = ["opened", "synchronize", "reopened"];
for (const action of prEvents) {
  app.webhooks.on(`pull_request.${action}`, async ({ octokit, payload }) => {
    const event = new WebhookEvent(octokit, payload);
    if (await shouldProcessEvent(event)) {
      logger.info(`Processing pull request ${payload.number} ${action}`);
      // await handlePullRequestEvent(payload, action);
    }
  });
}

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
      logger.info("Debug endpoints:");
      logger.info(`  - Health: http://localhost:${port}/health`);
      logger.info(`  - Test: http://localhost:${port}/debug/test`);
      logger.info("Press Ctrl+C to quit");
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

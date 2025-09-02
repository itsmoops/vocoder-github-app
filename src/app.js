import { App, Octokit } from 'octokit';
import { DEFAULT_PORT, ENV_VARS, SUPPORTED_PR_EVENTS, WEBHOOK_PATH } from './utils/constants.js';
import { WebhookEvent, shouldProcessWebhook } from './utils/webhook.js';
import { handlePullRequestEvent, handlePushEvent } from './utils/events.js';

import { ErrorHandler } from './utils/errors.js';
import { Logger } from './utils/logger.js';
import { createNodeMiddleware } from '@octokit/webhooks';
import dotenv from 'dotenv';
import fs from 'fs';
import http from 'http';
import { validateEnvironmentVariables } from './utils/validation.js';

// Load environment variables
dotenv.config();

// Initialize logger
const logger = new Logger('App');

// Validate required environment variables
const requiredEnvVars = [
  ENV_VARS.APP_ID,
  ENV_VARS.APP_URL,
  ENV_VARS.PRIVATE_KEY_PATH,
  ENV_VARS.WEBHOOK_SECRET,
  ENV_VARS.CONFIG_FILE_PATH,
  ENV_VARS.APP_NAME,
  ENV_VARS.APP_EMAIL
];

if (!validateEnvironmentVariables(requiredEnvVars)) {
  logger.error('Missing required environment variables');
  process.exit(1);
}

// Create GitHub App instance
const app = new App({
  appId: process.env.APP_ID,
  privateKey: fs.readFileSync(process.env.PRIVATE_KEY_PATH, 'utf8'),
  webhooks: {
    secret: process.env.WEBHOOK_SECRET
  },
  ...(process.env.ENTERPRISE_HOSTNAME && {
    Octokit: Octokit.defaults({
      baseUrl: `https://${process.env.ENTERPRISE_HOSTNAME}/api/v3`
    })
  })
});

// Log app authentication
const { data } = await app.octokit.request('/app');
logger.success(`GitHub App authenticated as '${data.name}'`);

// Webhook pull request events
for (const action of SUPPORTED_PR_EVENTS) {
  app.webhooks.on(`pull_request.${action}`, async({ octokit, payload }) => {
    try {
      const event = new WebhookEvent(octokit, payload);
      if (await shouldProcessWebhook(event)) {
        await handlePullRequestEvent(event, action);
      }
    } catch (error) {
      await ErrorHandler.handleWebhookError(error, payload, 'PRWebhook');
    }
  });
}

// Handle push events
app.webhooks.on('push', async({ octokit, payload }) => {
  try {
    const event = new WebhookEvent(octokit, payload);
    if (await shouldProcessWebhook(event)) {
      await handlePushEvent(event);
    }
  } catch (error) {
    await ErrorHandler.handleWebhookError(error, payload, 'PushWebhook');
  }
});

// Comprehensive error handling for webhooks
app.webhooks.onError((error) => {
  ErrorHandler.handleWebhookError(error, null, 'WebhookError');
});

// Server setup
const port = process.env.PORT || DEFAULT_PORT;
const webhookPath = WEBHOOK_PATH;

// Create webhook middleware
const middleware = createNodeMiddleware(app.webhooks, { path: webhookPath });

// Add debug logging for webhook processing
app.webhooks.onAny((event) => {
  logger.info(`Webhook event received: ${event.name}`, {
    event: event.name,
    action: event.payload?.action,
    repository: event.payload?.repository?.full_name
  });
});

// Create HTTP server
const server = http.createServer((req, res) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // Handle health check
  if (req.url === '/health' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      version: process.version
    }));
    return;
  }

  // Handle webhooks
  middleware(req, res);
});

// Start server with port fallback
function startServer(port) {
  server
    .listen(port, () => {
      logger.success(
        `Vocoder Localization App listening at http://localhost:${port}${webhookPath}`
      );
      logger.info('Press Ctrl+C to quit');
    })
    .on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        logger.warn(`Port ${port} busy, trying ${port + 1}`);
        startServer(port + 1);
      } else {
        logger.error('Server error:', err);
        process.exit(1);
      }
    });
}

startServer(port);

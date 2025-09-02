import { createMockPRData, createMockRepositoryData, createMockWebhookPayload } from './debug/mock-data.js';

import { Logger } from './utils/logger.js';
import { createMockOctokit } from './debug/mock-api.js';

// Helper function to send JSON response
function sendJsonResponse(res, statusCode, data) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(data, null, 2))
}

export function createHealthCheck() {
  return (req, res) => {
    if (req.url === '/health' && req.method === 'GET') {
      const logger = new Logger('HealthCheck')
      logger.info('Health check requested')

      sendJsonResponse(res, 200, {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        version: process.version
      })
      return true
    }
    return false
  }
}

export function createDebugMiddleware(handlePullRequestEvent) {
  return (req, res) => {
    if (req.url === '/debug/test' && req.method === 'POST') {
      const logger = new Logger('DebugEndpoints')
      logger.info('Debug test endpoint hit')

      // Create mock data for testing
      const mockPR = createMockPRData();
      const mockRepository = createMockRepositoryData();
      const mockPayload = createMockWebhookPayload();

      // Create mock Octokit instance for testing
      const mockOctokit = createMockOctokit();

      // Simulate the event processing
      logger.info('Processing debug event: pull_request.opened')

      // Create event handler and call with mock data
      import('./src/utils/event-handler.js').then(({ EventHandler }) => {
        const eventHandler = new EventHandler(mockOctokit, 'TestApp');
        return eventHandler.handlePullRequestEvent(mockPayload, 'opened');
      })
        .then(() => {
          sendJsonResponse(res, 200, {
            success: true,
            message: 'Debug event processed successfully',
            event: 'pull_request.opened',
            mockData: {
              repository: mockRepository.name,
              prNumber: mockPR.number,
              baseBranch: mockPR.base.ref,
              headBranch: mockPR.head.ref
            }
          })
        })
        .catch((error) => {
          logger.error('Debug event processing failed', error)
          sendJsonResponse(res, 500, {
            success: false,
            message: 'Debug event processing failed',
            error: error.message
          })
        })

      return true
    }

    return false
  }
}

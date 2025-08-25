import { Logger } from './logger.js'

const logger = new Logger('DebugEndpoints')

// Mock webhook payloads for testing
export const mockPayloads = {
  pullRequestOpened: {
    action: 'opened',
    pull_request: {
      number: 123,
      head: { sha: 'abc123' },
      base: { ref: 'main' }
    },
    repository: {
      owner: { login: 'testuser' },
      name: 'test-repo'
    },
    sender: { login: 'testuser' }
  },
  
  push: {
    ref: 'refs/heads/main',
    after: 'def456',
    repository: {
      owner: { login: 'testuser' },
      name: 'test-repo'
    },
    sender: { login: 'testuser' }
  },
  
  installation: {
    action: 'created',
    repositories: [
      {
        owner: { login: 'testuser' },
        name: 'test-repo'
      }
    ],
    sender: { login: 'testuser' }
  }
}

// Helper function to send JSON response
function sendJsonResponse(res, statusCode, data) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(data, null, 2))
}

// Debug middleware for testing
export function createDebugMiddleware(webhookHandler) {
  return (req, res) => {
    if (req.method === 'POST' && req.url === '/debug/test') {
      logger.info('Debug test endpoint hit')
      
      let body = ''
      req.on('data', chunk => {
        body += chunk.toString()
      })
      
      req.on('end', () => {
        try {
          const { eventType, payload } = JSON.parse(body) || {}
          
          if (!eventType || !payload) {
            return sendJsonResponse(res, 400, {
              error: 'Missing eventType or payload',
              example: {
                eventType: 'pull_request.opened',
                payload: mockPayloads.pullRequestOpened
              }
            })
          }
          
          // Simulate webhook processing
          logger.info(`Processing debug event: ${eventType}`)
          
          // Create mock octokit instance for testing
          const mockOctokit = {
            rest: {
              repos: {
                getContent: async () => ({
                  data: {
                    type: 'file',
                    content: Buffer.from(JSON.stringify({
                      "hello": "world",
                      "welcome": "to vocoder"
                    })).toString('base64')
                  }
                }),
                createOrUpdateFileContents: async (params) => {
                  logger.info('Mock file creation', params)
                  return { data: { content: { sha: 'mock-sha' } } }
                },
                createRef: async (params) => {
                  logger.info('Mock branch creation', params)
                  return { data: { ref: 'refs/heads/mock-branch' } }
                },
                create: async (params) => {
                  logger.info('Mock PR creation', params)
                  return { data: { number: 999, html_url: 'https://github.com/test/pr/999' } }
                }
              },
              issues: {
                createComment: async (params) => {
                  logger.info('Mock comment creation', params)
                  return { data: { id: 123 } }
                }
              }
            }
          }
          
          // Process the event
          webhookHandler(mockOctokit, payload, eventType.split('.')[0])
            .then(result => {
              sendJsonResponse(res, 200, {
                success: true,
                eventType,
                result: 'Event processed successfully',
                logs: 'Check console for detailed logs'
              })
            })
            .catch(error => {
              logger.error('Debug event processing failed', error)
              sendJsonResponse(res, 500, {
                error: 'Event processing failed',
                message: error.message,
                stack: error.stack
              })
            })
          
        } catch (error) {
          logger.error('Debug endpoint JSON parsing failed', error)
          sendJsonResponse(res, 400, {
            error: 'Invalid JSON payload',
            message: error.message
          })
        }
      })
      
      return true // Indicate we handled this request
    }
    
    return false // Let other handlers process this request
  }
}

// Health check endpoint
export function createHealthCheck() {
  return (req, res) => {
    if (req.url === '/health') {
      sendJsonResponse(res, 200, {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        env: {
          nodeEnv: process.env.NODE_ENV,
          debug: process.env.DEBUG,
          hasAppId: !!process.env.APP_ID,
          hasPrivateKey: !!process.env.PRIVATE_KEY_PATH
        }
      })
      return true // Indicate we handled this request
    }
    
    return false // Let other handlers process this request
  }
} 
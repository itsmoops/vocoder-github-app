import { Logger } from './logger.js'

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
      
      // Create mock pull request data for testing
      const mockPR = {
        number: 123,
        title: 'Test PR for localization',
        base: {
          ref: 'main',
          sha: 'base-sha-123'
        },
        head: {
          ref: 'feature/localization-test',
          sha: 'head-sha-456'
        }
      }
      
      const mockRepository = {
        owner: { login: 'testuser' },
        name: 'test-repo'
      }
      
      const mockPayload = {
        repository: mockRepository,
        pull_request: mockPR,
        action: 'opened'
      }
      
      // Create mock Octokit instance for testing
      const mockOctokit = {
        rest: {
          repos: {
            getContent: async (params) => {
              logger.info('Mock repos.getContent', params)
              if (params.path === '.vocoder/config.json') {
                return {
                  data: {
                    type: 'file',
                    content: Buffer.from(JSON.stringify({
                      targetBranches: ['main'],
                      sourceFiles: ['src/locales/en.json'],
                      projectApiKey: 'test-api-key',
                      outputDir: 'src/locales',
                      languages: ['es', 'fr']
                    })).toString('base64')
                  }
                }
              } else if (params.path === 'src/locales/en.json') {
                return {
                  data: {
                    type: 'file',
                    content: Buffer.from(JSON.stringify({
                      welcome: 'Welcome to our app',
                      goodbye: 'Goodbye!'
                    })).toString('base64')
                  }
                }
              }
              return { data: { type: 'file', content: '' } }
            },
            createCommitStatus: async (params) => {
              logger.info('Mock createCommitStatus', params)
              return { data: { id: 'mock-status-id' } }
            }
          },
          git: {
            getTree: async (params) => {
              logger.info('Mock git getTree', params)
              return { data: { sha: 'mock-tree-sha' } }
            },
            createBlob: async (params) => {
              logger.info('Mock git createBlob', params)
              return { data: { sha: 'mock-blob-sha' } }
            },
            createTree: async (params) => {
              logger.info('Mock git createTree', params)
              return { data: { sha: 'mock-new-tree-sha' } }
            },
            createCommit: async (params) => {
              logger.info('Mock git createCommit', params)
              return { data: { sha: 'mock-commit-sha' } }
            },
            updateRef: async (params) => {
              logger.info('Mock git updateRef', params)
              return { data: { ref: params.ref } }
            }
          }
        }
      }
      
      // Simulate the event processing
      logger.info('Processing debug event: pull_request.opened')
      
      // Create event handler and call with mock data
      import('./utils/event-handler.js').then(({ EventHandler }) => {
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
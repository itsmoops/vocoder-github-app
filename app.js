import { App, Octokit } from 'octokit'
import { createDebugMiddleware, createHealthCheck } from './debug-endpoints.js'

import { ConfigManager } from './config-manager.js'
import { LocalizationProcessor } from './localization-processor.js'
import { Logger } from './logger.js'
import { createNodeMiddleware } from '@octokit/webhooks'
import dotenv from 'dotenv'
import fs from 'fs'
import http from 'http'

// Load environment variables
dotenv.config()

// Initialize logger
const logger = new Logger('MainApp')

// Validate required environment variables
const requiredEnvVars = ['APP_ID', 'PRIVATE_KEY_PATH', 'WEBHOOK_SECRET']
for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    logger.error(`Missing required environment variable: ${envVar}`)
    process.exit(1)
  }
}

// Load GitHub App credentials
const appId = process.env.APP_ID
const privateKeyPath = process.env.PRIVATE_KEY_PATH
const privateKey = fs.readFileSync(privateKeyPath, 'utf8')
const webhookSecret = process.env.WEBHOOK_SECRET
const enterpriseHostname = process.env.ENTERPRISE_HOSTNAME

// Create GitHub App instance
const app = new App({
  appId,
  privateKey,
  webhooks: { secret: webhookSecret },
  ...(enterpriseHostname && {
    Octokit: Octokit.defaults({
      baseUrl: `https://${enterpriseHostname}/api/v3`
    })
  })
})

// Configure Octokit logging
if (process.env.DEBUG === 'true') {
  app.octokit.log.debug = (message, ...args) => {
    logger.debug(`[Octokit] ${message}`, args.length > 0 ? args : null)
  }
  app.octokit.log.info = (message, ...args) => {
    logger.info(`[Octokit] ${message}`, args.length > 0 ? args : null)
  }
  app.octokit.log.warn = (message, ...args) => {
    logger.warn(`[Octokit] ${message}`, args.length > 0 ? args : null)
  }
  app.octokit.log.error = (message, ...args) => {
    logger.error(`[Octokit] ${message}`, args.length > 0 ? args : null)
  }
}

// Log app authentication
const { data } = await app.octokit.request('/app')
logger.success(`GitHub App authenticated as '${data.name}'`)

// ============================================================================
// WEBHOOK EVENT HANDLERS
// ============================================================================

// Handle pull request events (opened, updated, synchronized)
app.webhooks.on('pull_request.opened', async ({ octokit, payload }) => {
  logger.logWebhook('pull_request', 'opened', payload)
  await handlePullRequestEvent(octokit, payload, 'opened')
})

app.webhooks.on('pull_request.synchronize', async ({ octokit, payload }) => {
  logger.logWebhook('pull_request', 'synchronize', payload)
  await handlePullRequestEvent(octokit, payload, 'synchronize')
})

app.webhooks.on('pull_request.reopened', async ({ octokit, payload }) => {
  logger.logWebhook('pull_request', 'reopened', payload)
  await handlePullRequestEvent(octokit, payload, 'reopened')
})

// Handle push events to target branches (for base branch changes)
app.webhooks.on('push', async ({ octokit, payload }) => {
  logger.logWebhook('push', 'push', payload)
  await handlePushEvent(octokit, payload)
})

// Handle new installations
app.webhooks.on('installation.created', async ({ octokit, payload }) => {
  logger.logWebhook('installation', 'created', payload)
  logger.info('Installation webhook received', {
    action: payload.action,
    installationId: payload.installation.id,
    repositories: payload.repositories?.map(r => r.full_name) || []
  })
  await setupNewInstallation(octokit, payload)
})

// ============================================================================
// CORE EVENT PROCESSING
// ============================================================================

async function handlePullRequestEvent(octokit, payload, action) {
  const { repository, pull_request } = payload
  const owner = repository.owner.login
  const repo = repository.name
  const prNumber = pull_request.number
  
  const eventLogger = new Logger(`PR:${action}`)
  const timer = eventLogger.time(`Processing PR #${prNumber} ${action}`)
  
  try {
    eventLogger.info(`Processing PR #${prNumber} ${action} for ${owner}/${repo}`)
    
    // Get repository configuration
    const configManager = new ConfigManager(octokit, owner, repo)
    const config = await configManager.getConfig()
    
    if (!config) {
      eventLogger.warn('No configuration found, skipping localization processing')
      return
    }
    
    eventLogger.logConfig(config)
    
    // Check if this PR targets a monitored branch
    const targetBranch = pull_request.base.ref
    if (!config.targetBranches.includes(targetBranch)) {
      eventLogger.info(`PR targets branch '${targetBranch}' which is not monitored. Monitored branches: ${config.targetBranches.join(', ')}`)
      return
    }
    
    eventLogger.info(`PR targets monitored branch '${targetBranch}', proceeding with localization`)
    
    // Set status check to pending
    await setStatusCheck(octokit, owner, repo, pull_request.head.sha, 'pending', 'Localization processing in progress...')
    
    // Process localization changes
    const processor = new LocalizationProcessor(octokit, owner, repo, config)
    const result = await processor.processPullRequest(pull_request, config)
    
    if (result.success) {
      // Set status check to success
      await setStatusCheck(octokit, owner, repo, pull_request.head.sha, 'success', 
        `Localization complete: ${result.changesProcessed} changes processed`)
      
      eventLogger.success(`Localization processing completed successfully`, {
        changesProcessed: result.changesProcessed,
        languagesUpdated: result.languagesUpdated
      })
    } else {
      // Set status check to failure
      await setStatusCheck(octokit, owner, repo, pull_request.head.sha, 'failure', 
        `Localization failed: ${result.error}`)
      
      eventLogger.error(`Localization processing failed`, result.error)
    }
    
    timer.end()
    
  } catch (error) {
    eventLogger.error(`Error processing PR #${prNumber}`, error)
    
    // Set status check to failure
    try {
      await setStatusCheck(octokit, owner, repo, pull_request.head.sha, 'failure', 
        `Localization error: ${error.message}`)
    } catch (statusError) {
      eventLogger.error('Failed to set status check', statusError)
    }
  }
}

async function handlePushEvent(octokit, payload) {
  const { repository, ref, commits } = payload
  const owner = repository.owner.login
  const repo = repository.name
  const branch = ref.replace('refs/heads/', '')
  
  const eventLogger = new Logger('PushEvent')
  const timer = eventLogger.time(`Processing push to ${branch}`)
  
  try {
    eventLogger.info(`Processing push to branch '${branch}' in ${owner}/${repo}`)
    
    // Get repository configuration
    const configManager = new ConfigManager(octokit, owner, repo)
    const config = await configManager.getConfig()
    
    if (!config || !config.targetBranches.includes(branch)) {
      eventLogger.info(`Branch '${branch}' not monitored or no config found, skipping`)
      return
    }
    
    eventLogger.info(`Push to monitored branch '${branch}' detected, checking for open PRs`)
    
    // Find open PRs targeting this branch
    const { data: openPRs } = await octokit.rest.pulls.list({
      owner,
      repo,
      state: 'open',
      base: branch
    })
    
    if (openPRs.length === 0) {
      eventLogger.info('No open PRs targeting this branch')
      return
    }
    
    eventLogger.info(`Found ${openPRs.length} open PR(s) targeting branch '${branch}'`)
    
    // Re-process each open PR to handle base branch changes
    for (const pr of openPRs) {
      eventLogger.info(`Re-processing PR #${pr.number} due to base branch changes`)
      
      try {
        const processor = new LocalizationProcessor(octokit, owner, repo, config)
        const result = await processor.processPullRequest(pr, config)
        
        if (result.success) {
          eventLogger.success(`Re-processed PR #${pr.number} successfully`, {
            changesProcessed: result.changesProcessed,
            languagesUpdated: result.languagesUpdated
          })
        } else {
          eventLogger.warn(`Re-processing PR #${pr.number} failed`, result.error)
        }
      } catch (error) {
        eventLogger.error(`Error re-processing PR #${pr.number}`, error)
      }
    }
    
    timer.end()
    
  } catch (error) {
    eventLogger.error(`Error processing push event`, error)
  }
}

async function setupNewInstallation(octokit, payload) {
  const { repositories } = payload
  const installLogger = new Logger('Installation')
  
  installLogger.info(`Setting up new installation for ${repositories.length} repositories`)
  
  for (const repo of repositories) {
    try {
      installLogger.info(`Setting up new installation for ${repo.full_name}`)
      const configManager = new ConfigManager(octokit, repo.owner.login, repo.name)
      
      installLogger.info(`Checking if config already exists for ${repo.full_name}`)
      const existingConfig = await configManager.getConfig()
      
      if (existingConfig) {
        installLogger.info(`Config already exists for ${repo.full_name}, skipping creation`)
        continue
      }
      
      installLogger.info(`No config found, creating default config for ${repo.full_name}`)
      await configManager.createDefaultConfig()
      installLogger.success(`Created default config for ${repo.full_name}`)
    } catch (error) {
      installLogger.error(`Error setting up ${repo.full_name}`, error)
    }
  }
}

// ============================================================================
// STATUS CHECK MANAGEMENT
// ============================================================================

async function setStatusCheck(octokit, owner, repo, sha, state, description) {
  try {
    await octokit.rest.repos.createCommitStatus({
      owner,
      repo,
      sha,
      state,
      description,
      context: 'Vocoder Localization',
      target_url: process.env.APP_URL || 'https://github.com/your-org/vocoder'
    })
    
    logger.info(`Set status check to ${state}: ${description}`)
  } catch (error) {
    logger.error('Failed to set status check', error)
  }
}

// ============================================================================
// ERROR HANDLING
// ============================================================================

app.webhooks.onError((error) => {
  if (error.name === 'AggregateError') {
    logger.error(`Webhook error processing request: ${error.event}`, error)
  } else {
    logger.error('Webhook error', error)
  }
})

// ============================================================================
// SERVER SETUP
// ============================================================================

const port = process.env.PORT || 3010
const webhookPath = '/api/webhook'

// Create webhook middleware
const middleware = createNodeMiddleware(app.webhooks, { path: webhookPath })

// Create HTTP server with debug endpoints
const server = http.createServer((req, res) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.writeHead(200)
    res.end()
    return
  }
  
  let requestHandled = false
  
  // Handle health check
  const healthCheck = createHealthCheck()
  if (healthCheck(req, res)) {
    requestHandled = true
    return
  }
  
  // Handle debug endpoints
  const debugMiddleware = createDebugMiddleware(handlePullRequestEvent)
  if (debugMiddleware(req, res)) {
    requestHandled = true
    return
  }
  
  // Handle webhooks
  if (!requestHandled) {
    middleware(req, res)
  }
})

// Start server with port fallback
function startServer(portToTry) {
  server.listen(portToTry, () => {
    logger.success(`Vocoder Localization App listening at http://localhost:${portToTry}${webhookPath}`)
    logger.info(`Debug endpoints:`)
    logger.info(`  - Health: http://localhost:${portToTry}/health`)
    logger.info(`  - Test: http://localhost:${portToTry}/debug/test`)
    logger.info(`Press Ctrl+C to quit`)
  }).on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      logger.warn(`Port ${portToTry} busy, trying ${portToTry + 1}`)
      startServer(portToTry + 1)
    } else {
      logger.error('Server error:', err)
      process.exit(1)
    }
  })
}

startServer(port)

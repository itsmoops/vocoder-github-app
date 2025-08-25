import { App, Octokit } from 'octokit'
import { createDebugMiddleware, createHealthCheck } from './debug-endpoints.js'

import { ConfigManager } from './config-manager.js'
import { LocalizationProcessor } from './localization-processor.js'
import { Logger } from './logger.js'
import { createNodeMiddleware } from '@octokit/webhooks'
import dotenv from 'dotenv'
import fs from 'fs'
import http from 'http'

// Load environment variables from .env file
dotenv.config()

// Set configured values
const appId = process.env.APP_ID
const privateKeyPath = process.env.PRIVATE_KEY_PATH
const privateKey = fs.readFileSync(privateKeyPath, 'utf8')
const secret = process.env.WEBHOOK_SECRET
const enterpriseHostname = process.env.ENTERPRISE_HOSTNAME

// Create logger instance
const logger = new Logger('MainApp')

// Create an authenticated Octokit client authenticated as a GitHub App
const app = new App({
  appId,
  privateKey,
  webhooks: {
    secret
  },
  ...(enterpriseHostname && {
    Octokit: Octokit.defaults({
      baseUrl: `https://${enterpriseHostname}/api/v3`
    })
  })
})

// Configure Octokit logging to work with our custom logger
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

// Optional: Get & log the authenticated app's name
const { data } = await app.octokit.request('/app')

// Read more about custom logging: https://github.com/octokit/core.js#logging
logger.success(`GitHub App authenticated as '${data.name}'`)

// Handle pull request events
app.webhooks.on('pull_request.opened', async ({ octokit, payload }) => {
  logger.logWebhook('pull_request', 'opened', payload)
  await handleLocalizationEvent(octokit, payload, 'pull_request')
})

app.webhooks.on('pull_request.synchronize', async ({ octokit, payload }) => {
  logger.logWebhook('pull_request', 'synchronize', payload)
  await handleLocalizationEvent(octokit, payload, 'pull_request')
})

// Handle push events
app.webhooks.on('push', async ({ octokit, payload }) => {
  logger.logWebhook('push', 'push', payload)
  await handleLocalizationEvent(octokit, payload, 'push')
})

// Handle repository installation
app.webhooks.on('installation.created', async ({ octokit, payload }) => {
  logger.logWebhook('installation', 'created', payload)
  await setupNewInstallation(octokit, payload)
})

async function handleLocalizationEvent(octokit, payload, eventType) {
  const { repository, pull_request, ref } = payload
  const owner = repository.owner.login
  const repo = repository.name
  
  const eventLogger = new Logger(`Event:${eventType}`)
  const timer = eventLogger.time(`Processing ${eventType} event`)
  
  // Declare variables outside try block to avoid scope issues
  let targetBranch, sourceRef
  
  try {
    eventLogger.info(`Processing localization event for ${owner}/${repo}`)
    
    // Get configuration for this repository
    const configManager = new ConfigManager(octokit, owner, repo)
    const config = await configManager.getConfig()
    eventLogger.logConfig(config)
    
    // Determine the branch to process
    if (eventType === 'pull_request') {
      targetBranch = pull_request.base.ref
      sourceRef = pull_request.head.sha
    } else if (eventType === 'push') {
      targetBranch = ref.replace('refs/heads/', '')
      sourceRef = payload.after
    }
    
    eventLogger.info(`Processing branch: ${targetBranch}, source ref: ${sourceRef}`)
    
    // Check if this branch should be processed
    if (!config.targetBranches.includes(targetBranch)) {
      eventLogger.info(`Branch ${targetBranch} not in target branches: ${config.targetBranches.join(', ')}`)
      return
    }
    
    eventLogger.info(`Branch ${targetBranch} is a target branch, proceeding with localization`)
    
    // Process localization
    const processor = new LocalizationProcessor(octokit, owner, repo)
    
    // Find and read source file
    const sourceFile = await processor.findSourceFile(config.sourceFiles, sourceRef)
    if (!sourceFile) {
      eventLogger.warn('No source localization file found')
      return
    }
    
    eventLogger.success(`Found source file: ${sourceFile.path}`, {
      stringCount: Object.keys(sourceFile.content).length
    })
    
    // Mock translation API call
    const translationTimer = eventLogger.time('Translation API call')
    const translations = await processor.mockTranslateStrings(
      sourceFile.content,
      config.projectApiKey,
      config.languages
    )
    translationTimer.end()
    
    eventLogger.success(`Translation completed for ${Object.keys(translations).length} languages`)
    
    if (config.createPRs) {
      // Create translation branch
      const translationBranch = config.translationBranch
      await processor.createOrUpdateBranch(targetBranch, translationBranch)
      
      // Create translation files
      const files = await processor.createTranslationFiles(
        translations,
        config.outputDir,
        translationBranch,
        targetBranch
      )
      
      // Commit files
      await processor.commitTranslationFiles(files, translationBranch, 'Add translations')
      
      // Create pull request
      const prTitle = `🌍 Add localization files (${config.languages.join(', ')})`
      const prBody = `This PR adds localization files for the following languages: ${config.languages.join(', ')}
      
Generated from source file: \`${sourceFile.path}\`
      
**Languages added:**
${config.languages.map(lang => `- ${lang}: \`${config.outputDir}/${lang}.json\``).join('\n')}
      
*This PR was automatically generated by the Vocoder localization app.*`
      
      const pr = await processor.createPullRequest(targetBranch, translationBranch, prTitle, prBody)
      
      if (pr && eventType === 'pull_request') {
        // Comment on the original PR
        await octokit.rest.issues.createComment({
          owner,
          repo,
          issue_number: pull_request.number,
          body: `🎉 Localization processing complete! Check out the new translation files in PR #${pr.number}`
        })
        eventLogger.success(`Commented on PR #${pull_request.number}`)
      }
      
      eventLogger.success(`Created translation PR #${pr.number}`)
    }
    
    eventLogger.success(`Localization processing completed successfully`)
    timer.end()
    
  } catch (error) {
    eventLogger.error(`Error processing localization`, error, {
      owner,
      repo,
      eventType,
      targetBranch: targetBranch || 'unknown'
    })
    if (error.response) {
      eventLogger.error(`GitHub API Error: ${error.response.status} - ${error.response.data.message}`)
    }
  }
}

async function setupNewInstallation(octokit, payload) {
  const { repositories } = payload
  const installLogger = new Logger('Installation')
  
  for (const repo of repositories) {
    try {
      installLogger.info(`Setting up new installation for ${repo.full_name}`)
      const configManager = new ConfigManager(octokit, repo.owner.login, repo.name)
      await configManager.createDefaultConfig()
      installLogger.success(`Created default config for ${repo.full_name}`)
    } catch (error) {
      installLogger.error(`Error setting up ${repo.full_name}`, error)
    }
  }
}

// Optional: Handle errors
app.webhooks.onError((error) => {
  if (error.name === 'AggregateError') {
    // Log Secret verification errors
    logger.error(`Webhook error processing request: ${error.event}`, error)
  } else {
    logger.error('Webhook error', error)
  }
})

// Launch a web server to listen for GitHub webhooks
const port = process.env.PORT || 3010
const path = '/api/webhook'
const localWebhookUrl = `http://localhost:${port}${path}`

// See https://github.com/octokit/webhooks.js/#createnodemiddleware for all options
const middleware = createNodeMiddleware(app.webhooks, { path })

// Create HTTP server with debug endpoints
const server = http.createServer((req, res) => {
  // Set CORS headers for debug endpoints
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
  const debugMiddleware = createDebugMiddleware(handleLocalizationEvent)
  if (debugMiddleware(req, res)) {
    requestHandled = true
    return
  }
  
  // Handle webhooks (only if request wasn't handled by debug endpoints)
  if (!requestHandled) {
    middleware(req, res)
  }
})

// Function to start server with port fallback
function startServer(portToTry) {
  server.listen(portToTry, () => {
    logger.success(`Vocoder Localization App is listening for events at: http://localhost:${portToTry}${path}`)
    logger.info(`Debug endpoints available:`)
    logger.info(`  - Health check: http://localhost:${portToTry}/health`)
    logger.info(`  - Test webhook: http://localhost:${portToTry}/debug/test`)
    logger.info(`Press Ctrl + C to quit.`)
  }).on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      logger.warn(`Port ${portToTry} is busy, trying ${portToTry + 1}`)
      startServer(portToTry + 1)
    } else {
      logger.error('Server error:', err)
      process.exit(1)
    }
  })
}

// Start the server
startServer(port)

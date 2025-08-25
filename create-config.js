#!/usr/bin/env node

/**
 * Manual script to create Vocoder configuration in a repository
 * Use this if the automatic installation setup isn't working
 */

import { App } from 'octokit'
import dotenv from 'dotenv'
import fs from 'fs'

// Load environment variables
dotenv.config()

const appId = process.env.APP_ID
const privateKeyPath = process.env.PRIVATE_KEY_PATH
const privateKey = fs.readFileSync(privateKeyPath, 'utf8')

// Create GitHub App instance
const app = new App({
  appId,
  privateKey
})

async function createConfig(owner, repo) {
  try {
    console.log(`Creating Vocoder config for ${owner}/${repo}...`)
    
    // Get installation token for the repository
    const { data: installations } = await app.octokit.rest.apps.listInstallations()
    const installation = installations.find(inst => 
      inst.account.login === owner
    )
    
    if (!installation) {
      console.error(`No installation found for ${owner}`)
      return
    }
    
    console.log(`Found installation ID: ${installation.id}`)
    
    // Create installation token
    const { data: token } = await app.octokit.rest.apps.createInstallationAccessToken({
      installation_id: installation.id
    })
    
    // Create Octokit instance with installation token
    const octokit = app.getInstallationOctokit(installation.id)
    
    // Default configuration
    const defaultConfig = {
      targetBranches: ["main"],
      sourceFiles: ["src/locales/en.json"],
      projectApiKey: "",
      outputDir: "src/locales",
      languages: ["es", "fr"]
    }
    
    // Create .vocoder directory first
    try {
      await octokit.rest.repos.createOrUpdateFileContents({
        owner,
        repo,
        path: '.vocoder/.gitkeep',
        message: 'Add .vocoder directory for Vocoder configuration',
        content: Buffer.from('').toString('base64'),
        branch: 'main'
      })
      console.log('Created .vocoder directory')
    } catch (error) {
      if (error.status !== 422) { // 422 = file already exists
        console.log('Directory creation error (may already exist):', error.message)
      }
    }
    
    // Create config file
    await octokit.rest.repos.createOrUpdateFileContents({
      owner,
      repo,
      path: '.vocoder/config.json',
      message: 'Add Vocoder localization configuration',
      content: Buffer.from(JSON.stringify(defaultConfig, null, 2)).toString('base64'),
      branch: 'main'
    })
    
    console.log('✅ Successfully created .vocoder/config.json')
    console.log('Configuration:', JSON.stringify(defaultConfig, null, 2))
    
  } catch (error) {
    console.error('❌ Error creating config:', error.message)
    if (error.response) {
      console.error('GitHub API Error:', error.response.status, error.response.data.message)
    }
  }
}

// Get command line arguments
const [owner, repo] = process.argv.slice(2)

if (!owner || !repo) {
  console.log('Usage: node create-config.js <owner> <repo>')
  console.log('Example: node create-config.js yourusername vocoder-consumer')
  process.exit(1)
}

createConfig(owner, repo) 
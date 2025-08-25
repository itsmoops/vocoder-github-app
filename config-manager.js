import { defaultConfig } from './config-schema.js'

export class ConfigManager {
  constructor(octokit, owner, repo) {
    this.octokit = octokit
    this.owner = owner
    this.repo = repo
  }

  async getConfig() {
    try {
      // Try to read .vocoder/config.json first
      const configPath = '.vocoder/config.json'
      const response = await this.octokit.rest.repos.getContent({
        owner: this.owner,
        repo: this.repo,
        path: configPath,
        ref: 'main' // Always read from main branch for config
      })

      if (response.data.type === 'file') {
        const content = Buffer.from(response.data.content, 'base64').toString('utf8')
        const config = JSON.parse(content)
        return this.validateAndMergeConfig(config)
      }
    } catch (error) {
      if (error.status === 404) {
        console.log(`No config found at .vocoder/config.json, using defaults`)
        return defaultConfig
      }
      console.error(`Error reading config: ${error.message}`)
      return defaultConfig
    }

    return defaultConfig
  }

  validateAndMergeConfig(config) {
    // Merge with defaults and validate
    const merged = { ...defaultConfig, ...config }
    
    // Ensure required fields exist
    if (!merged.projectApiKey) {
      console.warn('No project API key found in config')
    }
    
    if (!merged.targetBranches || merged.targetBranches.length === 0) {
      merged.targetBranches = ['main']
    }
    
    if (!merged.sourceFiles || merged.sourceFiles.length === 0) {
      merged.sourceFiles = ['src/locales/en.json']
    }
    
    return merged
  }

  async createDefaultConfig() {
    const configContent = JSON.stringify(defaultConfig, null, 2)
    
    try {
      await this.octokit.rest.repos.createOrUpdateFileContents({
        owner: this.owner,
        repo: this.repo,
        path: '.vocoder/config.json',
        message: 'Add Vocoder localization configuration',
        content: Buffer.from(configContent).toString('base64'),
        branch: 'main'
      })
      console.log('Created default configuration file')
    } catch (error) {
      console.error(`Error creating config: ${error.message}`)
    }
  }
} 
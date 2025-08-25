import { Logger } from './logger.js'
import { defaultConfig } from './config-schema.js'

export class ConfigManager {
  constructor(octokit, owner, repo) {
    this.octokit = octokit
    this.owner = owner
    this.repo = repo
    this.logger = new Logger('ConfigManager')
  }

  /**
   * Get configuration for the repository
   * Returns null if no config file exists
   */
  async getConfig() {
    try {
      const { data: configFile } = await this.octokit.rest.repos.getContent({
        owner: this.owner,
        repo: this.repo,
        path: '.vocoder/config.json',
        ref: 'main' // Always read from main branch for consistency
      })

      if (configFile.type === 'file') {
        const config = JSON.parse(Buffer.from(configFile.content, 'base64').toString())
        
        // Validate and merge with defaults
        const validatedConfig = this.validateConfig(config)
        
        this.logger.info('Repository configuration loaded', {
          targetBranches: validatedConfig.targetBranches,
          sourceFiles: validatedConfig.sourceFiles,
          languages: validatedConfig.languages,
          hasApiKey: !!validatedConfig.projectApiKey
        })
        
        return validatedConfig
      }
      
      return null
    } catch (error) {
      if (error.status === 404) {
        this.logger.info('No .vocoder/config.json found in repository')
        return null
      }
      
      this.logger.error('Error reading configuration', error)
      return null
    }
  }

  /**
   * Create default configuration for new installations
   */
  async createDefaultConfig() {
    try {
      // Check if config already exists
      try {
        await this.octokit.rest.repos.getContent({
          owner: this.owner,
          repo: this.repo,
          path: '.vocoder/config.json'
        })
        this.logger.info('Configuration already exists, skipping creation')
        return
      } catch (error) {
        if (error.status !== 404) {
          throw error
        }
      }

      // Create .vocoder directory if it doesn't exist
      try {
        await this.octokit.rest.repos.getContent({
          owner: this.owner,
          repo: this.repo,
          path: '.vocoder'
        })
      } catch (error) {
        if (error.status === 404) {
          // Create directory by creating a placeholder file
          await this.octokit.rest.repos.createOrUpdateFileContents({
            owner: this.owner,
            repo: this.repo,
            path: '.vocoder/.gitkeep',
            message: 'Add .vocoder directory for Vocoder configuration',
            content: Buffer.from('').toString('base64'),
            branch: 'main'
          })
        }
      }

      // Create default config file
      const configContent = JSON.stringify(defaultConfig, null, 2)
      
      await this.octokit.rest.repos.createOrUpdateFileContents({
        owner: this.owner,
        repo: this.repo,
        path: '.vocoder/config.json',
        message: 'Add Vocoder localization configuration',
        content: Buffer.from(configContent).toString('base64'),
        branch: 'main'
      })

      this.logger.success('Created default configuration file')
      
    } catch (error) {
      this.logger.error('Error creating default configuration', error)
      throw error
    }
  }

  /**
   * Validate configuration and merge with defaults
   */
  validateConfig(config) {
    const validated = { ...defaultConfig, ...config }
    
    // Ensure required fields exist
    if (!validated.targetBranches || !Array.isArray(validated.targetBranches)) {
      validated.targetBranches = defaultConfig.targetBranches
    }
    
    if (!validated.sourceFiles || !Array.isArray(validated.sourceFiles)) {
      validated.sourceFiles = defaultConfig.sourceFiles
    }
    
    if (!validated.languages || !Array.isArray(validated.languages)) {
      validated.languages = defaultConfig.languages
    }
    
    if (!validated.outputDir || typeof validated.outputDir !== 'string') {
      validated.outputDir = defaultConfig.outputDir
    }
    
    // projectApiKey is optional (can be empty for testing)
    if (typeof validated.projectApiKey !== 'string') {
      validated.projectApiKey = defaultConfig.projectApiKey
    }
    
    return validated
  }
} 
import { Logger } from './logger.js'
import { diff } from 'deep-object-diff'

export class LocalizationProcessor {
  constructor(octokit, owner, repo, config) {
    this.octokit = octokit
    this.owner = owner
    this.repo = repo
    this.config = config
    this.logger = new Logger('LocalizationProcessor')
  }

  /**
   * Main entry point for processing a pull request
   * Compares source strings between PR branch and base branch
   * Sends changes to translation API and commits results back to PR branch
   */
  async processPullRequest(pullRequest, config) {
    const timer = this.logger.time('Processing pull request')
    
    try {
      this.logger.info(`Processing PR #${pullRequest.number}`, {
        baseBranch: pullRequest.base.ref,
        headBranch: pullRequest.head.ref,
        headSha: pullRequest.head.sha
      })

      // Find source localization file in PR branch
      const sourceFile = await this.findSourceFile(config.sourceFiles, pullRequest.head.sha)
      if (!sourceFile) {
        return {
          success: false,
          error: 'No source localization file found in PR branch',
          changesProcessed: 0,
          languagesUpdated: 0
        }
      }

      this.logger.success(`Found source file: ${sourceFile.path}`, {
        stringCount: Object.keys(sourceFile.content).length
      })

      // Get base branch version of the same file
      const baseFile = await this.findSourceFile(config.sourceFiles, pullRequest.base.sha)
      if (!baseFile) {
        return {
          success: false,
          error: 'No source localization file found in base branch',
          changesProcessed: 0,
          languagesUpdated: 0
        }
      }

      // Compare source strings to detect changes
      const changes = this.detectStringChanges(baseFile.content, sourceFile.content)
      
      if (Object.keys(changes.added).length === 0 && 
          Object.keys(changes.updated).length === 0 && 
          Object.keys(changes.deleted).length === 0) {
        
        this.logger.info('No string changes detected, skipping translation processing')
        return {
          success: true,
          changesProcessed: 0,
          languagesUpdated: 0,
          message: 'No changes detected'
        }
      }

      this.logger.info('String changes detected', {
        added: Object.keys(changes.added).length,
        updated: Object.keys(changes.updated).length,
        deleted: Object.keys(changes.deleted).length
      })

      // Send changes to translation API
      const translationTimer = this.logger.time('Translation API call')
      const translations = await this.translateChanges(changes, config.projectApiKey, config.languages)
      translationTimer.end()

      if (!translations) {
        return {
          success: false,
          error: 'Translation API call failed',
          changesProcessed: 0,
          languagesUpdated: 0
        }
      }

      // Commit translation files directly to PR branch
      const commitResult = await this.commitTranslationsToPR(
        pullRequest,
        translations,
        config.outputDir,
        changes
      )

      if (!commitResult.success) {
        return {
          success: false,
          error: commitResult.error,
          changesProcessed: 0,
          languagesUpdated: 0
        }
      }

      timer.end()

      return {
        success: true,
        changesProcessed: Object.keys(changes.added).length + Object.keys(changes.updated).length + Object.keys(changes.deleted).length,
        languagesUpdated: Object.keys(translations).length,
        message: `Successfully processed ${Object.keys(changes.added).length} additions, ${Object.keys(changes.updated).length} updates, and ${Object.keys(changes.deleted).length} deletions`
      }

    } catch (error) {
      this.logger.error('Error processing pull request', error)
      return {
        success: false,
        error: error.message,
        changesProcessed: 0,
        languagesUpdated: 0
      }
    }
  }

  /**
   * Find source localization file in a specific branch/commit
   */
  async findSourceFile(sourceFilePaths, ref) {
    for (const filePath of sourceFilePaths) {
      try {
        const { data: fileContent } = await this.octokit.rest.repos.getContent({
          owner: this.owner,
          repo: this.repo,
          path: filePath,
          ref: ref
        })

        if (fileContent.type === 'file') {
          const content = JSON.parse(Buffer.from(fileContent.content, 'base64').toString())
          return {
            path: filePath,
            content: content,
            sha: fileContent.sha
          }
        }
      } catch (error) {
        if (error.status !== 404) {
          this.logger.warn(`Error checking file ${filePath}`, error.message)
        }
      }
    }
    return null
  }

  /**
   * Detect changes between base and current source strings
   */
  detectStringChanges(baseStrings, currentStrings) {
    const changes = diff(baseStrings, currentStrings)
    
    // deep-object-diff returns nested objects, we need to flatten them
    const added = {}
    const updated = {}
    const deleted = {}

    // Process the diff to categorize changes
    for (const [key, value] of Object.entries(changes)) {
      if (value === undefined) {
        // Key was deleted
        deleted[key] = baseStrings[key]
      } else if (baseStrings[key] === undefined) {
        // Key was added
        added[key] = value
      } else {
        // Key was updated
        updated[key] = value
      }
    }

    return { added, updated, deleted }
  }

  /**
   * Send changes to translation API
   */
  async translateChanges(changes, projectApiKey, languages) {
    try {
      this.logger.info('Sending changes to translation API', {
        projectApiKey: projectApiKey ? '***' : 'missing',
        languages: languages,
        changes: {
          added: Object.keys(changes.added).length,
          updated: Object.keys(changes.updated).length,
          deleted: Object.keys(changes.deleted).length
        }
      })

      // For now, mock the API call
      // In production, this would send the changes to your hosted API
      const translations = await this.mockTranslateAPI(changes, projectApiKey, languages)
      
      return translations
    } catch (error) {
      this.logger.error('Translation API call failed', error)
      return null
    }
  }

  /**
   * Mock translation API call
   * Replace this with actual API integration
   */
  async mockTranslateAPI(changes, projectApiKey, languages) {
    this.logger.info('Mocking translation API call')
    
    if (!projectApiKey) {
      this.logger.warn('No project API key provided, using mock translations')
    }

    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 1000))

    const translations = {}

    for (const language of languages) {
      translations[language] = {}
      
      // Add new strings
      for (const [key, value] of Object.entries(changes.added)) {
        translations[language][key] = `[${language.toUpperCase()}] ${value}`
      }
      
      // Update existing strings
      for (const [key, value] of Object.entries(changes.updated)) {
        translations[language][key] = `[${language.toUpperCase()}] ${value}`
      }
      
      // Note: deleted strings are not included in translations
    }

    this.logger.success(`Mock translation completed for ${Object.keys(translations).length} languages`)
    return translations
  }

  /**
   * Commit translation files directly to the PR branch
   */
  async commitTranslationsToPR(pullRequest, translations, outputDir, changes) {
    try {
      this.logger.info('Committing translations to PR branch', {
        branch: pullRequest.head.ref,
        languages: Object.keys(translations)
      })

      // Get current tree of the PR branch
      const { data: currentTree } = await this.octokit.rest.git.getTree({
        owner: this.owner,
        repo: this.repo,
        tree_sha: pullRequest.head.sha,
        recursive: true
      })

      // Prepare files to commit
      const files = []
      const treeItems = []

      for (const [language, strings] of Object.entries(translations)) {
        const filePath = `${outputDir}/${language}.json`
        const fileContent = JSON.stringify(strings, null, 2)
        
        // Create blob for the file
        const { data: blob } = await this.octokit.rest.git.createBlob({
          owner: this.owner,
          repo: this.repo,
          content: fileContent,
          encoding: 'utf-8'
        })

        files.push({
          path: filePath,
          content: fileContent,
          blobSha: blob.sha
        })

        treeItems.push({
          path: filePath,
          mode: '100644',
          type: 'blob',
          sha: blob.sha
        })
      }

      // Create new tree
      const { data: newTree } = await this.octokit.rest.git.createTree({
        owner: this.owner,
        repo: this.repo,
        base_tree: pullRequest.head.sha,
        tree: treeItems
      })

      // Create commit
      const commitMessage = this.generateCommitMessage(changes, Object.keys(translations))
      const { data: commit } = await this.octokit.rest.git.createCommit({
        owner: this.owner,
        repo: this.repo,
        message: commitMessage,
        tree: newTree.sha,
        parents: [pullRequest.head.sha],
        author: {
          name: 'Vocoder Bot',
          email: 'bot@vocoder.com'
        }
      })

      // Update the PR branch to point to the new commit
      await this.octokit.rest.git.updateRef({
        owner: this.owner,
        repo: this.repo,
        ref: `heads/${pullRequest.head.ref}`,
        sha: commit.sha,
        force: false
      })

      this.logger.success('Successfully committed translations to PR branch', {
        commitSha: commit.sha,
        filesCommitted: files.length
      })

      return {
        success: true,
        commitSha: commit.sha,
        filesCommitted: files.length
      }

    } catch (error) {
      this.logger.error('Failed to commit translations to PR branch', error)
      return {
        success: false,
        error: error.message
      }
    }
  }

  /**
   * Generate meaningful commit message based on changes
   */
  generateCommitMessage(changes, languages) {
    const parts = []
    
    if (Object.keys(changes.added).length > 0) {
      parts.push(`Add ${Object.keys(changes.added).length} new strings`)
    }
    
    if (Object.keys(changes.updated).length > 0) {
      parts.push(`Update ${Object.keys(changes.updated).length} strings`)
    }
    
    if (Object.keys(changes.deleted).length > 0) {
      parts.push(`Remove ${Object.keys(changes.deleted).length} strings`)
    }

    const changeSummary = parts.join(', ')
    const languageList = languages.join(', ')
    
    return `🌍 Localization: ${changeSummary}

Languages: ${languageList}

Generated by Vocoder localization app.`
  }
} 
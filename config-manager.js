import { isTargetBranch, validateConfig } from "./utils/config.js";

import { GitHubApiUtils } from "./utils/github-api.js";
import { Logger } from "./logger.js";

export class ConfigManager {
  constructor(app, owner, repo) {
    this.app = app;
    this.owner = owner;
    this.repo = repo;
    this.logger = new Logger("ConfigManager");
    this.apiUtils = new GitHubApiUtils(app, owner, repo);
  }

  /**
   * Get configuration for the repository
   * @param {string} ref - Optional branch/commit reference (defaults to main)
   * Returns null if no config file exists
   */
  async getConfig(ref = "main") {
    try {
      const configContent = await this.apiUtils.getFileContent(".vocoder/config.json", ref);
      
      if (configContent) {
        const validatedConfig = validateConfig(configContent);

        this.logger.info("Repository configuration loaded", {
          ref: ref,
          targetBranches: validatedConfig.targetBranches,
          sourceFile: validatedConfig.sourceFile,
          targetLocales: validatedConfig.targetLocales,
          hasApiKey: !!validatedConfig.projectApiKey,
        });

        return validatedConfig;
      }

      this.logger.info(`No .vocoder/config.json found in repository at ref: ${ref}`);
      return null;
    } catch (error) {
      this.logger.error("Error reading configuration", error);
      return null;
    }
  }

  /**
   * Check if a branch matches any of the target branch patterns
   * Supports wildcard patterns like "release-*", "feature/*"
   */
  isTargetBranch(branchName, config) {
    return isTargetBranch(branchName, config);
  }
}

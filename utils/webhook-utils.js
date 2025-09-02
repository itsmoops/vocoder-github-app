import { ConfigManager } from "../config-manager.js";
import { GitHubApiUtils } from "./github-api.js";
import { Logger } from "../logger.js";

/**
 * Webhook processing utilities
 */
export class WebhookUtils {
  constructor(app) {
    this.app = app;
    this.logger = new Logger("WebhookUtils");
  }

  /**
   * Check if a webhook should be processed based on source file changes
   */
  async shouldProcessWebhook(payload) {
    try {
      const { owner, repo } = this.extractRepoInfo(payload);
      const config = await this.getRepositoryConfig(payload);

      if (!config?.sourceFile) {
        this.logger.warn(
          "No configuration or source file found, processing webhook anyway"
        );
        return true;
      }

      const apiUtils = new GitHubApiUtils(this.app, owner, repo);

      if (payload.pull_request) {
        return await this.checkPRSourceFileChanges(apiUtils, payload, config);
      }

      if (payload.commits?.length > 0) {
        return await this.checkPushSourceFileChanges(apiUtils, payload, config);
      }

      return true;
    } catch (error) {
      this.logger.warn(
        "Error checking source file changes, processing webhook anyway",
        error
      );
      return true;
    }
  }

  /**
   * Extract repository information from payload
   */
  extractRepoInfo(payload) {
    return {
      owner: payload.repository.owner.login,
      repo: payload.repository.name,
    };
  }

  /**
   * Get repository configuration with appropriate fallback logic
   */
  async getRepositoryConfig(payload) {
    const { owner, repo } = this.extractRepoInfo(payload);
    const configManager = new ConfigManager(this.app, owner, repo);

    if (payload.pull_request) {
      // For PR events, try PR branch first, then base branch
      let config = await configManager.getConfig(payload.pull_request.head.sha);
      if (!config) {
        config = await configManager.getConfig(payload.pull_request.base.ref);
      }
      return config;
    } else if (payload.commits?.length > 0) {
      // For push events, get config from the current branch
      const branch = payload.ref.replace("refs/heads/", "");
      return await configManager.getConfig(branch);
    } else {
      // Fallback to default branch
      return await configManager.getConfig();
    }
  }

  /**
   * Check if source file changed in pull request
   */
  async checkPRSourceFileChanges(apiUtils, payload, config) {
    const pr = payload.pull_request;

    try {
      const hasChanged = await this.compareSourceFiles(
        apiUtils,
        config.sourceFile,
        pr.base.sha,
        pr.head.sha
      );

      if (!hasChanged) {
        this.logger.info(
          `Skipping webhook - no changes to source file ${config.sourceFile}`,
          {
            baseSha: pr.base.sha,
            headSha: pr.head.sha,
            sourceFile: config.sourceFile,
          }
        );
        return false;
      }

      this.logger.info(
        `Processing webhook - source file ${config.sourceFile} has changes`,
        {
          baseSha: pr.base.sha,
          headSha: pr.head.sha,
          sourceFile: config.sourceFile,
        }
      );

      return true;
    } catch (error) {
      this.logger.warn(
        "Error checking PR source file changes, processing webhook anyway",
        error
      );
      return true;
    }
  }

  /**
   * Check if source file changed in push event
   */
  async checkPushSourceFileChanges(apiUtils, payload, config) {
    const latestCommit = payload.commits[payload.commits.length - 1];
    const previousCommit = payload.before;

    try {
      const hasChanged = await this.compareSourceFiles(
        apiUtils,
        config.sourceFile,
        previousCommit,
        latestCommit.id
      );

      if (!hasChanged) {
        this.logger.info(
          `Skipping push webhook - no changes to source file ${config.sourceFile}`,
          {
            previousSha: previousCommit,
            currentSha: latestCommit.id,
            sourceFile: config.sourceFile,
          }
        );
        return false;
      }

      this.logger.info(
        `Processing push webhook - source file ${config.sourceFile} has changes`,
        {
          previousSha: previousCommit,
          currentSha: latestCommit.id,
          sourceFile: config.sourceFile,
        }
      );

      return true;
    } catch (error) {
      this.logger.warn(
        "Error checking push source file changes, processing webhook anyway",
        error
      );
      return true;
    }
  }

  /**
   * Compare source file content between two commits
   */
  async compareSourceFiles(apiUtils, sourceFilePath, previousSha, currentSha) {
    try {
      const [previousFile, currentFile] = await Promise.all([
        apiUtils.getFileContent(sourceFilePath, previousSha),
        apiUtils.getFileContent(sourceFilePath, currentSha),
      ]);
      debugger;

      // Handle file existence cases
      if (!previousFile && !currentFile) {
        this.logger.debug("Neither file exists, no change");
        return false;
      }
      if (!previousFile || !currentFile) {
        this.logger.debug("One file exists but not the other, that's a change");
        return true;
      }

      // Compare content
      const previousContent = JSON.stringify(previousFile, null, 2);
      const currentContent = JSON.stringify(currentFile, null, 2);

      const hasChanged = previousContent !== currentContent;
      debugger;

      return hasChanged;
    } catch (error) {
      this.logger.warn("Error comparing source file content", error);
      return true; // Assume change if we can't compare
    }
  }
}

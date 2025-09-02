import { ConfigManager } from "../config-manager.js";
import { GitHubApiUtils } from "./github-api.js";
import { LocalizationProcessor } from "../localization-processor.js";
import { Logger } from "../logger.js";

/**
 * Simplified event handler for processing GitHub webhook events
 */
export class EventHandler {
  constructor(app, appName) {
    this.app = app;
    this.appName = appName;
  }

  /**
   * Handle pull request events with simplified logic
   */
  async handlePullRequestEvent(payload, action) {
    const { repository, pull_request } = payload;
    const { owner, repo } = this.extractRepoInfo(repository);
    const prNumber = pull_request.number;

    const eventLogger = new Logger(`PR:${action}`);
    const timer = eventLogger.time(`Processing PR #${prNumber} ${action}`);

    try {
      eventLogger.info(`Processing PR #${prNumber} ${action} for ${owner}/${repo}`);

      // Get configuration
      const config = await this.getRepositoryConfig(owner, repo, pull_request);
      if (!config) {
        eventLogger.warn('No configuration found, skipping localization processing');
        return;
      }

      // Check if PR targets monitored branch
      const configManager = new ConfigManager(this.app, owner, repo);
      if (!configManager.isTargetBranch(pull_request.base.ref, config)) {
        eventLogger.info(`PR targets branch '${pull_request.base.ref}' which is not monitored`);
        return;
      }

      eventLogger.info(`PR targets monitored branch '${pull_request.base.ref}', proceeding with localization`);

      // Set status check and process
      const apiUtils = new GitHubApiUtils(this.app, owner, repo);
      await apiUtils.setCommitStatus(pull_request.head.sha, "pending", "Localization processing in progress...", this.appName);

      const processor = new LocalizationProcessor(this.app, owner, repo, config);
      const result = await processor.processPullRequest(pull_request, config);

      // Update status check based on result
      if (result.success) {
        await apiUtils.setCommitStatus(
          pull_request.head.sha,
          "success",
          `Localization complete: ${result.changesProcessed} changes processed`,
          this.appName
        );
        eventLogger.success(`Localization processing completed successfully`, {
          changesProcessed: result.changesProcessed,
          localesUpdated: result.localesUpdated,
        });
      } else {
        await apiUtils.setCommitStatus(
          pull_request.head.sha,
          "failure",
          `Localization failed: ${result.error}`,
          this.appName
        );
        eventLogger.error(`Localization processing failed`, result.error);
      }

      timer.end();
    } catch (error) {
      eventLogger.error(`Error processing PR #${prNumber}`, error);
      await this.setErrorStatus(owner, repo, pull_request.head.sha, error);
    }
  }

  /**
   * Handle push events with simplified logic
   */
  async handlePushEvent(payload) {
    const { repository, ref, commits } = payload;
    const { owner, repo } = this.extractRepoInfo(repository);
    const branch = ref.replace("refs/heads/", "");

    const eventLogger = new Logger("PushEvent");
    const timer = eventLogger.time(`Processing push to ${branch}`);

    try {
      eventLogger.info(`Processing push to branch '${branch}' in ${owner}/${repo}`);

      // Get configuration and check if branch is monitored
      const configManager = new ConfigManager(this.app, owner, repo);
      const config = await configManager.getRepositoryConfig(payload);

      if (!config || !configManager.isTargetBranch(branch, config)) {
        eventLogger.info(`Branch '${branch}' not monitored or no config found, skipping`);
        return;
      }

      eventLogger.info(`Push to monitored branch '${branch}' detected, checking for open PRs`);

      // Find and re-process open PRs
      const apiUtils = new GitHubApiUtils(this.app, owner, repo);
      const openPRs = await apiUtils.getOpenPullRequests(branch);

      if (openPRs.length === 0) {
        eventLogger.info("No open PRs targeting this branch");
        return;
      }

      eventLogger.info(`Found ${openPRs.length} open PR(s) targeting branch '${branch}'`);

      // Re-process each open PR
      for (const pr of openPRs) {
        eventLogger.info(`Re-processing PR #${pr.number} due to base branch changes`);
        try {
          const processor = new LocalizationProcessor(this.app, owner, repo, config);
          const result = await processor.processPullRequest(pr, config);

          if (result.success) {
            eventLogger.success(`Re-processed PR #${pr.number} successfully`, {
              changesProcessed: result.changesProcessed,
              localesUpdated: result.localesUpdated,
            });
          } else {
            eventLogger.warn(`Re-processing PR #${pr.number} failed`, result.error);
          }
        } catch (error) {
          eventLogger.error(`Error re-processing PR #${pr.number}`, error);
        }
      }

      timer.end();
    } catch (error) {
      eventLogger.error(`Error processing push event`, error);
    }
  }

  /**
   * Extract repository information from payload
   */
  extractRepoInfo(repository) {
    return {
      owner: repository.owner.login,
      repo: repository.name
    };
  }

  /**
   * Get repository configuration with fallback logic
   */
  async getRepositoryConfig(owner, repo, pullRequest) {
    const configManager = new ConfigManager(this.app, owner, repo);
    
    // Try PR branch first, then base branch
    let config = await configManager.getConfig(pullRequest.head.sha);
    if (!config) {
      config = await configManager.getConfig(pullRequest.base.ref);
    }
    
    return config;
  }

  /**
   * Set error status for failed operations
   */
  async setErrorStatus(owner, repo, sha, error) {
    try {
      const apiUtils = new GitHubApiUtils(this.app, owner, repo);
      await apiUtils.setCommitStatus(sha, "failure", `Localization error: ${error.message}`, this.appName);
    } catch (statusError) {
      const logger = new Logger("EventHandler");
      logger.error("Failed to set status check", statusError);
    }
  }
}

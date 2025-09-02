import {
  commitTranslationsToPR,
  detectStringChanges,
  translateChanges,
} from "./localization.js";
import {
  getConfigWithFallback,
  getFileContent,
  getOpenPullRequests,
  setCommitStatus,
} from "./api.js";

import { Logger } from "./logger.js";
import { isTargetBranchForConfig } from "./webhook.js";

/**
 * Handle pull request events with functional approach
 */
export async function handlePullRequestEvent(event, action) {
  const { payload } = event;
  const { repository, pull_request } = payload;
  const { owner, repo } = extractRepoInfo(repository);
  const prNumber = pull_request.number;

  const eventLogger = new Logger(`PR:${action}`);
  const timer = eventLogger.time(`Processing PR #${prNumber} ${action}`);

  try {
    eventLogger.info(
      `Processing PR #${prNumber} ${action} for ${owner}/${repo}`
    );

    // Get configuration
    const config = await getConfigWithFallback(event);
    if (!config) {
      eventLogger.warn(
        "No configuration found, skipping localization processing"
      );
      return;
    }

    // Check if PR targets monitored branch
    if (!isTargetBranchForConfig(pull_request.base.ref, config)) {
      eventLogger.info(
        `PR targets branch '${pull_request.base.ref}' which is not monitored`
      );
      return;
    }

    eventLogger.info(
      `PR targets monitored branch '${pull_request.base.ref}', proceeding with localization`
    );

    // Set status check and process
    await setCommitStatus(
      event,
      pull_request.head.sha,
      "pending",
      "Localization processing in progress...",
      process.env.APP_NAME
    );

    const result = await processPullRequest(event, pull_request, config);

    // Update status check based on result
    if (result.success) {
      await setCommitStatus(
        event,
        pull_request.head.sha,
        "success",
        `Localization complete: ${result.changesProcessed} changes processed`,
        process.env.APP_NAME
      );
      eventLogger.success(`Localization processing completed successfully`, {
        changesProcessed: result.changesProcessed,
        localesUpdated: result.localesUpdated,
      });
    } else {
      await setCommitStatus(
        event,
        pull_request.head.sha,
        "failure",
        `Localization failed: ${result.error}`,
        process.env.APP_NAME
      );
      eventLogger.error(`Localization processing failed`, result.error);
    }

    timer.end();
  } catch (error) {
    eventLogger.error(`Error processing PR #${prNumber}`, error);
    await setErrorStatus(event, pull_request.head.sha, error);
  }
}

/**
 * Handle push events with functional approach
 */
export async function handlePushEvent(event) {
  const { payload } = event;
  const { repository, ref } = payload;
  const { owner, repo } = extractRepoInfo(repository);
  const branch = ref.replace("refs/heads/", "");

  const eventLogger = new Logger("PushEvent");
  const timer = eventLogger.time(`Processing push to ${branch}`);

  try {
    eventLogger.info(
      `Processing push to branch '${branch}' in ${owner}/${repo}`
    );

    // Get configuration and check if branch is monitored
    const config = await getConfigWithFallback(event);

    if (!config || !isTargetBranchForConfig(branch, config)) {
      eventLogger.info(
        `Branch '${branch}' not monitored or no config found, skipping`
      );
      return;
    }

    eventLogger.info(
      `Push to monitored branch '${branch}' detected, checking for open PRs`
    );

    // Find and re-process open PRs
    const openPRs = await getOpenPullRequests(event, branch);

    if (openPRs.length === 0) {
      eventLogger.info("No open PRs targeting this branch");
      return;
    }

    eventLogger.info(
      `Found ${openPRs.length} open PR(s) targeting branch '${branch}'`
    );

    // Re-process each open PR
    for (const pr of openPRs) {
      eventLogger.info(
        `Re-processing PR #${pr.number} due to base branch changes`
      );
      try {
        const result = await processPullRequest(event, pr, config);

        if (result.success) {
          eventLogger.success(`Re-processed PR #${pr.number} successfully`, {
            changesProcessed: result.changesProcessed,
            localesUpdated: result.localesUpdated,
          });
        } else {
          eventLogger.warn(
            `Re-processing PR #${pr.number} failed`,
            result.error
          );
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
 * Main processing function for pull requests
 */
export async function processPullRequest(event, pullRequest, config) {
  const logger = new Logger("FunctionalEvents");
  const timer = logger.time("Processing pull request");

  try {
    logger.info(`Processing PR #${pullRequest.number}`, {
      baseBranch: pullRequest.base.ref,
      headBranch: pullRequest.head.ref,
      headSha: pullRequest.head.sha,
    });

    // Get source file content from both branches
    const [sourceContent, baseContent] = await Promise.all([
      getFileContent(event, config.sourceFile, pullRequest.head.sha),
      getFileContent(event, config.sourceFile, pullRequest.base.sha),
    ]);

    if (!sourceContent) {
      return {
        success: false,
        error: "No source localization file found in PR branch",
        changesProcessed: 0,
        localesUpdated: 0,
      };
    }

    if (!baseContent) {
      return {
        success: false,
        error: "No source localization file found in base branch",
        changesProcessed: 0,
        localesUpdated: 0,
      };
    }

    logger.success(`Found source file: ${config.sourceFile}`, {
      stringCount: Object.keys(sourceContent).length,
    });

    // Compare source strings to detect changes
    const changes = detectStringChanges(baseContent, sourceContent);

    if (
      Object.keys(changes.added).length === 0 &&
      Object.keys(changes.updated).length === 0 &&
      Object.keys(changes.deleted).length === 0
    ) {
      logger.info(
        "No string changes detected, skipping translation processing"
      );
      return {
        success: true,
        changesProcessed: 0,
        localesUpdated: 0,
        message: "No changes detected",
      };
    }

    logger.info("String changes detected", {
      added: Object.keys(changes.added).length,
      updated: Object.keys(changes.updated).length,
      deleted: Object.keys(changes.deleted).length,
    });

    // Send changes to translation API
    const translationTimer = logger.time("Translation API call");
    const translations = await translateChanges(
      changes,
      config.projectApiKey,
      config.targetLocales
    );
    translationTimer.end();

    if (!translations) {
      return {
        success: false,
        error: "Translation API call failed",
        changesProcessed: 0,
        localesUpdated: 0,
      };
    }

    // Commit translation files directly to PR branch
    const commitResult = await commitTranslationsToPR(
      event,
      pullRequest,
      translations,
      config.outputDir,
      changes
    );

    if (!commitResult.success) {
      return {
        success: false,
        error: commitResult.error,
        changesProcessed: 0,
        languagesUpdated: 0,
      };
    }

    timer.end();

    return {
      success: true,
      changesProcessed:
        Object.keys(changes.added).length +
        Object.keys(changes.updated).length +
        Object.keys(changes.deleted).length,
      localesUpdated: Object.keys(translations).length,
      message: `Successfully processed ${
        Object.keys(changes.added).length
      } additions, ${Object.keys(changes.updated).length} updates, and ${
        Object.keys(changes.deleted).length
      } deletions`,
    };
  } catch (error) {
    logger.error("Error processing pull request", error);
    return {
      success: false,
      error: error.message,
      changesProcessed: 0,
      localesUpdated: 0,
    };
  }
}

/**
 * Extract repository information from payload
 */
export function extractRepoInfo(repository) {
  return {
    owner: repository.owner.login,
    repo: repository.name,
  };
}

/**
 * Set error status for failed operations
 */
export async function setErrorStatus(event, sha, error) {
  try {
    await setCommitStatus(
      event,
      sha,
      "failure",
      `Localization error: ${error.message}`,
      process.env.APP_NAME
    );
  } catch (statusError) {
    const logger = new Logger("FunctionalEvents");
    logger.error("Failed to set status check", statusError);
  }
}

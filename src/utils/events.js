import {
  getConfigWithFallback,
  getFileContent,
  getOpenPullRequests,
  setCommitStatus
} from './api.js';

import { Logger } from './logger.js';
import { detailedDiff } from "deep-object-diff";
import { flatten } from "flat";
import { isTargetBranchForConfig } from './webhook.js';

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
    eventLogger.info(`Processing PR #${prNumber} ${action} for ${owner}/${repo}`);

    // Get configuration
    const config = await getConfigWithFallback(event);
    if (!config) {
      eventLogger.warn('No configuration found, skipping localization processing');
      return;
    }

    // Check if PR targets monitored branch
    if (!isTargetBranchForConfig(pull_request.base.ref, config)) {
      eventLogger.info(`PR targets branch '${pull_request.base.ref}' which is not monitored`);
      return;
    }

    eventLogger.info(`PR targets monitored branch '${pull_request.base.ref}', proceeding with localization`);

    // Set status check and process
    await setCommitStatus(event, pull_request.head.sha, "pending", "Localization processing in progress...", process.env.APP_NAME);

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
  const { repository, ref, commits } = payload;
  const { owner, repo } = extractRepoInfo(repository);
  const branch = ref.replace("refs/heads/", "");

  const eventLogger = new Logger("PushEvent");
  const timer = eventLogger.time(`Processing push to ${branch}`);

  try {
    eventLogger.info(`Processing push to branch '${branch}' in ${owner}/${repo}`);

    // Get configuration and check if branch is monitored
    const config = await getConfigWithFallback(event);

    if (!config || !isTargetBranchForConfig(branch, config)) {
      eventLogger.info(`Branch '${branch}' not monitored or no config found, skipping`);
      return;
    }

    eventLogger.info(`Push to monitored branch '${branch}' detected, checking for open PRs`);

    // Find and re-process open PRs
    const openPRs = await getOpenPullRequests(event, branch);

    if (openPRs.length === 0) {
      eventLogger.info("No open PRs targeting this branch");
      return;
    }

    eventLogger.info(`Found ${openPRs.length} open PR(s) targeting branch '${branch}'`);

    // Re-process each open PR
    for (const pr of openPRs) {
      eventLogger.info(`Re-processing PR #${pr.number} due to base branch changes`);
      try {
        const result = await processPullRequest(event, pr, config);

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
 * Main processing function for pull requests
 */
export async function processPullRequest(event, pullRequest, config) {
  const logger = new Logger('FunctionalEvents');
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
      getFileContent(event, config.sourceFile, pullRequest.base.sha)
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
 * Detect changes between base and current source strings
 */
export function detectStringChanges(baseStrings = {}, currentStrings = {}) {
  const flattenedBaseStrings = flatten(baseStrings);
  const flattenedCurrentStrings = flatten(currentStrings);

  const sortedBaseStrings = Object.fromEntries(
    Object.entries(flattenedBaseStrings).sort((a, b) => a[0].localeCompare(b[0]))
  );
  const sortedCurrentStrings = Object.fromEntries(
    Object.entries(flattenedCurrentStrings).sort((a, b) => a[0].localeCompare(b[0]))
  );

  return detailedDiff(sortedBaseStrings, sortedCurrentStrings);
}

/**
 * Send changes to translation API
 */
export async function translateChanges(changes, projectApiKey, targetLocales) {
  const logger = new Logger('FunctionalEvents');

  try {
    logger.info("Sending changes to translation API", {
      projectApiKey: projectApiKey ? "***" : "missing",
      targetLocales: targetLocales,
      changes: {
        added: Object.keys(changes.added).length,
        updated: Object.keys(changes.updated).length,
        deleted: Object.keys(changes.deleted).length,
      },
    });

    // For now, mock the API call
    // In production, this would send the changes to your hosted API
    const translations = await mockTranslateAPI(
      changes,
      projectApiKey,
      targetLocales
    );

    return translations;
  } catch (error) {
    logger.error("Translation API call failed", error);
    return null;
  }
}

/**
 * Mock translation API call
 * Replace this with actual API integration
 */
export async function mockTranslateAPI(changes, projectApiKey, targetLocales) {
  const logger = new Logger('FunctionalEvents');
  logger.info("Mocking translation API call");

  if (!projectApiKey) {
    logger.warn("No project API key provided, using mock translations");
  }

  // Simulate API delay
  await new Promise((resolve) => setTimeout(resolve, 1000));

  const translations = {};

  for (const locale of targetLocales) {
    translations[locale] = {};

    // Add new strings
    for (const [key, value] of Object.entries(changes.added)) {
      translations[locale][key] = `[${locale.toUpperCase()}] ${value}`;
    }

    // Update existing strings
    for (const [key, value] of Object.entries(changes.updated)) {
      translations[locale][key] = `[${locale.toUpperCase()}] ${value}`;
    }

    // Note: deleted strings are not included in translations
  }

  logger.success(
    `Mock translation completed for ${
      Object.keys(translations).length
    } locales`
  );
  return translations;
}

/**
 * Commit translation files directly to the PR branch
 */
export async function commitTranslationsToPR(event, pullRequest, translations, outputDir, changes) {
  const logger = new Logger('FunctionalEvents');

  try {
    logger.info("Committing translations to PR branch", {
      branch: pullRequest.head.ref,
      languages: Object.keys(translations),
    });

    // Get the latest branch head to ensure we're working with the most recent state
    const { data: latestRef } = await event.octokit.rest.git.getRef({
      owner: event.owner,
      repo: event.repo,
      ref: `heads/${pullRequest.head.ref}`
    });

    const latestSha = latestRef.object.sha;

    // Get current tree of the PR branch using the latest SHA
    const { data: currentTree } = await event.octokit.rest.git.getTree({
      owner: event.owner,
      repo: event.repo,
      tree_sha: latestSha,
      recursive: true,
    });

    // Prepare files to commit
    const files = [];
    const treeItems = [];

    for (const [language, strings] of Object.entries(translations)) {
      const filePath = `${outputDir}/${language}.json`;
      const fileContent = JSON.stringify(strings, null, 2);

      // Create blob for the file
      const { data: blob } = await event.octokit.rest.git.createBlob({
        owner: event.owner,
        repo: event.repo,
        content: fileContent,
        encoding: "utf-8",
      });

      files.push({
        path: filePath,
        content: fileContent,
        blobSha: blob.sha,
      });

      treeItems.push({
        path: filePath,
        mode: "100644",
        type: "blob",
        sha: blob.sha,
      });
    }

    // Create new tree
    const { data: newTree } = await event.octokit.rest.git.createTree({
      owner: event.owner,
      repo: event.repo,
      base_tree: latestSha, // Use the latest branch head as base
      tree: treeItems,
    });

    // Create commit
    const commitMessage = generateCommitMessage(
      changes,
      Object.keys(translations)
    );
    const { data: commit } = await octokit.rest.git.createCommit({
      owner: event.owner,
      repo: event.repo,
      message: commitMessage,
      tree: newTree.sha,
      parents: [latestSha], // Use the latest branch head as parent
      author: {
        name: process.env.APP_NAME,
        email: process.env.APP_EMAIL,
      },
    });

    // Update the PR branch to point to the new commit
    // Use force: true to handle cases where the branch has moved forward
    await octokit.rest.git.updateRef({
      owner: event.owner,
      repo: event.repo,
      ref: `heads/${pullRequest.head.ref}`,
      sha: commit.sha,
      force: true,
    });

    logger.success("Successfully committed translations to PR branch", {
      commitSha: commit.sha,
      filesCommitted: files.length,
    });

    return {
      success: true,
      commitSha: commit.sha,
      filesCommitted: files.length,
    };
  } catch (error) {
    logger.error("Failed to commit translations to PR branch", error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Generate meaningful commit message based on changes
 */
export function generateCommitMessage(changes, targetLocales) {
  const parts = [];

  if (Object.keys(changes.added).length > 0) {
    parts.push(`Add ${Object.keys(changes.added).length} new strings`);
  }

  if (Object.keys(changes.updated).length > 0) {
    parts.push(`Update ${Object.keys(changes.updated).length} strings`);
  }

  if (Object.keys(changes.deleted).length > 0) {
    parts.push(`Remove ${Object.keys(changes.deleted).length} strings`);
  }

  const changeSummary = parts.join(", ");
  const localeList = targetLocales.join(", ");

  return `🌍 Localization: ${changeSummary}

Locales: ${localeList}

Generated by Vocoder localization app.`;
}

/**
 * Extract repository information from payload
 */
export function extractRepoInfo(repository) {
  return {
    owner: repository.owner.login,
    repo: repository.name
  };
}

/**
 * Set error status for failed operations
 */
export async function setErrorStatus(event, sha, error) {
  try {
    await setCommitStatus(event, sha, "failure", `Localization error: ${error.message}`, process.env.APP_NAME);
  } catch (statusError) {
    const logger = new Logger("FunctionalEvents");
    logger.error("Failed to set status check", statusError);
  }
}

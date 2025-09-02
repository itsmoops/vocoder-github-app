import { DEFAULT_CONFIG_FILE, STATUS_CONTEXT_VOCODER } from "./constants.js";
import { validateConfig, validateSha } from "./validation.js";

import { ErrorHandler } from "./errors.js";
import { Logger } from "./logger.js";
import { detectStringChanges } from "./localization.js";

/**
 * Get file content from a specific commit/branch
 * Returns parsed JSON content or null if file doesn't exist
 */
export async function getFileContent(event, filePath, ref) {
  if (!validateSha(ref)) {
    throw new Error('Invalid SHA reference');
  }

  try {
    const normalizedFilePath = filePath.replace(/^\/+|\/+$/g, "");

    const { data: fileContent } = await event.octokit.rest.repos.getContent({
      owner: event.owner,
      repo: event.repo,
      path: normalizedFilePath,
      ref,
    });

    if (fileContent.type === "file") {
      return JSON.parse(Buffer.from(fileContent.content, "base64").toString());
    }
  } catch (error) {
    return ErrorHandler.handleFileError(error, filePath, "API");
  }
  return null;
}

/**
 * Set commit status with consistent error handling
 */
export async function setCommitStatus(
  event,
  sha,
  state,
  description,
  context = STATUS_CONTEXT_VOCODER
) {
  // Validate inputs
  if (!validateSha(sha)) {
    throw new Error('Invalid SHA for commit status');
  }

  try {
    await event.octokit.rest.repos.createCommitStatus({
      owner: event.owner,
      repo: event.repo,
      sha,
      state,
      description,
      context,
    });

    const logger = new Logger("API");
    logger.info(`Set status check to ${state}: ${description}`);
  } catch (error) {
    await ErrorHandler.handleCommitStatusError(error, sha, "API");
    throw error;
  }
}

/**
 * Get open pull requests for a specific base branch
 */
export async function getOpenPullRequests(event, baseBranch) {
  const { data: openPRs } = await event.octokit.rest.pulls.list({
    owner: event.owner,
    repo: event.repo,
    state: "open",
    base: baseBranch,
  });
  return openPRs;
}

/**
 * Get the latest commit SHA for a branch
 */
export async function getBranchHead(event, branchName) {
  const { data: branchRef } = await event.octokit.rest.git.getRef({
    owner: event.owner,
    repo: event.repo,
    ref: `heads/${branchName}`,
  });
  return branchRef.object.sha;
}

/**
 * Get configuration for the repository
 * @param {WebhookEvent} event - The webhook event
 * @param {string} ref - Optional branch/commit reference (defaults to main)
 * Returns null if no config file exists
 */
export async function getConfig(event, ref = "main") {
  const logger = new Logger("API");

  try {
    const configPath = DEFAULT_CONFIG_FILE;
    const configContent = await getFileContent(event, configPath, ref);

    if (configContent) {
      const validatedConfig = validateConfig(configContent);

      logger.info("Repository configuration loaded", {
        ref: ref,
        targetBranches: validatedConfig.targetBranches,
        sourceFile: validatedConfig.sourceFile,
        targetLocales: validatedConfig.targetLocales,
        hasApiKey: !!validatedConfig.projectApiKey,
      });

      return validatedConfig;
    }

    logger.info(`No ${configPath} found in repository at ref: ${ref}`);
    return null;
  } catch (error) {
    return ErrorHandler.handleConfigError(error, process.env.CONFIG_FILE_PATH, "API");
  }
}

/**
 * Get configuration ref with appropriate fallback logic
 */
export async function getConfigWithFallback(event) {
  const { baseBranch, currentBranch, defaultBranch, headSha, payload = {} } = event;
  const { pull_request: pullRequest } = payload;

  if (pullRequest) {
    // Get config from head SHA
    let config = await getConfig(event, headSha);
    if (!config) {
      // Get config from base branch
      config = await getConfig(event, baseBranch);
    }

    if (!config) {
      // Get config from default branch
      config = await getConfig(event, defaultBranch);
    }

    return config;
  } else if (currentBranch) {
    // Get config from current branch
    let config = await getConfig(event, currentBranch);
    if (!config) {
      // Get config from default branch
      config = await getConfig(event, defaultBranch);
    }

    return config;
  }

  return null;
}

/**
 * Compare source file content between two commits using deep-object-diff
 */
export async function compareSourceFiles(
  event,
  sourceFilePath,
  previousSha,
  currentSha
) {
  const logger = new Logger("API");

  try {
    const [previousFile, currentFile] = await Promise.all([
      getFileContent(event, sourceFilePath, previousSha),
      getFileContent(event, sourceFilePath, currentSha),
    ]);

    // Handle file existence cases
    if (!previousFile && !currentFile) {
      logger.debug("Neither file exists, no change");
      return false;
    }
    if (!previousFile || !currentFile) {
      logger.debug("One file exists but not the other, that's a change");
      return true;
    }

    // Use detectStringChanges to compare content with deep-object-diff
    const changes = detectStringChanges(previousFile, currentFile);

    // Check if there are any actual changes
    const hasChanges =
      Object.keys(changes.added).length > 0 ||
      Object.keys(changes.updated).length > 0 ||
      Object.keys(changes.deleted).length > 0;

    if (hasChanges) {
      logger.debug("Source file changes detected", {
        added: Object.keys(changes.added).length,
        updated: Object.keys(changes.updated).length,
        deleted: Object.keys(changes.deleted).length,
      });
    } else {
      logger.debug("No source file changes detected");
    }

    return hasChanges;
  } catch (error) {
    logger.warn("Error comparing source file content", error);
    return true; // Assume change if we can't compare
  }
}

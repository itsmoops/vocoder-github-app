import { Logger } from "./logger.js";
import { validateConfig } from "./config.js";

/**
 * Get file content from a specific commit/branch
 * Returns parsed JSON content or null if file doesn't exist
 */
export async function getFileContent(event, filePath, ref) {
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
    if (error.status === 404) {
      return null; // File doesn't exist
    }
    throw error;
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
  context = "Vocoder"
) {
  try {
    await event.octokit.rest.repos.createCommitStatus({
      owner: event.owner,
      repo: event.repo,
      sha,
      state,
      description,
      context,
    });

    const logger = new Logger("FunctionalAPI");
    logger.info(`Set status check to ${state}: ${description}`);
  } catch (error) {
    const logger = new Logger("FunctionalAPI");
    logger.error("Failed to set status check", error);
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
  const logger = new Logger("FunctionalAPI");

  try {
    const configContent = await getFileContent(
      event,
      process.env.CONFIG_FILE_PATH,
      ref
    );

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

    logger.info(
      `No ${process.env.CONFIG_FILE_PATH} found in repository at ref: ${ref}`
    );
    return null;
  } catch (error) {
    logger.error("Error reading configuration", error);
    return null;
  }
}

/**
 * Get configuration ref with appropriate fallback logic
 */
export async function getConfigWithFallback(event) {
  const { payload = {} } = event;
  const { pull_request: pullRequest = {}, commits = [], ref = "" } = payload;

  if (pullRequest) {
    let config = await getConfig(event, pullRequest.head.sha);
    if (!config) {
      config = await getConfig(event, pullRequest.base.ref);
    }
    return config;
  } else if (commits?.length > 0) {
    // For push events, get config from the current branch
    const branch = payload.ref.replace("refs/heads/", "");
    return await getConfig(event, branch);
  }

  return await getConfig(event);
}

/**
 * Compare source file content between two commits
 */
export async function compareSourceFiles(
  event,
  sourceFilePath,
  previousSha,
  currentSha
) {
  const logger = new Logger("FunctionalAPI");

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

    // Compare content
    const previousContent = JSON.stringify(previousFile, null, 2);
    const currentContent = JSON.stringify(currentFile, null, 2);

    return previousContent !== currentContent;
  } catch (error) {
    logger.warn("Error comparing source file content", error);
    return true; // Assume change if we can't compare
  }
}

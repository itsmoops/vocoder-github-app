import { compareSourceFiles, getConfigWithFallback } from './api.js';

import { Logger } from './logger.js';
import { isTargetBranch } from './config.js';

export class WebhookEvent {
  constructor(octokit = {}, payload = {}) {
    this.octokit = octokit;
    this.owner = payload?.repository?.owner?.login;
    this.repo = payload?.repository?.name;
    this.payload = payload;
    this.currentBranch = payload?.ref?.replace("refs/heads/", "") || null;
    this.defaultBranch = payload?.repository?.default_branch || null;
    this.baseBranch = payload?.pull_request?.base?.ref || null;
    this.baseSha = payload?.pull_request?.base?.sha || null;
    this.headBranch = payload?.pull_request?.head?.ref || null;
    this.headSha = payload?.pull_request?.head?.sha || null;
  }
}

/**
 * Check if a webhook should be processed based on source file changes
 */
export async function shouldProcessWebhook(event) {
  const logger = new Logger('FunctionalWebhook');

  try {
    const config = await getConfigWithFallback(event);

    if (!config?.sourceFile) {
      logger.warn(
        "No configuration or source file found, processing webhook anyway"
      );
      return true;
    }

    const { payload = {} } = event;
    const { pull_request: pullRequest, commits = [] } = payload;

    if (pullRequest) {
      return await checkPRSourceFileChanges(event, pullRequest, config);
    }

    if (commits?.length > 0) {
      return await checkPushSourceFileChanges(event, payload, config);
    }

    return true;
  } catch (error) {
    logger.warn(
      "Error checking source file changes, processing webhook anyway",
      error
    );
    return true;
  }
}

/**
 * Check if source file changed in pull request
 */
export async function checkPRSourceFileChanges(event, pullRequest, config) {
  const logger = new Logger('FunctionalWebhook');

  const { baseSha, headSha } = event;

  try {
    const hasChanged = await compareSourceFiles(
      event,
      config.sourceFile,
      baseSha,
      headSha
    );

    if (!hasChanged) {
      logger.info(
        `Skipping webhook - no changes to source file ${config.sourceFile}`,
        {
          baseSha,
          headSha,
          sourceFile: config.sourceFile,
        }
      );
      return false;
    }

    logger.info(
      `Processing webhook - source file ${config.sourceFile} has changes`,
      {
        baseSha,
        headSha,
        sourceFile: config.sourceFile,
      }
    );

    return true;
  } catch (error) {
    logger.warn(
      "Error checking PR source file changes, processing webhook anyway",
      error
    );
    return true;
  }
}

/**
 * Check if source file changed in push event
 */
export async function checkPushSourceFileChanges(event, payload, config) {
  const logger = new Logger('FunctionalWebhook');
  const latestCommit = payload.commits[payload.commits.length - 1];
  const previousCommit = payload.before;

  try {
    const hasChanged = await compareSourceFiles(
      event,
      config.sourceFile,
      previousCommit,
      latestCommit.id
    );

    if (!hasChanged) {
      logger.info(
        `Skipping push webhook - no changes to source file ${config.sourceFile}`,
        {
          previousSha: previousCommit,
          currentSha: latestCommit.id,
          sourceFile: config.sourceFile,
        }
      );
      return false;
    }

    logger.info(
      `Processing push webhook - source file ${config.sourceFile} has changes`,
      {
        previousSha: previousCommit,
        currentSha: latestCommit.id,
        sourceFile: config.sourceFile,
      }
    );

    return true;
  } catch (error) {
    logger.warn(
      "Error checking push source file changes, processing webhook anyway",
      error
    );
    return true;
  }
}

/**
 * Check if a branch matches any of the target branch patterns
 */
export function isTargetBranchForConfig(branchName, config) {
  return isTargetBranch(branchName, config);
}

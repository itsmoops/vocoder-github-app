import { Logger } from "./logger.js";
import { detailedDiff } from "deep-object-diff";
import { flatten } from "flat";

/**
 * Detect changes between base and current source strings
 */
export function detectStringChanges(baseStrings = {}, currentStrings = {}) {
  const flattenedBaseStrings = flatten(baseStrings);
  const flattenedCurrentStrings = flatten(currentStrings);

  const sortedBaseStrings = Object.fromEntries(
    Object.entries(flattenedBaseStrings).sort((a, b) =>
      a[0].localeCompare(b[0])
    )
  );
  const sortedCurrentStrings = Object.fromEntries(
    Object.entries(flattenedCurrentStrings).sort((a, b) =>
      a[0].localeCompare(b[0])
    )
  );

  return detailedDiff(sortedBaseStrings, sortedCurrentStrings);
}

/**
 * Send changes to translation API
 */
export async function translateChanges(changes, projectApiKey, targetLocales) {
  const logger = new Logger("Localization");

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
  const logger = new Logger("Localization");
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
    `Mock translation completed for ${Object.keys(translations).length} locales`
  );
  return translations;
}

/**
 * Commit translation files directly to the PR branch
 */
export async function commitTranslationsToPR(
  event,
  pullRequest,
  translations,
  outputDir,
  changes
) {
  const logger = new Logger("Localization");

  try {
    logger.info("Committing translations to PR branch", {
      branch: pullRequest.head.ref,
      languages: Object.keys(translations),
    });

    // Get the latest branch head to ensure we're working with the most recent state
    const { data: latestRef } = await event.octokit.rest.git.getRef({
      owner: event.owner,
      repo: event.repo,
      ref: `heads/${pullRequest.head.ref}`,
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
    const { data: commit } = await event.octokit.rest.git.createCommit({
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
    await event.octokit.rest.git.updateRef({
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

import { GitHubApiUtils } from "./utils/github-api.js";
import { Logger } from "./logger.js";
import { detailedDiff } from "deep-object-diff";
import { flatten } from "flat";

export class LocalizationProcessor {
  constructor(app, owner, repo, config) {
    this.app = app;
    this.owner = owner;
    this.repo = repo;
    this.config = config;
    this.logger = new Logger("LocalizationProcessor");
    this.apiUtils = new GitHubApiUtils(app, owner, repo);
  }

  /**
   * Main entry point for processing a pull request
   * Compares source strings between PR branch and base branch
   * Sends changes to translation API and commits results back to PR branch
   */
  async processPullRequest(pullRequest, config) {
    const timer = this.logger.time("Processing pull request");

    try {
      this.logger.info(`Processing PR #${pullRequest.number}`, {
        baseBranch: pullRequest.base.ref,
        headBranch: pullRequest.head.ref,
        headSha: pullRequest.head.sha,
      });

      // Get source file content from both branches
      const [sourceContent, baseContent] = await Promise.all([
        this.apiUtils.getFileContent(config.sourceFile, pullRequest.head.sha),
        this.apiUtils.getFileContent(config.sourceFile, pullRequest.base.sha)
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

      this.logger.success(`Found source file: ${config.sourceFile}`, {
        stringCount: Object.keys(sourceContent).length,
      });

      // Compare source strings to detect changes
      const changes = this.detectStringChanges(baseContent, sourceContent);

      debugger;

      if (
        Object.keys(changes.added).length === 0 &&
        Object.keys(changes.updated).length === 0 &&
        Object.keys(changes.deleted).length === 0
      ) {
        this.logger.info(
          "No string changes detected, skipping translation processing"
        );
        return {
          success: true,
          changesProcessed: 0,
          localesUpdated: 0,
          message: "No changes detected",
        };
      }

      this.logger.info("String changes detected", {
        added: Object.keys(changes.added).length,
        updated: Object.keys(changes.updated).length,
        deleted: Object.keys(changes.deleted).length,
      });

      // Send changes to translation API
      const translationTimer = this.logger.time("Translation API call");
      const translations = await this.translateChanges(
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
      const commitResult = await this.commitTranslationsToPR(
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
      this.logger.error("Error processing pull request", error);
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
  detectStringChanges(baseStrings = {}, currentStrings = {}) {
    const flattenedBaseStrings = flatten(baseStrings);
    const flattenedCurrentStrings = flatten(currentStrings);

    const sortedBaseStrings = Object.fromEntries(
      Object.entries(flattenedBaseStrings).sort((a, b) => a[0].localeCompare(b[0]))
    );
    const sortedCurrentStrings = Object.fromEntries(
      Object.entries(flattenedCurrentStrings).sort((a, b) => a[0].localeCompare(b[0]))
    );

    debugger;

    return detailedDiff(sortedBaseStrings, sortedCurrentStrings);
  }

  /**
   * Send changes to translation API
   */
  async translateChanges(changes, projectApiKey, targetLocales) {
    try {
      this.logger.info("Sending changes to translation API", {
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
      const translations = await this.mockTranslateAPI(
        changes,
        projectApiKey,
        targetLocales
      );

      return translations;
    } catch (error) {
      this.logger.error("Translation API call failed", error);
      return null;
    }
  }

  /**
   * Mock translation API call
   * Replace this with actual API integration
   */
  async mockTranslateAPI(changes, projectApiKey, targetLocales) {
    this.logger.info("Mocking translation API call");

    if (!projectApiKey) {
      this.logger.warn("No project API key provided, using mock translations");
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

    this.logger.success(
      `Mock translation completed for ${
        Object.keys(translations).length
      } locales`
    );
    return translations;
  }

  /**
   * Commit translation files directly to the PR branch
   */
  async commitTranslationsToPR(pullRequest, translations, outputDir, changes) {
    try {
      this.logger.info("Committing translations to PR branch", {
        branch: pullRequest.head.ref,
        languages: Object.keys(translations),
      });

      const octokit = await this.apiUtils.getOctokit();

      // Get the latest branch head to ensure we're working with the most recent state
      const { data: latestRef } = await octokit.rest.git.getRef({
        owner: this.owner,
        repo: this.repo,
        ref: `heads/${pullRequest.head.ref}`
      });
      
      const latestSha = latestRef.object.sha;
      
      // Get current tree of the PR branch using the latest SHA
      const { data: currentTree } = await octokit.rest.git.getTree({
        owner: this.owner,
        repo: this.repo,
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
        const { data: blob } = await octokit.rest.git.createBlob({
          owner: this.owner,
          repo: this.repo,
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
      const { data: newTree } = await octokit.rest.git.createTree({
        owner: this.owner,
        repo: this.repo,
        base_tree: latestSha, // Use the latest branch head as base
        tree: treeItems,
      });

      // Create commit
      const commitMessage = this.generateCommitMessage(
        changes,
        Object.keys(translations)
      );
      const { data: commit } = await octokit.rest.git.createCommit({
        owner: this.owner,
        repo: this.repo,
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
        owner: this.owner,
        repo: this.repo,
        ref: `heads/${pullRequest.head.ref}`,
        sha: commit.sha,
        force: true,
      });

      this.logger.success("Successfully committed translations to PR branch", {
        commitSha: commit.sha,
        filesCommitted: files.length,
      });

      return {
        success: true,
        commitSha: commit.sha,
        filesCommitted: files.length,
      };
    } catch (error) {
      this.logger.error("Failed to commit translations to PR branch", error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Generate meaningful commit message based on changes
   */
  generateCommitMessage(changes, targetLocales) {
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
}

import { Logger } from '../logger.js';

/**
 * Common GitHub API utilities
 */
export class GitHubApiUtils {
  constructor(app, owner, repo) {
    this.app = app;
    this.owner = owner;
    this.repo = repo;
    this.logger = new Logger('GitHubApiUtils');
    this.octokit = null;
  }

  /**
   * Get installation-specific Octokit instance
   */
  async getOctokit() {
    if (!this.octokit) {
      try {
        // Get installation for this repository
        const { data: installation } =
          await this.app.octokit.rest.apps.getRepoInstallation({
            owner: this.owner,
            repo: this.repo
          });

        // Create installation-specific Octokit
        this.octokit = await this.app.getInstallationOctokit(installation.id);
      } catch (error) {
        this.logger.error('Failed to get installation Octokit', error);
        throw error;
      }
    }
    return this.octokit;
  }

  /**
   * Get file content from a specific commit/branch
   * Returns parsed JSON content or null if file doesn't exist
   */
  async getFileContent(filePath, ref) {
    try {
      const octokit = await this.getOctokit();

      const normalizedFilePath = filePath.replace(/^\/+|\/+$/g, '');

      const { data: fileContent } = await octokit.rest.repos.getContent({
        owner: this.owner,
        repo: this.repo,
        path: normalizedFilePath,
        ref
      });

      if (fileContent.type === 'file') {
        return JSON.parse(
          Buffer.from(fileContent.content, 'base64').toString()
        );
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
  async setCommitStatus(sha, state, description, context = 'Vocoder') {
    try {
      const octokit = await this.getOctokit();
      await octokit.rest.repos.createCommitStatus({
        owner: this.owner,
        repo: this.repo,
        sha,
        state,
        description,
        context
      });

      this.logger.info(`Set status check to ${state}: ${description}`);
    } catch (error) {
      this.logger.error('Failed to set status check', error);
      throw error;
    }
  }

  /**
   * Get open pull requests for a specific base branch
   */
  async getOpenPullRequests(baseBranch) {
    const octokit = await this.getOctokit();
    const { data: openPRs } = await octokit.rest.pulls.list({
      owner: this.owner,
      repo: this.repo,
      state: 'open',
      base: baseBranch
    });
    return openPRs;
  }

  /**
   * Get the latest commit SHA for a branch
   */
  async getBranchHead(branchName) {
    const octokit = await this.getOctokit();
    const { data: branchRef } = await octokit.rest.git.getRef({
      owner: this.owner,
      repo: this.repo,
      ref: `heads/${branchName}`
    });
    return branchRef.object.sha;
  }
}

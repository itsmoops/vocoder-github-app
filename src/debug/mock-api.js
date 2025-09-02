import { createMockConfigData, createMockSourceFileContent } from './mock-data.js';

import { Logger } from '../utils/logger.js';

/**
 * Mock Octokit API for testing and debugging
 */
export function createMockOctokit() {
  const logger = new Logger('MockAPI');

  return {
    rest: {
      repos: {
        getContent: async (params) => {
          logger.info('Mock repos.getContent', params);

          if (params.path === '.vocoder/config.json') {
            return {
              data: {
                type: 'file',
                content: Buffer.from(JSON.stringify(createMockConfigData())).toString('base64')
              }
            };
          } else if (params.path === 'src/locales/en.json') {
            return {
              data: {
                type: 'file',
                content: Buffer.from(JSON.stringify(createMockSourceFileContent())).toString('base64')
              }
            };
          }

          return { data: { type: 'file', content: '' } };
        },
        createCommitStatus: async (params) => {
          logger.info('Mock createCommitStatus', params);
          return { data: { id: 'mock-status-id' } };
        }
      },
      git: {
        getTree: async (params) => {
          logger.info('Mock git getTree', params);
          return { data: { sha: 'mock-tree-sha' } };
        },
        createBlob: async (params) => {
          logger.info('Mock git createBlob', params);
          return { data: { sha: 'mock-blob-sha' } };
        },
        createTree: async (params) => {
          logger.info('Mock git createTree', params);
          return { data: { sha: 'mock-new-tree-sha' } };
        },
        createCommit: async (params) => {
          logger.info('Mock git createCommit', params);
          return { data: { sha: 'mock-commit-sha' } };
        },
        updateRef: async (params) => {
          logger.info('Mock git updateRef', params);
          return { data: { ref: params.ref } };
        }
      }
    }
  };
}

/**
 * Mock GitHub API responses for different scenarios
 */
export class MockApiResponses {
  /**
   * Create a mock API response for successful file retrieval
   */
  static createFileResponse(content, encoding = 'base64') {
    return {
      data: {
        type: 'file',
        content: encoding === 'base64' ? Buffer.from(JSON.stringify(content)).toString('base64') : content,
        encoding
      }
    };
  }

  /**
   * Create a mock API response for file not found
   */
  static createNotFoundResponse() {
    const error = new Error('Not Found');
    error.status = 404;
    throw error;
  }

  /**
   * Create a mock API response for rate limiting
   */
  static createRateLimitResponse() {
    const error = new Error('API rate limit exceeded');
    error.status = 403;
    error.message = 'API rate limit exceeded';
    throw error;
  }

  /**
   * Create a mock API response for server error
   */
  static createServerErrorResponse() {
    const error = new Error('Internal Server Error');
    error.status = 500;
    throw error;
  }

  /**
   * Create a mock commit status response
   */
  static createCommitStatusResponse(state, description) {
    return {
      data: {
        id: `mock-status-${Date.now()}`,
        state,
        description,
        context: 'Vocoder',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
    };
  }

  /**
   * Create a mock tree response
   */
  static createTreeResponse(sha = 'mock-tree-sha') {
    return {
      data: {
        sha,
        url: 'https://api.github.com/repos/test/repo/git/trees/mock-tree-sha',
        tree: [],
        truncated: false
      }
    };
  }

  /**
   * Create a mock blob response
   */
  static createBlobResponse(sha = 'mock-blob-sha') {
    return {
      data: {
        sha,
        url: 'https://api.github.com/repos/test/repo/git/blobs/mock-blob-sha',
        size: 100,
        content: 'mock content',
        encoding: 'utf-8'
      }
    };
  }

  /**
   * Create a mock commit response
   */
  static createCommitResponse(sha = 'mock-commit-sha') {
    return {
      data: {
        sha,
        url: 'https://api.github.com/repos/test/repo/git/commits/mock-commit-sha',
        author: {
          name: 'Test User',
          email: 'test@example.com',
          date: new Date().toISOString()
        },
        committer: {
          name: 'Test User',
          email: 'test@example.com',
          date: new Date().toISOString()
        },
        message: 'Test commit message',
        tree: {
          sha: 'mock-tree-sha',
          url: 'https://api.github.com/repos/test/repo/git/trees/mock-tree-sha'
        },
        parents: []
      }
    };
  }
}

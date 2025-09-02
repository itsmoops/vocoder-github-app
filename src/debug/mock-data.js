/**
 * Mock data generators for testing and debugging
 */

/**
 * Create mock pull request data for testing
 */
export function createMockPRData() {
  return {
    number: 123,
    title: 'Test PR for localization',
    base: {
      ref: 'main',
      sha: 'base-sha-123'
    },
    head: {
      ref: 'feature/localization-test',
      sha: 'head-sha-456'
    }
  };
}

/**
 * Create mock repository data for testing
 */
export function createMockRepositoryData() {
  return {
    owner: { login: 'testuser' },
    name: 'test-repo'
  };
}

/**
 * Create mock webhook payload for testing
 */
export function createMockWebhookPayload() {
  return {
    repository: createMockRepositoryData(),
    pull_request: createMockPRData(),
    action: 'opened'
  };
}

/**
 * Create mock configuration data
 */
export function createMockConfigData() {
  return {
    targetBranches: ['main'],
    sourceFiles: ['src/locales/en.json'],
    projectApiKey: 'test-api-key',
    outputDir: 'src/locales',
    languages: ['es', 'fr']
  };
}

/**
 * Create mock source file content
 */
export function createMockSourceFileContent() {
  return {
    welcome: 'Welcome to our app',
    goodbye: 'Goodbye!',
    loading: 'Loading...',
    error: 'An error occurred'
  };
}

/**
 * Create mock translation data
 */
export function createMockTranslationData() {
  return {
    es: {
      welcome: '[ES] Welcome to our app',
      goodbye: '[ES] Goodbye!',
      loading: '[ES] Loading...',
      error: '[ES] An error occurred'
    },
    fr: {
      welcome: '[FR] Welcome to our app',
      goodbye: '[FR] Goodbye!',
      loading: '[FR] Loading...',
      error: '[FR] An error occurred'
    }
  };
}

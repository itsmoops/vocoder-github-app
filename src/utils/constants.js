// File paths
export const DEFAULT_CONFIG_FILE = process.env.CONFIG_FILE_PATH || '.vocoder/config.json';
export const DEFAULT_SOURCE_FILE = 'src/locales/en.json';
export const DEFAULT_OUTPUT_DIR = 'locales';

// Webhook events
export const SUPPORTED_PR_EVENTS = ['opened', 'synchronize', 'reopened'];
export const WEBHOOK_PATH = '/api/webhook';

// Server configuration
export const DEFAULT_PORT = 3011;
export const HEALTH_CHECK_PATH = '/health';
export const DEBUG_TEST_PATH = '/debug/test';

// Status check contexts
export const STATUS_CONTEXT_VOCODER = 'Vocoder';
export const STATUS_CONTEXT_APP = process.env.APP_NAME || 'Vocoder Localization';

// Commit status states
export const STATUS_STATES = {
  ERROR: 'error',
  FAILURE: 'failure',
  PENDING: 'pending',
  SUCCESS: 'success'
};

// Default configuration values
export const DEFAULT_CONFIG = {
  targetBranches: ['main'],
  sourceFile: DEFAULT_SOURCE_FILE,
  sourceLocale: 'en',
  targetLocales: ['fr', 'it'],
  outputDir: DEFAULT_OUTPUT_DIR,
  projectApiKey: ''
};

// Environment variable names
export const ENV_VARS = {
  APP_EMAIL: 'APP_EMAIL',
  APP_ID: 'APP_ID',
  APP_NAME: 'APP_NAME',
  APP_URL: 'APP_URL',
  CONFIG_FILE_PATH: 'CONFIG_FILE_PATH',
  DEBUG: 'DEBUG',
  ENTERPRISE_HOSTNAME: 'ENTERPRISE_HOSTNAME',
  PORT: 'PORT',
  PRIVATE_KEY_PATH: 'PRIVATE_KEY_PATH',
  WEBHOOK_SECRET: 'WEBHOOK_SECRET'
};

// Log levels
export const LOG_LEVELS = {
  DEBUG: 'debug',
  ERROR: 'error',
  INFO: 'info',
  SUCCESS: 'success',
  WARN: 'warn'
};

// HTTP status codes
export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  NOT_FOUND: 404,
  INTERNAL_SERVER_ERROR: 500
};

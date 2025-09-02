import { DEFAULT_CONFIG } from './constants.js';
import { Logger } from './logger.js';

/**
 * Validate and merge configuration with defaults
 */
export function validateConfig(config) {
  const validated = { ...DEFAULT_CONFIG, ...config };

  // Ensure required fields exist with proper types
  if (!Array.isArray(validated.targetBranches)) {
    validated.targetBranches = DEFAULT_CONFIG.targetBranches;
  }

  if (typeof validated.sourceFile !== 'string') {
    validated.sourceFile = DEFAULT_CONFIG.sourceFile;
  }

  if (typeof validated.sourceLocale !== 'string') {
    validated.sourceLocale = DEFAULT_CONFIG.sourceLocale;
  }

  if (!Array.isArray(validated.targetLocales)) {
    validated.targetLocales = DEFAULT_CONFIG.targetLocales;
  }

  if (typeof validated.outputDir !== 'string') {
    validated.outputDir = DEFAULT_CONFIG.outputDir;
  }

  if (typeof validated.projectApiKey !== 'string') {
    validated.projectApiKey = DEFAULT_CONFIG.projectApiKey;
  }

  return validated;
}

/**
 * Validate environment variables
 */
export function validateEnvironmentVariables(requiredVars) {
  const logger = new Logger('Validation');
  const missing = requiredVars.filter(varName => !process.env[varName]);

  if (missing.length > 0) {
    logger.error('Missing required environment variables', { missing });
    return false;
  }

  return true;
}

/**
 * Validate API key format
 */
export function validateApiKey(apiKey) {
  const logger = new Logger('Validation');

  if (!apiKey || typeof apiKey !== 'string') {
    logger.error('Invalid API key: must be a non-empty string');
    return false;
  }

  // Basic API key validation (at least 10 characters)
  if (apiKey.length < 10) {
    logger.error('Invalid API key: too short', { length: apiKey.length });
    return false;
  }

  return true;
}

/**
 * Validate locale code
 */
export function validateLocale(locale) {
  const logger = new Logger('Validation');

  if (!locale || typeof locale !== 'string') {
    logger.error('Invalid locale: must be a non-empty string', {
      locale,
      type: typeof locale
    });
    return false;
  }

  // Basic locale validation (2-5 character string)
  if (!/^[a-z]{2}(-[A-Z]{2})?$/.test(locale)) {
    logger.error('Invalid locale format', { locale });
    return false;
  }

  return true;
}

/**
 * Validate array of locales
 */
export function validateLocales(locales) {
  const logger = new Logger('Validation');

  if (!Array.isArray(locales)) {
    logger.error('Invalid locales: must be an array', { locales });
    return false;
  }

  if (locales.length === 0) {
    logger.error('Invalid locales: array cannot be empty');
    return false;
  }

  const invalidLocales = locales.filter(locale => !validateLocale(locale));
  if (invalidLocales.length > 0) {
    logger.error('Invalid locales: contains invalid locale codes', { invalidLocales });
    return false;
  }

  return true;
}

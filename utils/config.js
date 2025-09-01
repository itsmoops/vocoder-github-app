/**
 * Centralized configuration defaults and validation
 */
export const DEFAULT_CONFIG = {
  targetBranches: ["main"],
  sourceFile: "src/locales/en.json",
  sourceLocale: "en",
  targetLocales: ["fr", "it"],
  outputDir: "locales",
  projectApiKey: ""
};

/**
 * Validate and merge configuration with defaults
 */
export function validateConfig(config) {
  const validated = { ...DEFAULT_CONFIG, ...config };

  // Ensure required fields exist with proper types
  if (!Array.isArray(validated.targetBranches)) {
    validated.targetBranches = DEFAULT_CONFIG.targetBranches;
  }

  if (typeof validated.sourceFile !== "string") {
    validated.sourceFile = DEFAULT_CONFIG.sourceFile;
  }

  if (typeof validated.sourceLocale !== "string") {
    validated.sourceLocale = DEFAULT_CONFIG.sourceLocale;
  }

  if (!Array.isArray(validated.targetLocales)) {
    validated.targetLocales = DEFAULT_CONFIG.targetLocales;
  }

  if (typeof validated.outputDir !== "string") {
    validated.outputDir = DEFAULT_CONFIG.outputDir;
  }

  if (typeof validated.projectApiKey !== "string") {
    validated.projectApiKey = DEFAULT_CONFIG.projectApiKey;
  }

  return validated;
}

/**
 * Check if a branch matches any of the target branch patterns
 * Supports wildcard patterns like "release-*", "feature/*"
 */
export function isTargetBranch(branchName, config) {
  return config.targetBranches.some(pattern => {
    if (pattern.includes('*')) {
      const regexPattern = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
      return regexPattern.test(branchName);
    }
    return branchName === pattern;
  });
}

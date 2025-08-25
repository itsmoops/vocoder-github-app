// Configuration schema for Vocoder localization app
export const configSchema = {
  // Target branches to monitor for pull requests
  targetBranches: ['main', 'develop', 'master'],

  // Source localization files to process (relative to repository root)
  sourceFiles: [
    'src/locales/en.json',
    'locales/en.json',
    'i18n/en.json'
  ],

  // Project API key for your translation service
  projectApiKey: 'your-project-api-key-here',

  // Output directory for translation files
  outputDir: 'src/locales',

  // Supported languages for translation
  languages: ['es', 'fr', 'de', 'ja', 'zh']
}

export const defaultConfig = {
  targetBranches: ['main'],
  sourceFiles: ['src/locales/en.json'],
  projectApiKey: '',
  outputDir: 'src/locales',
  languages: ['es', 'fr']
} 
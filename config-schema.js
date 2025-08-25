// Configuration schema for Vocoder localization app
export const configSchema = {
  // Target branches to monitor (array of branch names)
  targetBranches: ['main', 'develop', 'master'],
  
  // Source localization files to process
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
  languages: ['es', 'fr', 'de', 'ja', 'zh'],
  
  // Whether to create PRs for translation updates
  createPRs: true,
  
  // Branch name for translation updates
  translationBranch: 'vocoder-translations'
}

export const defaultConfig = {
  targetBranches: ['main'],
  sourceFiles: ['src/locales/en.json'],
  projectApiKey: '',
  outputDir: 'src/locales',
  languages: ['es', 'fr'],
  createPRs: true,
  translationBranch: 'vocoder-translations'
} 
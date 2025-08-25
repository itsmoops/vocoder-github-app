# Vocoder Localization GitHub App

This GitHub App automatically processes localization files when pull requests are opened or code is pushed to specified target branches. It reads source localization files (JSON), sends them to your translation API, and creates pull requests with translated files.

## Features

- **Automatic Triggering**: Responds to PRs and pushes on configurable target branches
- **Flexible Configuration**: Per-repository configuration via `.vocoder/config.json`
- **Multiple Source Formats**: Supports various source file locations and formats
- **Translation Integration**: Mock API integration (ready for your translation service)
- **Automated PRs**: Creates pull requests with translation files
- **Multi-language Support**: Configurable target languages

## Requirements

- Node.js 20 or higher
- A GitHub App with the following permissions:
  - **Contents**: Read & write (to read source files and write translations)
  - **Pull requests**: Read & write (to read PR content and create translation PRs)
  - **Metadata**: Read-only (always required)
- Subscribe to these events:
  - Pull requests (opened, synchronize, reopened)
  - Push
  - Repository (installation, uninstallation)
- A tunnel to expose your local server to the internet (e.g., [ngrok](https://ngrok.com/))

## Setup

### 1. Create GitHub App

1. Go to [GitHub Settings > Developer settings > GitHub Apps](https://github.com/settings/apps)
2. Click "New GitHub App"
3. Fill in the basic information:
   - **App name**: Something unique like "my-vocoder-app"
   - **Homepage URL**: Can be `http://localhost:3010` for local development
   - **Webhook URL**: You'll set this with ngrok
   - **Webhook secret**: Generate a random secret

4. **Permissions**: Set as specified above
5. **Subscribe to events**: Check the events listed above
6. **Installation**: Choose "Any account" for testing

### 2. Generate Private Key

1. After creating the app, scroll down to "Private keys"
2. Click "Generate private key"
3. Download the `.pem` file
4. Place it in your project directory as `private-key.pem`

### 3. Environment Setup

1. Create a `.env` file with your GitHub App credentials:
```bash
APP_ID="your_actual_app_id"
PRIVATE_KEY_PATH="./private-key.pem"
WEBHOOK_SECRET="your_actual_webhook_secret"
ENTERPRISE_HOSTNAME=""
```

2. Install dependencies: `npm install`

### 4. Expose Your Server

1. Install ngrok: `npm install -g ngrok`
2. Run: `ngrok http 3011`
3. Copy the HTTPS URL (e.g., `https://abc123.ngrok.io`)
4. Go back to your GitHub App settings and set the Webhook URL to: `https://abc123.ngrok.io/api/webhook`

### 5. Start the Server

```bash
npm run server
```

## Configuration

Each repository needs a `.vocoder/config.json` file. The app will create a default one on first installation:

```json
{
  "targetBranches": ["main", "develop"],
  "sourceFiles": [
    "src/locales/en.json",
    "locales/en.json",
    "i18n/en.json"
  ],
  "projectApiKey": "your-project-api-key-here",
  "outputDir": "src/locales",
  "languages": ["es", "fr", "de"],
  "createPRs": true,
  "translationBranch": "vocoder-translations"
}
```

### Configuration Options

- **targetBranches**: Array of branch names to monitor
- **sourceFiles**: Array of possible source file paths (first found will be used)
- **projectApiKey**: Your translation service API key
- **outputDir**: Directory where translation files will be created
- **languages**: Array of target language codes
- **createPRs**: Whether to create pull requests for translations
- **translationBranch**: Branch name for translation updates

## Usage

1. **Install the app** to a repository
2. **Configure** the `.vocoder/config.json` file with your project API key
3. **Create a PR** or **push to a target branch**
4. The app will:
   - Read your source localization file
   - Send it to your translation API (currently mocked)
   - Create a new branch with translation files
   - Open a pull request with the translations

## Example Workflow

1. User opens PR to `main` branch
2. App detects PR and reads source file (e.g., `src/locales/en.json`)
3. App sends content to your translation API with project key
4. App creates `vocoder-translations` branch
5. App commits translation files (`es.json`, `fr.json`, etc.)
6. App creates PR with all translation files
7. App comments on original PR with link to translation PR

## Development

- **Mock API**: Currently mocks translation API calls (see `localization-processor.js`)
- **Real API Integration**: Replace `mockTranslateStrings()` with your actual API calls
- **Error Handling**: Comprehensive error handling with GitHub API error details
- **Logging**: Detailed console logging for debugging

## Security Considerations

- **API Keys**: Store project API keys in repository configuration (consider encryption for production)
- **Repository Access**: App only accesses repositories where it's installed
- **Webhook Verification**: All webhooks are verified using the secret
- **Rate Limiting**: Built-in GitHub API rate limiting

## Next Steps

1. **Replace Mock API**: Integrate with your actual translation service
2. **Add Authentication**: Implement secure API key storage
3. **Enhance Error Handling**: Add retry logic and better error reporting
4. **Add Tests**: Unit and integration tests
5. **Deploy**: Host the app on a cloud platform

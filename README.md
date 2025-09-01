# 🌍 Vocoder Localization GitHub App

A GitHub App that automatically processes localization changes in pull requests. When you open a PR against a monitored branch, Vocoder detects changes in your source strings file, sends them to your translation API, and commits the translated files directly back to your PR branch.

## ✨ Features

- **🎯 Smart Change Detection**: Only processes strings that actually changed
- **🔄 Direct PR Integration**: Commits translations directly to your PR branch
- **📊 Status Checks**: Blocks merging until localization is complete
- **🔄 Base Branch Monitoring**: Re-processes PRs when base branches change
- **⚡ Efficient**: Only translates what's new or modified
- **🔒 Secure**: Uses GitHub App authentication with minimal permissions

## 🚀 How It Works

1. **PR Opened**: When you open a PR against a monitored branch (e.g., `main`)
2. **Change Detection**: Vocoder compares your source strings against the base branch
3. **Translation**: Sends only the changed strings to your translation API
4. **Commit**: Commits translated files directly to your PR branch
5. **Status Check**: Updates PR status to show localization progress
6. **Merge Ready**: Once complete, your PR can be merged with both code and translations

## 🛠️ Setup

### 1. Create a GitHub App

1. Go to [GitHub Developer Settings](https://github.com/settings/apps)
2. Click "New GitHub App"
3. Fill in the details:
   - **App name**: `vocoder-localization` (or your preferred name)
   - **Homepage URL**: `https://your-domain.com`
   - **Webhook URL**: `https://your-domain.com/api/webhook`
   - **Webhook secret**: Generate a secure random string

### 2. Set Permissions

- **Repository permissions**:
  - `Contents`: Read & write (to read source files and commit translations)
  - `Pull requests`: Read (to monitor PR events)
  - `Commit statuses`: Write (to set status checks)
  - `Metadata`: Read (always required)

- **Subscribe to events**:
  - `Pull requests`
  - `Push`
  - `Installation`

### 3. Generate Private Key

1. Click "Generate private key" in your GitHub App settings
2. Download the `.pem` file
3. **Important**: Keep this file secure and never commit it to version control

### 4. Install the App

1. Click "Install App" in your GitHub App settings
2. Choose which repositories to install it on
3. The app will automatically create a default configuration

## 🔧 Environment Setup

Create a `.env` file in your project root:

```bash
# GitHub App credentials
APP_ID=your_app_id_here
PRIVATE_KEY_PATH=./gh_app_key.pem
WEBHOOK_SECRET=your_webhook_secret_here

# Optional
DEBUG=true
PORT=3011
ENTERPRISE_HOSTNAME=your-enterprise-hostname.com
```

## 📁 Configuration

The app creates a `.vocoder/config.json` file in your repository:

```json
{
  "targetBranches": ["main", "develop"],
  "sourceFiles": ["src/locales/en.json"],
  "projectApiKey": "your-project-api-key",
  "outputDir": "src/locales",
  "languages": ["es", "fr", "de"]
}
```

### Configuration Options

- **`targetBranches`**: Branches to monitor for PRs (default: `["main"]`)
- **`sourceFiles`**: Paths to source localization files (default: `["src/locales/en.json"]`)
- **`projectApiKey`**: Your translation service API key
- **`outputDir`**: Directory for generated translation files (default: `"src/locales"`)
- **`languages`**: Target languages for translation (default: `["es", "fr"]`)

## 🚀 Running the App

### Development

```bash
# Install dependencies
npm install

# Start the server
npm run server
```

The app will start on port 3011 (or the next available port).

### Production

```bash
# Set production environment variables
NODE_ENV=production npm start

# Or use a process manager like PM2
pm2 start app.js --name vocoder-localization
```

## 🌐 Exposing Your Server

For development, use [ngrok](https://ngrok.com/) to expose your local server:

```bash
# Install ngrok
npm install -g ngrok

# Expose your server
ngrok http 3011

# Update your GitHub App webhook URL with the ngrok URL
```

## 🧪 Testing

### Debug Endpoints

- **Health Check**: `GET /health` - Check if the server is running
- **Test Webhook**: `POST /debug/test` - Simulate a PR opened event

### Test Script

```bash
# Run the automated test script
node test-debug.js
```

This will test both endpoints and show you the complete workflow.

## 📊 Status Checks

The app sets status checks on your PRs:

- **🟡 Pending**: Localization processing in progress
- **🟢 Success**: Localization complete with X changes processed
- **🔴 Failure**: Localization failed with error details

## 🔄 Workflow Examples

### New Strings Added

1. You add new strings to `src/locales/en.json`
2. Open a PR against `main`
3. Vocoder detects the new strings
4. Sends them to your translation API
5. Commits `es.json`, `fr.json`, etc. to your PR
6. Status check shows "Localization complete: 3 new strings processed"

### Base Branch Changes

1. Someone merges changes to `main` that affect source strings
2. Vocoder detects the push to `main`
3. Finds open PRs targeting `main`
4. Re-processes each PR to handle base branch changes
5. Updates translations if needed

## 🚨 Troubleshooting

### Common Issues

- **"No configuration found"**: Check that `.vocoder/config.json` exists in your repository
- **"No source localization file found"**: Verify the `sourceFiles` paths in your config
- **"Translation API call failed"**: Check your `projectApiKey` and API connectivity

### Debug Mode

Set `DEBUG=true` in your `.env` file for detailed logging:

```bash
DEBUG=true npm run server
```

### Check Logs

The app provides detailed logging for all operations. Look for:
- Webhook events received
- Configuration loading
- File processing steps
- Translation API calls
- Git operations

## 🔒 Security

- **Private Keys**: Never commit `.pem` files to version control
- **Webhook Secrets**: Use strong, random webhook secrets
- **API Keys**: Store project API keys securely
- **Permissions**: Grant only the minimum required permissions

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

- **Issues**: [GitHub Issues](https://github.com/your-org/vocoder-github-app/issues)
- **Documentation**: [Wiki](https://github.com/your-org/vocoder-github-app/wiki)
- **Discussions**: [GitHub Discussions](https://github.com/your-org/vocoder-github-app/discussions)

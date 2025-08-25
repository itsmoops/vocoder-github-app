# 🐛 Debugging Your Vocoder Localization GitHub App

This guide will help you debug and troubleshoot your GitHub App during development and testing.

## 🚀 Quick Start Debugging

### 1. **Enable Debug Mode**
Set this in your `.env` file:
```bash
DEBUG=true
```

### 2. **Start the Server**
```bash
npm run server
```

### 3. **Check Health Endpoint**
Visit: `http://localhost:3010/health`

This will show you:
- Server status
- Environment variables
- Memory usage
- Uptime

## 🔍 Debug Endpoints

### **Health Check**
```
GET http://localhost:3010/health
```
Shows server health and configuration status.

### **Test Webhook**
```
POST http://localhost:3010/debug/test
Content-Type: application/json

{
  "eventType": "pull_request.opened",
  "payload": { ... }
}
```
Simulates webhook events without needing GitHub.

## 🧪 Testing Without GitHub

### **Run Debug Tests**
```bash
node test-debug.js
```

This script will:
1. Test the health endpoint
2. Simulate a pull request event
3. Simulate a push event
4. Show detailed logs

### **Manual Testing with curl**

#### Test Health Check:
```bash
curl http://localhost:3010/health
```

#### Test Pull Request Event:
```bash
curl -X POST http://localhost:3010/debug/test \
  -H "Content-Type: application/json" \
  -d '{
    "eventType": "pull_request.opened",
    "payload": {
      "action": "opened",
      "pull_request": {
        "number": 123,
        "head": {"sha": "abc123"},
        "base": {"ref": "main"}
      },
      "repository": {
        "owner": {"login": "testuser"},
        "name": "test-repo"
      },
      "sender": {"login": "testuser"}
    }
  }'
```

## 📊 Understanding the Logs

### **Log Levels**
- 🐛 **DEBUG**: Detailed information (only when `DEBUG=true`)
- ℹ️ **INFO**: General information
- ✅ **SUCCESS**: Successful operations
- ⚠️ **WARN**: Warning messages
- ❌ **ERROR**: Error messages with stack traces

### **Log Contexts**
- `[MainApp]`: Main application logs
- `[Event:pull_request]`: Event processing logs
- `[Event:push]`: Push event logs
- `[Installation]`: App installation logs

### **Performance Timing**
- ⏱️ **Timing**: Shows how long operations take
- API calls are timed automatically
- Event processing is timed

## 🐛 Common Issues and Solutions

### **1. "No such file or directory" Error**
**Problem**: Can't find private key file
**Solution**: Check your `.env` file and ensure the private key path is correct

### **2. "Invalid webhook signature" Error**
**Problem**: Webhook secret mismatch
**Solution**: Verify `WEBHOOK_SECRET` in `.env` matches GitHub App settings

### **3. "App not found" Error**
**Problem**: Invalid APP_ID
**Solution**: Check your GitHub App ID in the `.env` file

### **4. "Permission denied" Error**
**Problem**: GitHub App lacks required permissions
**Solution**: Ensure your app has:
- Contents: Read & write
- Pull requests: Read & write
- Metadata: Read-only

### **5. "Webhook delivery failed" Error**
**Problem**: Server not accessible from internet
**Solution**: Use ngrok or similar tunnel service

## 🔧 Advanced Debugging

### **Environment Variables for Debugging**
```bash
# Enable debug mode
DEBUG=true

# Set log level
LOG_LEVEL=debug

# Enable GitHub API logging
GITHUB_DEBUG=true
```

### **GitHub API Debugging**
The app automatically logs:
- API call methods and endpoints
- Response status codes
- Call duration
- Error details

### **Webhook Payload Inspection**
All webhook payloads are logged with:
- Event type and action
- Repository information
- Sender details
- Timestamp

## 🧹 Debug Cleanup

### **Reset Configuration**
```bash
# Remove existing config
rm -rf .vocoder/

# Restart server to recreate default config
npm run server
```

### **Clear Logs**
```bash
# Clear console (if using terminal)
clear

# Or restart server
npm run server
```

## 📱 Real GitHub Testing

### **1. Create Test Repository**
- Create a new repository
- Add a source localization file
- Install your GitHub App

### **2. Test with Real Events**
- Create a pull request
- Push to target branch
- Check server logs for real webhook data

### **3. Monitor GitHub App**
- Check GitHub App installation logs
- Verify webhook deliveries
- Monitor rate limits

## 🚨 Emergency Debugging

### **Server Won't Start**
```bash
# Check syntax
node -c app.js

# Check environment
echo $APP_ID
echo $PRIVATE_KEY_PATH

# Check dependencies
npm list
```

### **Webhooks Not Working**
```bash
# Test webhook endpoint manually
curl -X POST http://localhost:3010/api/webhook \
  -H "Content-Type: application/json" \
  -d '{"test": "data"}'
```

### **GitHub API Errors**
- Check rate limits in logs
- Verify app permissions
- Ensure private key is valid

## 📚 Additional Resources

- [GitHub App Documentation](https://docs.github.com/en/apps)
- [Octokit.js Documentation](https://github.com/octokit/octokit.js)
- [GitHub Webhooks Guide](https://docs.github.com/en/webhooks)

## 🆘 Getting Help

If you're still having issues:

1. **Check the logs** - Most issues are logged with details
2. **Verify configuration** - Ensure all environment variables are set
3. **Test endpoints** - Use the debug endpoints to isolate issues
4. **Check permissions** - Verify GitHub App has required access
5. **Review webhook delivery** - Check GitHub App webhook history

Remember: The debug mode will give you much more detailed information about what's happening in your app! 
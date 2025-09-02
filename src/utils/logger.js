export class Logger {
  constructor(context = '') {
    this.context = context;
    this.startTime = Date.now();
  }

  info(message, data = null) {
    const timestamp = new Date().toISOString();
    const contextStr = this.context ? `[${this.context}] ` : '';
    const dataStr = data ? ` | Data: ${JSON.stringify(data, null, 2)}` : '';

    console.log(`ℹ️  ${timestamp} ${contextStr}${message}${dataStr}`);
  }

  success(message, data = null) {
    const timestamp = new Date().toISOString();
    const contextStr = this.context ? `[${this.context}] ` : '';
    const dataStr = data ? ` | Data: ${JSON.stringify(data, null, 2)}` : '';

    console.log(`✅ ${timestamp} ${contextStr}${message}${dataStr}`);
  }

  warn(message, data = null) {
    const timestamp = new Date().toISOString();
    const contextStr = this.context ? `[${this.context}] ` : '';
    const dataStr = data ? ` | Data: ${JSON.stringify(data, null, 2)}` : '';

    console.log(`⚠️  ${timestamp} ${contextStr}${message}${dataStr}`);
  }

  error(message, error = null, data = null) {
    const timestamp = new Date().toISOString();
    const contextStr = this.context ? `[${this.context}] ` : '';
    const errorStr = error ? ` | Error: ${error.message}` : '';
    const dataStr = data ? ` | Data: ${JSON.stringify(data, null, 2)}` : '';

    console.error(`❌ ${timestamp} ${contextStr}${message}${errorStr}${dataStr}`);

    if (error && error.stack) {
      console.error(`Stack trace: ${error.stack}`);
    }
  }

  debug(message, data = null) {
    if (process.env.DEBUG === 'true') {
      const timestamp = new Date().toISOString();
      const contextStr = this.context ? `[${this.context}] ` : '';
      const dataStr = data ? ` | Data: ${JSON.stringify(data, null, 2)}` : '';

      console.log(`🐛 ${timestamp} ${contextStr}${message}${dataStr}`);
    }
  }

  // Log webhook payload for debugging
  logWebhook(event, action, payload) {
    this.info(`Webhook received: ${event}.${action}`, {
      event,
      action,
      repository: payload.repository?.full_name,
      sender: payload.sender?.login,
      timestamp: new Date().toISOString()
    });
  }

  // Log GitHub API calls
  logApiCall(method, endpoint, status, duration) {
    const statusIcon = status >= 200 && status < 300 ? '✅' : '❌';
    this.info(`${statusIcon} API Call: ${method} ${endpoint}`, {
      status,
      duration: `${duration}ms`
    });
  }

  // Log GitHub API calls with more detail
  logGitHubApiCall(method, endpoint, status, duration, rateLimit = null) {
    const statusIcon = status >= 200 && status < 300 ? '✅' : '❌';
    const logData = {
      status,
      duration: `${duration}ms`,
      method,
      endpoint
    };

    if (rateLimit) {
      logData.rateLimit = rateLimit;
    }

    this.info(`${statusIcon} GitHub API: ${method} ${endpoint}`, logData);
  }

  // Performance timing
  time(label) {
    const start = Date.now();
    return {
      end: () => {
        const duration = Date.now() - start;
        this.info(`⏱️  ${label} completed in ${duration}ms`);
        return duration;
      }
    };
  }

  // Log configuration
  logConfig(config) {
    this.info('Repository configuration loaded', {
      targetBranches: config.targetBranches,
      sourceFiles: config.sourceFiles,
      languages: config.languages,
      hasApiKey: !!config.projectApiKey,
      createPRs: config.createPRs
    });
  }
}

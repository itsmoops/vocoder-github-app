import { HTTP_STATUS } from './constants.js';
import { Logger } from './logger.js';

export class ErrorHandler {
  /**
   * Handle API errors with consistent logging and response format
   */
  static async handleApiError(error, context = 'API') {
    const logger = new Logger(context);

    if (error.status === 404) {
      logger.warn('Resource not found', { status: error.status, message: error.message });
      return { success: false, error: 'Resource not found', code: HTTP_STATUS.NOT_FOUND };
    }

    if (error.status === 401 || error.status === 403) {
      logger.error('Authentication/Authorization error', { status: error.status, message: error.message });
      return { success: false, error: 'Authentication failed', code: HTTP_STATUS.UNAUTHORIZED };
    }

    logger.error('API error', error, { status: error.status });
    return {
      success: false,
      error: error.message || 'Unknown API error',
      code: error.status || HTTP_STATUS.INTERNAL_SERVER_ERROR
    };
  }

  /**
   * Create standardized error response
   */
  static createErrorResponse(message, code = HTTP_STATUS.INTERNAL_SERVER_ERROR, data = null) {
    return {
      success: false,
      error: message,
      code,
      ...(data && { data })
    };
  }

  /**
   * Create standardized success response
   */
  static createSuccessResponse(message, data = null) {
    return {
      success: true,
      message,
      ...(data && { data })
    };
  }

  /**
   * Handle webhook processing errors
   */
  static async handleWebhookError(error, event, context = 'Webhook') {
    const logger = new Logger(context);

    if (error.name === 'AggregateError') {
      logger.error(`Webhook error processing request: ${error.event}`, error);
    } else {
      logger.error('Webhook error', error, {
        errorName: error.name,
        errorMessage: error.message,
        stack: error.stack,
        repository: event?.repository?.full_name,
        event: event?.name
      });
    }
  }

  /**
   * Handle file operation errors
   */
  static handleFileError(error, filePath, context = 'FileOps') {
    const logger = new Logger(context);

    if (error.status === 404) {
      logger.debug(`File not found: ${filePath}`);
      return null; // File doesn't exist
    }

    logger.error(`File operation error for ${filePath}`, error);
    throw error;
  }

  /**
   * Handle configuration errors
   */
  static handleConfigError(error, configPath, context = 'Config') {
    const logger = new Logger(context);
    logger.error(`Configuration error for ${configPath}`, error);
    return null; // Return null for missing/invalid config
  }

  /**
   * Handle translation API errors
   */
  static handleTranslationError(error, context = 'Translation') {
    const logger = new Logger(context);
    logger.error('Translation API error', error);
    return null; // Return null for failed translations
  }

  /**
   * Handle commit status errors
   */
  static async handleCommitStatusError(error, sha, context = 'CommitStatus') {
    const logger = new Logger(context);
    logger.error('Failed to set commit status', error, { sha });
    // Don't throw - commit status is not critical
  }

  /**
   * Wrap async function with error handling
   */
  static async withErrorHandling(fn, errorContext = 'AsyncOperation') {
    try {
      return await fn();
    } catch (error) {
      return this.handleApiError(error, errorContext);
    }
  }

  /**
   * Validate required parameters
   */
  static validateRequired(params, requiredFields, context = 'Validation') {
    const logger = new Logger(context);
    const missing = requiredFields.filter(field => !params[field]);

    if (missing.length > 0) {
      const error = `Missing required parameters: ${missing.join(', ')}`;
      logger.error(error, { required: requiredFields, provided: Object.keys(params) });
      throw new Error(error);
    }
  }
}

/**
 * Logger utility for consistent error logging across the application
 * Replace all console.error calls with this logger
 */

interface LogContext {
  context?: string;
  error?: unknown;
  data?: Record<string, unknown>;
}

class Logger {
  private isDevelopment = import.meta.env.DEV;

  error(message: string, context?: LogContext): void {
    if (this.isDevelopment) {
      console.error(`[${context?.context || 'App'}] ${message}`, context?.error, context?.data);
    } else {
      // In production, send to error tracking service
      // Example: Firebase Crashlytics, Sentry, etc.
      // Crashlytics.recordError(error);
      this.sendToErrorTracking(message, context);
    }
  }

  warn(message: string, context?: LogContext): void {
    if (this.isDevelopment) {
      console.warn(`[${context?.context || 'App'}] ${message}`, context?.data);
    }
  }

  info(message: string, context?: LogContext): void {
    if (this.isDevelopment) {
      console.info(`[${context?.context || 'App'}] ${message}`, context?.data);
    }
  }

  private sendToErrorTracking(_message: string, _context?: LogContext): void {
    // TODO: Integrate with Firebase Crashlytics or Sentry
    // Currently preparing the logging infrastructure
    // When ready, uncomment:
    // import { getAnalytics, logEvent } from 'firebase/analytics';
    // logEvent('admin_error', { 
    //   error_message: _message, 
    //   context: _context?.context 
    // });
  }
}

export const logger = new Logger();

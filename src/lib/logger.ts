/**
 * Logger utility for consistent error logging across the application
 * Integrates with Sentry for production error tracking
 */

import * as Sentry from '@sentry/react';

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
      this.sendToSentry(message, context);
    }
  }

  warn(message: string, context?: LogContext): void {
    if (this.isDevelopment) {
      console.warn(`[${context?.context || 'App'}] ${message}`, context?.data);
    } else {
      Sentry.addBreadcrumb({
        category: context?.context || 'App',
        message,
        level: 'warning',
        data: context?.data,
      });
    }
  }

  info(message: string, context?: LogContext): void {
    if (this.isDevelopment) {
      console.info(`[${context?.context || 'App'}] ${message}`, context?.data);
    } else {
      Sentry.addBreadcrumb({
        category: context?.context || 'App',
        message,
        level: 'info',
        data: context?.data,
      });
    }
  }

  private sendToSentry(message: string, context?: LogContext): void {
    Sentry.captureException(context?.error || new Error(message), {
      tags: {
        context: context?.context || 'App',
      },
      extra: {
        message,
        ...context?.data,
      },
    });
  }
}

export const logger = new Logger();

import React, { Component, ReactNode } from 'react';
import {
  ExclamationTriangleIcon,
  XCircleIcon,
  InformationCircleIcon
} from '@heroicons/react/24/outline';

export type ErrorType = 'error' | 'warning' | 'info';

export interface AppError {
  type: ErrorType;
  title: string;
  message: string;
  code?: string;
  timestamp: Date;
}

interface ErrorState {
  hasError: boolean;
  error: Error | null;
}

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Error caught by boundary:', error, errorInfo);
    
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }

    // 에러 로깅 서비스로 전송 (실제 프로덕션에서는 Firebase Crashlytics 등 사용)
    // logErrorToService(error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
            <XCircleIcon className="w-12 h-12 text-red-600 mx-auto mb-4" />
            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 text-center mb-2">
              오류가 발생했습니다
            </h1>
            <p className="text-gray-600 dark:text-gray-400 text-center mb-4">
              페이지를 표시하는 중 문제가 발생했습니다.
            </p>
            {this.state.error && (
              <div className="bg-gray-100 dark:bg-gray-700 rounded p-3 mb-4">
                <p className="text-sm text-gray-700 dark:text-gray-300 font-mono">
                  {this.state.error.message}
                </p>
              </div>
            )}
            <div className="flex gap-3">
              <button
                onClick={() => window.location.reload()}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 rounded-lg transition-colors"
              >
                새로고침
              </button>
              <button
                onClick={() => window.history.back()}
                className="flex-1 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 font-medium py-2 rounded-lg transition-colors"
              >
                이전 페이지
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// 에러 토스트 컴포넌트
interface ErrorToastProps {
  error: AppError;
  onClose: () => void;
}

export function ErrorToast({ error, onClose }: ErrorToastProps) {
  const getIcon = () => {
    switch (error.type) {
      case 'error':
        return <XCircleIcon className="w-5 h-5" />;
      case 'warning':
        return <ExclamationTriangleIcon className="w-5 h-5" />;
      case 'info':
        return <InformationCircleIcon className="w-5 h-5" />;
    }
  };

  const getColors = () => {
    switch (error.type) {
      case 'error':
        return 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-800 dark:text-red-200';
      case 'warning':
        return 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800 text-yellow-800 dark:text-yellow-200';
      case 'info':
        return 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-200';
    }
  };

  return (
    <div className={`fixed top-4 right-4 max-w-md w-full rounded-lg shadow-lg border p-4 ${getColors()} z-50`}>
      <div className="flex items-start">
        <div className="flex-shrink-0">
          {getIcon()}
        </div>
        <div className="ml-3 flex-1">
          <h3 className="text-sm font-medium">{error.title}</h3>
          <p className="mt-1 text-sm">{error.message}</p>
          {error.code && (
            <p className="mt-1 text-xs font-mono opacity-75">Error Code: {error.code}</p>
          )}
        </div>
        <button
          onClick={onClose}
          className="ml-3 flex-shrink-0"
        >
          <span className="sr-only">닫기</span>
          <XCircleIcon className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}

// 에러 관리 훅
import { useState, useCallback } from 'react';

export function useErrorHandler() {
  const [errors, setErrors] = useState<AppError[]>([]);

  const showError = useCallback((title: string, message: string, code?: string) => {
    const error: AppError = {
      type: 'error',
      title,
      message,
      code,
      timestamp: new Date()
    };
    setErrors(prev => [...prev, error]);

    // 자동으로 5초 후 제거
    setTimeout(() => {
      setErrors(prev => prev.filter(e => e !== error));
    }, 5000);
  }, []);

  const showWarning = useCallback((title: string, message: string) => {
    const error: AppError = {
      type: 'warning',
      title,
      message,
      timestamp: new Date()
    };
    setErrors(prev => [...prev, error]);

    setTimeout(() => {
      setErrors(prev => prev.filter(e => e !== error));
    }, 5000);
  }, []);

  const showInfo = useCallback((title: string, message: string) => {
    const error: AppError = {
      type: 'info',
      title,
      message,
      timestamp: new Date()
    };
    setErrors(prev => [...prev, error]);

    setTimeout(() => {
      setErrors(prev => prev.filter(e => e !== error));
    }, 5000);
  }, []);

  const clearError = useCallback((error: AppError) => {
    setErrors(prev => prev.filter(e => e !== error));
  }, []);

  const clearAllErrors = useCallback(() => {
    setErrors([]);
  }, []);

  return {
    errors,
    showError,
    showWarning,
    showInfo,
    clearError,
    clearAllErrors
  };
}

// 에러 로깅 유틸리티
export function logError(error: Error, context?: Record<string, any>) { // eslint-disable-line @typescript-eslint/no-explicit-any
  const errorData = {
    message: error.message,
    stack: error.stack,
    context,
    timestamp: new Date().toISOString(),
    userAgent: navigator.userAgent,
    url: window.location.href
  };

  console.error('Application Error:', errorData);

  // 실제 프로덕션에서는 에러 로깅 서비스로 전송
  // 예: Firebase Crashlytics, Sentry 등
}

// 비동기 작업 에러 래퍼
export async function withErrorHandling<T>(
  operation: () => Promise<T>,
  errorHandler: (error: Error) => void
): Promise<T | null> {
  try {
    return await operation();
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    errorHandler(err);
    logError(err);
    return null;
  }
}
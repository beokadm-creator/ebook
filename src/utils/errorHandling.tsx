import React, { Component, ReactNode } from 'react';
import { XCircleIcon } from '@heroicons/react/24/outline';

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

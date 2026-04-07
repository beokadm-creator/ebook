import React from 'react';
import { useAuth } from '@/contexts/AuthContext';
import {
  LockClosedIcon,
  ExclamationTriangleIcon
} from '@heroicons/react/24/outline';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { user, loading, role } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">로딩 중...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4">
        <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 text-center">
          <LockClosedIcon className="w-16 h-16 text-gray-400 mx-auto mb-4" />

          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">
            로그인 필요
          </h2>

          <p className="text-gray-600 dark:text-gray-400 mb-6">
            이 페이지에 접근하려면 관리자 로그인이 필요합니다.
          </p>

          <button
            type="button"
            onClick={() => window.location.href = '/login'}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 rounded-lg transition-colors"
          >
            관리자 로그인
          </button>
        </div>
      </div>
    );
  }

  if (role !== 'admin') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4">
        <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 text-center">
          <ExclamationTriangleIcon className="w-16 h-16 text-yellow-500 mx-auto mb-4" />

          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">
            접근 권한 없음
          </h2>

          <p className="text-gray-600 dark:text-gray-400 mb-4">
            이 페이지는 관리자만 접근할 수 있습니다.
          </p>

          <button
            type="button"
            onClick={() => window.location.href = '/'}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 rounded-lg transition-colors"
          >
            홈으로 이동
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

export default ProtectedRoute;

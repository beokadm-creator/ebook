import React, { useEffect, useState } from 'react';

interface OnlineOnlyProps {
  children: React.ReactNode;
}

export const OnlineOnly: React.FC<OnlineOnlyProps> = ({ children }) => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (!isOnline) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4">
        <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 text-center">
          <div className="w-16 h-16 bg-yellow-100 dark:bg-yellow-900/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-yellow-600 dark:text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">
            인터넷 연결 필요
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            편집 기능은 인터넷 연결이 필요합니다. 읽기는 오프라인에서도 가능합니다.
          </p>
          <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4 text-left">
            <p className="text-sm text-blue-900 dark:text-blue-100 font-medium mb-2">
              💡 팁
            </p>
            <p className="text-sm text-blue-700 dark:text-blue-300">
              오프라인 상태에서도 초록집을 읽을 수 있습니다.
              <a href="/" className="underline font-medium ml-1">홈으로 이동</a>
            </p>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

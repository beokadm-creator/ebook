import React, { useState, useEffect } from 'react';
import { 
  WifiIcon,
  SignalSlashIcon,
  XMarkIcon
} from '@heroicons/react/24/outline';

type ConnectionStatus = 'online' | 'offline' | 'restored';

interface OfflineManagerProps {
  children: React.ReactNode;
}

export const OfflineManager: React.FC<OfflineManagerProps> = ({ children }) => {
  const [isOnline, setIsOnline] = useState(true);
  const [showOfflineMessage, setShowOfflineMessage] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('online');

  useEffect(() => {
    // 초기 온라인 상태 확인
    setIsOnline(navigator.onLine);

    const handleOnline = () => {
      setIsOnline(true);
      setConnectionStatus('restored');
      setShowOfflineMessage(true);
      
      // 3초 후 메시지 숨김
      setTimeout(() => {
        setShowOfflineMessage(false);
        setConnectionStatus('online');
      }, 3000);
    };

    const handleOffline = () => {
      setIsOnline(false);
      setConnectionStatus('offline');
      setShowOfflineMessage(true);
    };

    // 이벤트 리스너 등록
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return (
    <>
      {children}

      {/* 오프라인 상태 알림 배너 */}
      {showOfflineMessage && (
        <div className="fixed top-0 left-0 right-0 z-[60] transition-all duration-300">
          <div
            className={`mx-4 mt-4 rounded-2xl shadow-2xl border-2 p-4 ${
              connectionStatus === 'offline'
                ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
                : connectionStatus === 'restored'
                ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
                : 'hidden'
            }`}
          >
            <div className="flex items-start gap-3">
              {connectionStatus === 'offline' ? (
                <SignalSlashIcon className="w-6 h-6 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
              ) : (
                <WifiIcon className="w-6 h-6 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
              )}
              
              <div className="flex-1 min-w-0">
                <h3 className={`text-base font-bold mb-1 ${
                  connectionStatus === 'offline'
                    ? 'text-red-900 dark:text-red-100'
                    : 'text-green-900 dark:text-green-100'
                }`}>
                  {connectionStatus === 'offline'
                    ? '오프라인 모드'
                    : '연결 복구됨'}
                </h3>
                <p className={`text-sm ${
                  connectionStatus === 'offline'
                    ? 'text-red-700 dark:text-red-300'
                    : 'text-green-700 dark:text-green-300'
                }`}>
                  {connectionStatus === 'offline'
                    ? '인터넷 연결이 없습니다. 읽기는 가능하지만 편집 기능은 제한됩니다.'
                    : '인터넷 연결이 복구되었습니다.'}
                </p>
              </div>

              <button
                onClick={() => setShowOfflineMessage(false)}
                className="flex-shrink-0 p-1 hover:bg-black/5 dark:hover:bg-white/5 rounded-lg transition-colors"
              >
                <XMarkIcon className={`w-5 h-5 ${
                  connectionStatus === 'offline'
                    ? 'text-red-600 dark:text-red-400'
                    : 'text-green-600 dark:text-green-400'
                }`} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 오프라인 인디케이터 (하단 고정) */}
      {!isOnline && (
        <div className="fixed bottom-20 left-1/2 transform -translate-x-1/2 z-50">
          <div className="flex items-center gap-2 px-4 py-2 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded-full shadow-lg">
            <SignalSlashIcon className="w-4 h-4" />
            <span className="text-sm font-medium">오프라인</span>
          </div>
        </div>
      )}
    </>
  );
};
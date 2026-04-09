import React, { useState, useEffect } from 'react';
import { 
  WifiIcon,
  SignalSlashIcon,
  CloudArrowDownIcon,
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
  const [pendingSync, setPendingSync] = useState(0);

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

  // 로컬 스토리지에서 대기 중인 동기화 작업 수 확인
  useEffect(() => {
    const checkPendingSync = () => {
      try {
        const pendingActions = localStorage.getItem('pendingSyncActions');
        if (pendingActions) {
          const actions = JSON.parse(pendingActions);
          setPendingSync(actions.length);
        }
      } catch (error) {
        console.error('Failed to check pending sync:', error);
      }
    };

    checkPendingSync();
    const interval = setInterval(checkPendingSync, 5000);

    return () => clearInterval(interval);
  }, []);

  const syncPendingData = async () => {
    // 오프라인 중인 변경사항 동기화
    try {
      const pendingActions = localStorage.getItem('pendingSyncActions');
      if (!pendingActions) return;

      const actions = JSON.parse(pendingActions);
      
      // TODO: 각 액션을 서버에 동기화
      for (const action of actions) {
        await syncAction(action);
      }

      // 동기화 완료 후 로컬 스토리지 정리
      localStorage.removeItem('pendingSyncActions');
      setPendingSync(0);
    } catch (error) {
      console.error('Failed to sync pending data:', error);
    }
  };

  const syncAction = async (action: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
    // TODO: 실제 동기화 로직 구현
    void action;
  };

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
                    ? '인터넷 연결이 없습니다. 오프라인 모드로 작동 중입니다.'
                    : '인터넷 연결이 복구되었습니다.'}
                </p>
                {connectionStatus === 'restored' && pendingSync > 0 && (
                  <button
                    onClick={syncPendingData}
                    className="mt-3 flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-xl font-medium transition-colors"
                  >
                    <CloudArrowDownIcon className="w-4 h-4" />
                    {pendingSync}개 변경사항 동기화
                  </button>
                )}
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

// 오프라인 동작 저장 훅
export const useOfflineAction = () => {
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

  const saveOfflineAction = (action: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
    if (!isOnline) {
      try {
        const pendingActions = localStorage.getItem('pendingSyncActions');
        const actions = pendingActions ? JSON.parse(pendingActions) : [];
        actions.push({
          ...action,
          timestamp: Date.now()
        });
        localStorage.setItem('pendingSyncActions', JSON.stringify(actions));
        return true;
      } catch (error) {
        console.error('Failed to save offline action:', error);
        return false;
      }
    }
    return false;
  };

  return { isOnline, saveOfflineAction };
};
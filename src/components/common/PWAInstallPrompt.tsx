import React from 'react';
import { 
  CloudArrowDownIcon,
  WifiIcon,
  SignalSlashIcon,
  XMarkIcon
} from '@heroicons/react/24/outline';
import { usePWA } from '@/hooks/usePWA';

const PWAInstallPrompt: React.FC = () => {
  const { isInstallable, isInstalled, isOnline, promptInstall } = usePWA();
  const [showPrompt, setShowPrompt] = React.useState(true);

  // 설치 프롬프트 표시 로직
  React.useEffect(() => {
    if (isInstalled) {
      setShowPrompt(false);
    }
  }, [isInstalled]);

  if (!showPrompt || !isInstallable) {
    return null;
  }

  return (
    <>
      {/* 설치 프롬프트 */}
      <div className="fixed bottom-6 left-6 z-50 max-w-sm">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-6 border border-gray-200 dark:border-gray-700">
          <button
            onClick={() => setShowPrompt(false)}
            className="absolute top-2 right-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>

          <div className="flex items-start gap-4">
            <div className="bg-blue-100 dark:bg-blue-900/30 rounded-full p-3">
              <CloudArrowDownIcon className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            </div>
            
            <div className="flex-1">
              <h3 className="font-bold text-gray-900 dark:text-gray-100 mb-1">
                앱 설치
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                홈 화면에 추가하여 오프라인에서도 eBook을 열람하세요.
              </p>
              
              <button
                onClick={promptInstall}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition-colors"
              >
                설치하기
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 오프라인 상태 표시 */}
      {!isOnline && (
        <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50">
          <div className="bg-red-500 text-white px-6 py-3 rounded-full shadow-lg flex items-center gap-2">
            <SignalSlashIcon className="w-5 h-5" />
            <span className="font-medium">오프라인 모드</span>
          </div>
        </div>
      )}

      {/* 온라인 상태 표시 (임시) */}
      {isOnline && !isInstallable && (
        <div className="fixed top-4 right-4 z-50">
          <div className="bg-green-500 text-white px-4 py-2 rounded-full shadow-lg flex items-center gap-2 text-sm">
            <WifiIcon className="w-4 h-4" />
            <span>온라인</span>
          </div>
        </div>
      )}
    </>
  );
};

export default PWAInstallPrompt;
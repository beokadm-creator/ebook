import React, { useEffect, useState } from 'react';
import { useBrandingStore } from '@/stores/brandingStore';
import { useI18nStore } from '@/stores/i18nStore';
import { BilingualValue } from '@/types/content';

interface SplashScreenProps {
  onComplete: () => void;
  duration?: number;
}

const SplashScreen: React.FC<SplashScreenProps> = ({
  onComplete,
  duration = 2000
}) => {
  const [isVisible, setIsVisible] = useState(true);
  const [isFadingOut, setIsFadingOut] = useState(false);
  const branding = useBrandingStore((state) => state.branding);
  const { language } = useI18nStore();

  const getLocalText = (value: BilingualValue | string | undefined): string => {
    if (!value) return '';
    if (typeof value === 'string') return value;
    return value[language] || value.ko || value.en || '';
  };

  useEffect(() => {
    // 최소 표시 시간 보장
    const minDisplayTimer = setTimeout(() => {
      setIsFadingOut(true);
    }, duration);

    // 페이드 아웃 애니메이션 후 완료
    const fadeOutTimer = setTimeout(() => {
      setIsVisible(false);
      onComplete();
    }, duration + 500);

    return () => {
      clearTimeout(minDisplayTimer);
      clearTimeout(fadeOutTimer);
    };
  }, [duration, onComplete]);

  if (!isVisible) return null;

  return (
    <div
      className={`fixed inset-0 z-[100] flex items-center justify-center bg-white dark:bg-gray-900 transition-opacity duration-500 ${
        isFadingOut ? 'opacity-0' : 'opacity-100'
      }`}
    >
      <div className="flex flex-col items-center justify-center p-8">
        {/* 로고 */}
        {branding?.logoUrl ? (
          <div className="mb-8 animate-fade-in">
            <img
              src={branding.logoUrl}
              alt="학술대회 로고"
              className="max-w-[280px] max-h-[280px] w-auto h-auto object-contain"
            />
          </div>
        ) : (
          // 기본 로고 (로고가 없을 때)
          <div className="mb-8 animate-fade-in">
            <div className="w-32 h-32 bg-brand-primary rounded-3xl flex items-center justify-center shadow-2xl">
              <svg
                className="w-20 h-20 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
                />
              </svg>
            </div>
          </div>
        )}

        {/* 학술대회 이름 */}
        {branding?.eventName && (
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-gray-100 text-center mb-4 animate-fade-in-up">
            {getLocalText(branding.eventName)}
          </h1>
        )}

        {/* 로딩 스피너 */}
        <div className="mt-8 animate-fade-in-up">
          <div className="relative">
            <div className="w-16 h-16 border-4 border-brand-primary-light rounded-full"></div>
            <div className="absolute top-0 left-0 w-16 h-16 border-4 border-brand-primary border-t-transparent rounded-full animate-spin"></div>
          </div>
        </div>

        {/* 로딩 텍스트 */}
        <p className="mt-6 text-sm text-gray-600 dark:text-gray-400 font-medium animate-pulse">
          불러오는 중...
        </p>
      </div>

      {/* 하단 브랜딩 */}
      <div className="absolute bottom-8 left-0 right-0 text-center">
        <p className="text-xs text-gray-500 dark:text-gray-500">
          학술회의 eBook 플랫폼
        </p>
      </div>
    </div>
  );
};

export default SplashScreen;
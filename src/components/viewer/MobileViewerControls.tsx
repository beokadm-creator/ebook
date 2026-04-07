import React, { useState } from 'react';
import {
  AdjustmentsHorizontalIcon,
  Bars3Icon,
  MoonIcon,
  SunIcon,
  ChevronUpIcon,
  ChevronDownIcon
} from '@heroicons/react/24/outline';
import { useViewerSettings } from '@/stores/viewerStore';
import { useI18nStore } from '@/stores/i18nStore';
import BottomSheet from '@/components/common/BottomSheet';
import { TOCItem, BilingualValue } from '@/types/content';

interface MobileViewerControlsProps {
  toc?: TOCItem[];
  onNavigateToBlock?: (blockId: string) => void;
}

const MobileViewerControls: React.FC<MobileViewerControlsProps> = ({
  toc,
  onNavigateToBlock
}) => {
  const [activeSheet, setActiveSheet] = useState<'settings' | 'toc' | null>(null);
  const { language } = useI18nStore();
  const { 
    darkMode, 
    fontSize, 
    lineHeight, 
    letterSpacing, 
    fontFamily,
    updateSettings,
    toggleDarkMode,
    increaseFontSize,
    decreaseFontSize,
    resetSettings
  } = useViewerSettings();

  const getLocalText = (value: BilingualValue | string | undefined): string => {
    if (!value) return '';
    if (typeof value === 'string') return value;
    return value[language] || value.ko || value.en || '';
  };

  const fontFamilies = [
    { name: 'Pretendard', label: '프리텐다드' },
    { name: 'Noto Sans KR', label: 'Noto Sans KR' },
    { name: 'Malgun Gothic', label: '맑은 고딕' },
    { name: 'Georgia', label: '조지아 (세리프)' }
  ];

  const closeSheet = () => setActiveSheet(null);

  return (
    <>
      {/* FAB (Floating Action Button) - 하단 중앙 */}
      <div className="fixed bottom-8 left-1/2 transform -translate-x-1/2 z-30 flex items-center gap-3">
        {/* 목차 버튼 */}
        {toc && toc.length > 0 && (
          <button
            onClick={() => setActiveSheet('toc')}
            className="w-14 h-14 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-full shadow-2xl border-2 border-gray-200 dark:border-gray-700 flex items-center justify-center active:scale-95 transition-transform"
            aria-label="목차"
          >
            <Bars3Icon className="w-7 h-7" />
          </button>
        )}

        {/* 설정 버튼 */}
        <button
          onClick={() => setActiveSheet('settings')}
          className="w-16 h-16 bg-brand-primary hover:bg-brand-primary-hover active:bg-brand-primary text-white rounded-full shadow-2xl flex items-center justify-center active:scale-95 transition-transform"
          aria-label="독서 환경 설정"
        >
          <AdjustmentsHorizontalIcon className="w-8 h-8" />
        </button>
      </div>

      {/* 목차 Bottom Sheet */}
      <BottomSheet
        isOpen={activeSheet === 'toc'}
        onClose={closeSheet}
        title="목차"
        height="half"
      >
        <div className="space-y-1">
          {toc?.map((item) => (
            <button
              key={item.id}
              onClick={() => {
                onNavigateToBlock?.(item.blockId);
                closeSheet();
              }}
              className="w-full text-left px-4 py-3 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              style={{ paddingLeft: `${16 + item.level * 16}px` }}
            >
              <span className="text-base text-gray-900 dark:text-gray-100 font-medium">
                {getLocalText(item.title)}
              </span>
            </button>
          ))}
        </div>
      </BottomSheet>

      {/* 설정 Bottom Sheet */}
      <BottomSheet
        isOpen={activeSheet === 'settings'}
        onClose={closeSheet}
        title="독서 환경 설정"
        height="half"
      >
        <div className="space-y-6">
          {/* 다크 모드 토글 */}
          <div>
            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-base font-bold text-gray-900 dark:text-gray-100">
                다크 모드
              </span>
              <button
                onClick={toggleDarkMode}
                className={`relative w-16 h-10 rounded-full transition-colors ${
                  darkMode ? 'bg-brand-primary' : 'bg-gray-300'
                }`}
                aria-pressed={darkMode}
              >
                <div
                  className={`absolute top-1 w-8 h-8 bg-white rounded-full transition-transform shadow-md ${
                    darkMode ? 'translate-x-7' : 'translate-x-1'
                  }`}
                >
                  {darkMode ? (
                    <MoonIcon className="w-5 h-5 text-brand-primary m-1.5" />
                  ) : (
                    <SunIcon className="w-5 h-5 text-gray-600 m-1.5" />
                  )}
                </div>
              </button>
            </label>
          </div>

          {/* 폰트 크기 조절 */}
          <div>
            <label className="block text-base font-bold text-gray-900 dark:text-gray-100 mb-3">
              글자 크기
            </label>
            <div className="flex items-center gap-3">
              <button
                onClick={decreaseFontSize}
                disabled={fontSize <= 12}
                className="flex-1 p-4 bg-gray-100 dark:bg-gray-700 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600 active:bg-gray-300 dark:active:bg-gray-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                aria-label="글자 크기 감소"
              >
                <ChevronDownIcon className="w-6 h-6 mx-auto" />
              </button>
              <div className="flex-1 text-center py-4 bg-gray-50 dark:bg-gray-800 rounded-xl border-2 border-gray-200 dark:border-gray-700">
                <span className="text-xl font-bold text-gray-900 dark:text-gray-100">{fontSize}</span>
                <span className="text-sm text-gray-600 dark:text-gray-400 ml-1">px</span>
              </div>
              <button
                onClick={increaseFontSize}
                disabled={fontSize >= 32}
                className="flex-1 p-4 bg-gray-100 dark:bg-gray-700 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600 active:bg-gray-300 dark:active:bg-gray-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                aria-label="글자 크기 증가"
              >
                <ChevronUpIcon className="w-6 h-6 mx-auto" />
              </button>
            </div>
          </div>

          {/* 행간 조절 */}
          <div>
            <label className="block text-base font-bold text-gray-900 dark:text-gray-100 mb-3">
              행간
            </label>
            <input
              type="range"
              min="1.2"
              max="2.0"
              step="0.1"
              value={lineHeight}
              onChange={(e) => updateSettings({ lineHeight: parseFloat(e.target.value) })}
              className="w-full h-3 bg-gray-200 dark:bg-gray-700 rounded-xl appearance-none cursor-pointer"
              style={{
                WebkitAppearance: 'none',
                appearance: 'none'
              }}
            />
            <div className="flex justify-between text-sm font-medium text-gray-600 dark:text-gray-400 mt-2">
              <span>좁음</span>
              <span className="text-base font-bold text-gray-900 dark:text-gray-100">{lineHeight}</span>
              <span>넓음</span>
            </div>
          </div>

          {/* 자간 조절 */}
          <div>
            <label className="block text-base font-bold text-gray-900 dark:text-gray-100 mb-3">
              자간
            </label>
            <input
              type="range"
              min="-0.5"
              max="2"
              step="0.1"
              value={letterSpacing}
              onChange={(e) => updateSettings({ letterSpacing: parseFloat(e.target.value) })}
              className="w-full h-3 bg-gray-200 dark:bg-gray-700 rounded-xl appearance-none cursor-pointer"
              style={{
                WebkitAppearance: 'none',
                appearance: 'none'
              }}
            />
            <div className="flex justify-between text-sm font-medium text-gray-600 dark:text-gray-400 mt-2">
              <span>좁음</span>
              <span className="text-base font-bold text-gray-900 dark:text-gray-100">{letterSpacing}px</span>
              <span>넓음</span>
            </div>
          </div>

          {/* 폰트 패밀리 선택 */}
          <div>
            <label className="block text-base font-bold text-gray-900 dark:text-gray-100 mb-3">
              글꼴
            </label>
            <div className="grid grid-cols-2 gap-3">
              {fontFamilies.map((font) => (
                <button
                  key={font.name}
                  onClick={() => updateSettings({ fontFamily: font.name })}
                  className={`p-4 rounded-xl border-2 transition-all text-base font-medium ${
                    fontFamily === font.name
                      ? 'border-brand-primary bg-brand-primary-light text-brand-primary border-3'
                      : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 active:bg-gray-50 dark:active:bg-gray-700'
                  }`}
                  style={{ fontFamily: font.name }}
                  aria-pressed={fontFamily === font.name}
                >
                  <span className="text-base">{font.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* 초기화 버튼 */}
          <button
            onClick={resetSettings}
            className="w-full py-4 bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600 active:bg-gray-300 dark:active:bg-gray-500 transition-all text-base font-bold border-2 border-gray-200 dark:border-gray-600"
          >
            기본 설정으로 초기화
          </button>
        </div>
      </BottomSheet>
    </>
  );
};

export default MobileViewerControls;
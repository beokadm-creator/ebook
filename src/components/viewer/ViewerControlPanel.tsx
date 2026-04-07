import React, { useState } from 'react';
import { 
  AdjustmentsHorizontalIcon,
  MoonIcon,
  SunIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  XMarkIcon
} from '@heroicons/react/24/outline';
import { useViewerSettings } from '@/stores/viewerStore';

const ViewerControlPanel: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
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

  const fontFamilies = [
    { name: 'Pretendard', label: '프리텐다드' },
    { name: 'Noto Sans KR', label: 'Noto Sans KR' },
    { name: 'Malgun Gothic', label: '맑은 고딕' },
    { name: 'Georgia', label: '조지아 (세리프)' }
  ];

  return (
    <>
      {/* 플로팅 버튼 - 모바일 중심의 큰 버튼 */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-8 left-1/2 transform -translate-x-1/2 z-50 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white p-5 rounded-full shadow-2xl transition-all duration-300 min-w-[60px] min-h-[60px] flex items-center justify-center"
        aria-label="독서 환경 설정"
        aria-expanded={isOpen}
      >
        {isOpen ? (
          <XMarkIcon className="w-7 h-7" />
        ) : (
          <AdjustmentsHorizontalIcon className="w-7 h-7" />
        )}
      </button>

      {/* 설정 패널 - 모바일 최적화 */}
      {isOpen && (
        <div className="fixed bottom-28 left-1/2 transform -translate-x-1/2 z-40 bg-white dark:bg-gray-800 rounded-3xl shadow-2xl p-6 w-[95%] max-w-md border-2 border-gray-200 dark:border-gray-700 max-h-[70vh] overflow-y-auto">
          <h3 className="text-xl font-bold mb-6 text-gray-900 dark:text-gray-100">
            독서 환경 설정
          </h3>

          {/* 다크 모드 토글 - 더 큰 토글 */}
          <div className="mb-8">
            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-base font-bold text-gray-900 dark:text-gray-100">
                다크 모드
              </span>
              <button
                onClick={toggleDarkMode}
                className={`relative w-16 h-10 rounded-full transition-colors ${
                  darkMode ? 'bg-blue-600' : 'bg-gray-300'
                }`}
                aria-pressed={darkMode}
              >
                <div
                  className={`absolute top-1 w-8 h-8 bg-white rounded-full transition-transform shadow-md ${
                    darkMode ? 'translate-x-7' : 'translate-x-1'
                  }`}
                >
                  {darkMode ? (
                    <MoonIcon className="w-5 h-5 text-blue-600 m-1.5" />
                  ) : (
                    <SunIcon className="w-5 h-5 text-gray-600 m-1.5" />
                  )}
                </div>
              </button>
            </label>
          </div>

          {/* 폰트 크기 조절 - 더 큰 버튼 */}
          <div className="mb-8">
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

          {/* 행간 조절 - 더 큰 슬라이더 */}
          <div className="mb-8">
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

          {/* 자간 조절 - 더 큰 슬라이더 */}
          <div className="mb-8">
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

          {/* 폰트 패밀리 선택 - 더 큰 버튼 */}
          <div className="mb-8">
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
                      ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border-3'
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

          {/* 초기화 버튼 - 더 크고 누르기 쉬운 버튼 */}
          <button
            onClick={resetSettings}
            className="w-full py-4 bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600 active:bg-gray-300 dark:active:bg-gray-500 transition-all text-base font-bold border-2 border-gray-200 dark:border-gray-600"
          >
            기본 설정으로 초기화
          </button>
        </div>
      )}
    </>
  );
};

export default ViewerControlPanel;
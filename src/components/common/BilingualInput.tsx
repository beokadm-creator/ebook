import React, { useState } from 'react';
import {
  ChevronDownIcon,
  ChevronUpIcon,
  GlobeAltIcon
} from '@heroicons/react/24/outline';
import { useI18nStore } from '@/stores/i18nStore';

export interface BilingualValue {
  ko: string;
  en: string;
}

interface BilingualInputProps {
  label: string;
  value: BilingualValue;
  onChange: (value: BilingualValue) => void;
  placeholder?: {
    ko: string;
    en: string;
  };
  required?: boolean;
  disabled?: boolean;
  multiline?: boolean;
  rows?: number;
  maxLength?: number;
  showCount?: boolean;
}

const BilingualInput: React.FC<BilingualInputProps> = ({
  label,
  value,
  onChange,
  placeholder = {
    ko: '한국어 입력...',
    en: 'Enter English text...'
  },
  required = false,
  disabled = false,
  multiline = false,
  rows = 3,
  maxLength,
  showCount = false
}) => {
  const [expandedLang, setExpandedLang] = useState<'ko' | 'en' | 'both'>('both');
  const { language } = useI18nStore();

  const handleInputChange = (lang: 'ko' | 'en', inputValue: string) => {
    onChange({
      ...value,
      [lang]: inputValue
    });
  };

  const getCharCount = (lang: 'ko' | 'en') => {
    if (!showCount || !maxLength) return null;
    return (
      <span className={`text-xs ml-2 ${
        value[lang].length > maxLength 
          ? 'text-red-600 dark:text-red-400' 
          : 'text-gray-500 dark:text-gray-400'
      }`}>
        {value[lang].length} / {maxLength}
      </span>
    );
  };

  const InputField = ({ lang }: { lang: 'ko' | 'en' }) => {
    const isPrimary = lang === language;
    const langLabel = lang === 'ko' ? '한국어' : 'English';
    const flag = lang === 'ko' ? '🇰🇷' : '🇺🇸';

    if (multiline) {
      return (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
              <span>{flag}</span>
              <span>{langLabel}</span>
              {isPrimary && (
                <span className="px-2 py-0.5 bg-brand-primary-light text-brand-primary text-xs rounded-full font-medium">
                  Primary
                </span>
              )}
            </label>
            {getCharCount(lang)}
          </div>
          <textarea
            value={value[lang]}
            onChange={(e) => handleInputChange(lang, e.target.value)}
            placeholder={placeholder[lang]}
            disabled={disabled}
            rows={rows}
            maxLength={maxLength}
            className={`w-full px-4 py-3 bg-white dark:bg-gray-900 border-2 rounded-xl resize-none transition-colors
              ${isPrimary 
                ? 'border-brand-primary dark:border-brand-primary focus:border-brand-primary focus:ring-2 focus:ring-brand-primary-light' 
                : 'border-gray-200 dark:border-gray-700 focus:border-gray-300 dark:focus:border-gray-600 focus:ring-2 focus:ring-gray-200 dark:focus:ring-gray-700'
              }
              disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500`}
          />
        </div>
      );
    }

    return (
      <div className="relative">
        <div className="absolute left-4 top-1/2 -translate-y-1/2 flex items-center gap-2 text-gray-500 dark:text-gray-400">
          <span className="text-lg">{flag}</span>
        </div>
        <input
          type="text"
          value={value[lang]}
          onChange={(e) => handleInputChange(lang, e.target.value)}
          placeholder={placeholder[lang]}
          disabled={disabled}
          maxLength={maxLength}
          className={`w-full pl-12 pr-12 py-3 bg-white dark:bg-gray-900 border-2 rounded-xl transition-colors
            ${isPrimary 
              ? 'border-brand-primary dark:border-brand-primary focus:border-brand-primary focus:ring-2 focus:ring-brand-primary-light' 
              : 'border-gray-200 dark:border-gray-700 focus:border-gray-300 dark:focus:border-gray-600 focus:ring-2 focus:ring-gray-200 dark:focus:ring-gray-700'
            }
            disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500`}
        />
        <div className="absolute right-4 top-1/2 -translate-y-1/2">
          {getCharCount(lang)}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-3">
      {/* 라벨 */}
      <div className="flex items-center gap-2">
        <label className="text-base font-bold text-gray-900 dark:text-gray-100">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
        <button
          type="button"
          onClick={() => setExpandedLang(expandedLang === 'both' ? language : 'both')}
          className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          aria-label="Toggle language views"
        >
          {expandedLang === 'both' ? (
            <ChevronUpIcon className="w-4 h-4 text-gray-600 dark:text-gray-400" />
          ) : (
            <ChevronDownIcon className="w-4 h-4 text-gray-600 dark:text-gray-400" />
          )}
        </button>
      </div>

      {/* 입력 필드들 */}
      <div className={`space-y-3 ${expandedLang === 'both' ? '' : 'hidden'}`}>
        <InputField lang="ko" />
        <InputField lang="en" />
      </div>

      {/* 축소된 상태 - 현재 언어만 표시 */}
      {expandedLang !== 'both' && (
        <InputField lang={expandedLang} />
      )}

      {/* 미리보기 (두 언어 모두 입력된 경우) */}
      {value.ko && value.en && (
        <div className="p-3 bg-brand-primary-light dark:bg-brand-primary-light rounded-xl border border-brand-primary-dark dark:border-brand-primary-light">
          <div className="flex items-start gap-2 text-xs text-gray-600 dark:text-gray-400 mb-2">
            <GlobeAltIcon className="w-4 h-4 mt-0.5" />
            <span>Preview</span>
          </div>
          <div className="space-y-2">
            <div className={`text-sm ${language === 'ko' ? 'font-medium' : ''}`}>
              <span className="text-xs text-gray-500 dark:text-gray-400 mr-1">🇰🇷</span>
              <span className="text-gray-900 dark:text-gray-100">{value.ko}</span>
            </div>
            <div className={`text-sm ${language === 'en' ? 'font-medium' : ''}`}>
              <span className="text-xs text-gray-500 dark:text-gray-400 mr-1">🇺🇸</span>
              <span className="text-gray-900 dark:text-gray-100">{value.en}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BilingualInput;
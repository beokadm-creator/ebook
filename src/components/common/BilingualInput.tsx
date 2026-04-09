import React, { useState } from 'react';
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

interface InputFieldProps {
  lang: 'ko' | 'en';
  value: BilingualValue;
  handleInputChange: (lang: 'ko' | 'en', inputValue: string) => void;
  placeholder: string;
  disabled: boolean;
  multiline: boolean;
  rows: number;
  maxLength?: number;
  getCharCount: (lang: 'ko' | 'en') => React.ReactNode;
}

const InputField: React.FC<InputFieldProps> = ({
  lang,
  value,
  handleInputChange,
  placeholder,
  disabled,
  multiline,
  rows,
  maxLength,
  getCharCount
}) => {
  const langUpper = lang.toUpperCase();

  if (multiline) {
    return (
      <div className="relative">
        <div className="absolute top-3 right-4 px-2 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-[10px] font-bold text-gray-500 dark:text-gray-400 z-10">
          {langUpper}
        </div>
        <textarea
          value={value[lang]}
          onChange={(e) => handleInputChange(lang, e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          rows={rows}
          maxLength={maxLength}
          className="w-full px-5 py-4 bg-gray-50/50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-800 rounded-2xl focus:border-brand-primary focus:ring-4 focus:ring-brand-primary/10 transition-all outline-none text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500"
        />
        <div className="absolute bottom-3 right-4">
          {getCharCount(lang)}
        </div>
      </div>
    );
  }

  return (
    <div className="relative group">
      <div className="absolute left-4 top-1/2 -translate-y-1/2 px-2 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-[10px] font-bold text-gray-500 dark:text-gray-400">
        {langUpper}
      </div>
      <input
        type="text"
        value={value[lang]}
        onChange={(e) => handleInputChange(lang, e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        maxLength={maxLength}
        className="w-full pl-14 pr-12 py-4 bg-gray-50/50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-800 rounded-2xl focus:border-brand-primary focus:ring-4 focus:ring-brand-primary/10 transition-all outline-none text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500"
      />
      <div className="absolute right-4 top-1/2 -translate-y-1/2">
        {getCharCount(lang)}
      </div>
    </div>
  );
};

const BilingualInput: React.FC<BilingualInputProps> = ({
  label,
  value,
  onChange,
  placeholder = {
    ko: '내용을 입력하세요',
    en: 'Enter content'
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
      <span className={`text-[10px] ${
        value[lang].length > maxLength 
          ? 'text-red-500' 
          : 'text-gray-400'
      }`}>
        {value[lang].length}/{maxLength}
      </span>
    );
  };

  const renderInputField = (lang: 'ko' | 'en') => {
    return (
      <InputField
        lang={lang}
        value={value}
        handleInputChange={handleInputChange}
        placeholder={placeholder[lang]}
        disabled={disabled}
        multiline={multiline}
        rows={rows}
        maxLength={maxLength}
        getCharCount={getCharCount}
      />
    );
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-widest text-[11px]">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
        <button
          type="button"
          onClick={() => setExpandedLang(expandedLang === 'both' ? language : 'both')}
          className="text-[10px] font-bold text-brand-primary hover:underline transition-all"
        >
          {expandedLang === 'both' ? '단일 언어 편집' : '모든 언어 표시'}
        </button>
      </div>

      <div className={`space-y-3 ${expandedLang === 'both' ? '' : 'hidden'}`}>
        {renderInputField('ko')}
        {renderInputField('en')}
      </div>

      {expandedLang !== 'both' && renderInputField(expandedLang)}
    </div>
  );
};

export default BilingualInput;
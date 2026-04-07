import React, { useState } from 'react';
import { useI18nStore, Language } from '@/stores/i18nStore';
import {
  LanguageIcon,
  CheckIcon
} from '@heroicons/react/24/outline';
import BottomSheet from '@/components/common/BottomSheet';

interface LanguageSelectorProps {
  trigger?: 'button' | 'menu';
}

const LANGUAGES: Array<{
  code: Language;
  name: string;
  nativeName: string;
  flag: string;
}> = [
  { code: 'ko', name: 'Korean', nativeName: '한국어', flag: '🇰🇷' },
  { code: 'en', name: 'English', nativeName: 'English', flag: '🇺🇸' },
];

const LanguageSelector: React.FC<LanguageSelectorProps> = ({ trigger = 'button' }) => {
  const { language, setLanguage, t } = useI18nStore();
  const [isOpen, setIsOpen] = useState(false);

  const handleLanguageChange = (newLanguage: Language) => {
    setLanguage(newLanguage);
    setIsOpen(false);
  };

  const ButtonTrigger = () => (
    <button
      onClick={() => setIsOpen(true)}
      className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl hover:border-brand-primary dark:hover:border-brand-primary transition-colors"
    >
      <LanguageIcon className="w-5 h-5 text-gray-600 dark:text-gray-400" />
      <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
        {LANGUAGES.find(lang => lang.code === language)?.nativeName}
      </span>
    </button>
  );

  if (trigger === 'button') {
    return (
      <>
        <ButtonTrigger />
        <BottomSheet
          isOpen={isOpen}
          onClose={() => setIsOpen(false)}
          title={t.nav.settings}
          height="auto"
        >
          <div className="space-y-2">
            {LANGUAGES.map((lang) => (
              <button
                key={lang.code}
                onClick={() => handleLanguageChange(lang.code)}
                className={`w-full flex items-center justify-between p-4 rounded-xl border-2 transition-all ${
                  language === lang.code
                    ? 'border-brand-primary bg-brand-primary-light'
                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                }`}
              >
                <div className="flex items-center gap-4">
                  <span className="text-3xl">{lang.flag}</span>
                  <div className="text-left">
                    <p className="text-base font-bold text-gray-900 dark:text-gray-100">
                      {lang.nativeName}
                    </p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {lang.name}
                    </p>
                  </div>
                </div>
                {language === lang.code && (
                  <div className="bg-brand-primary rounded-full p-1">
                    <CheckIcon className="w-5 h-5 text-white" />
                  </div>
                )}
              </button>
            ))}
          </div>
        </BottomSheet>
      </>
    );
  }

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={() => setIsOpen(false)}
      title={t.nav.settings}
      height="auto"
    >
      <div className="space-y-2">
        {LANGUAGES.map((lang) => (
          <button
            key={lang.code}
            onClick={() => handleLanguageChange(lang.code)}
            className={`w-full flex items-center justify-between p-4 rounded-xl border-2 transition-all ${
              language === lang.code
                ? 'border-brand-primary bg-brand-primary-light'
                : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
            }`}
          >
            <div className="flex items-center gap-4">
              <span className="text-3xl">{lang.flag}</span>
              <div className="text-left">
                <p className="text-base font-bold text-gray-900 dark:text-gray-100">
                  {lang.nativeName}
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {lang.name}
                </p>
              </div>
            </div>
            {language === lang.code && (
              <div className="bg-brand-primary rounded-full p-1">
                <CheckIcon className="w-5 h-5 text-white" />
              </div>
            )}
          </button>
        ))}
      </div>
    </BottomSheet>
  );
};

export default LanguageSelector;
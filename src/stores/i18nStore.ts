import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Language, translations, Translations } from '@/i18n/translations';

// Re-export Language type so consumers can import it from this module
export type { Language } from '@/i18n/translations';

interface I18nState {
  language: Language;
  setLanguage: (language: Language) => void;
  t: Translations;
}

export const useI18nStore = create<I18nState>()(
  persist(
    (set) => ({
      language: 'ko',
      setLanguage: (language) => set({ language }),
      t: translations.ko,
    }),
    {
      name: 'i18n-storage',
      partialize: (state) => ({ language: state.language }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.t = translations[state.language];
        }
      },
    }
  )
);

// 언어가 변경될 때마다 t 자동 업데이트
useI18nStore.subscribe((state, prevState) => {
  if (state.language !== prevState.language) {
    useI18nStore.setState({ t: translations[state.language] });
  }
});
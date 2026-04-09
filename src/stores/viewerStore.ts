import { create } from 'zustand';
import { getLocalUserPreferences, saveLocalUserPreferences } from '@/lib/localUser';

export interface ViewerSettings {
  darkMode: boolean;
  fontSize: number;
  lineHeight: number;
  letterSpacing: number;
  fontFamily: string;
}

interface ViewerState extends ViewerSettings {
  updateSettings: (settings: Partial<ViewerSettings>) => void;
  resetSettings: () => void;
  toggleDarkMode: () => void;
  increaseFontSize: () => void;
  decreaseFontSize: () => void;
}

const DEFAULT_SETTINGS: ViewerSettings = {
  darkMode: false,
  fontSize: 18,
  lineHeight: 1.8,
  letterSpacing: 0,
  fontFamily: 'NanumSquare'
};

function loadFromLocalStorage(): ViewerSettings {
  const prefs = getLocalUserPreferences();
  return {
    darkMode: prefs.darkMode,
    fontSize: prefs.fontSize,
    lineHeight: prefs.lineHeight,
    letterSpacing: prefs.letterSpacing,
    fontFamily: prefs.fontFamily
  };
}

function syncToLocalStorage(state: ViewerSettings): void {
  saveLocalUserPreferences({
    darkMode: state.darkMode,
    fontSize: state.fontSize,
    lineHeight: state.lineHeight,
    letterSpacing: state.letterSpacing,
    fontFamily: state.fontFamily
  });
}

export const useViewerStore = create<ViewerState>()((set) => {
  const initial = loadFromLocalStorage();

  return {
    ...initial,

    updateSettings: (settings) =>
      set((state) => {
        const next = { ...state, ...settings };
        syncToLocalStorage(next);
        return next;
      }),

    resetSettings: () =>
      set(() => {
        syncToLocalStorage(DEFAULT_SETTINGS);
        return DEFAULT_SETTINGS;
      }),

    toggleDarkMode: () =>
      set((state) => {
        const next = { ...state, darkMode: !state.darkMode };
        syncToLocalStorage(next);
        return next;
      }),

    increaseFontSize: () =>
      set((state) => {
        const next = { ...state, fontSize: Math.min(state.fontSize + 2, 32) };
        syncToLocalStorage(next);
        return next;
      }),

    decreaseFontSize: () =>
      set((state) => {
        const next = { ...state, fontSize: Math.max(state.fontSize - 2, 12) };
        syncToLocalStorage(next);
        return next;
      }),
  };
});

export const useViewerSettings = () => {
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
  } = useViewerStore();

  return {
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
  };
};

export const useViewerStyles = () => {
  const { darkMode, fontSize, lineHeight, letterSpacing, fontFamily } = useViewerStore();

  const getTypographyStyles = () => ({
    fontSize: `${fontSize}px`,
    lineHeight: lineHeight.toString(),
    letterSpacing: `${letterSpacing}px`,
    fontFamily: `'${fontFamily}', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`
  });

  const getThemeClasses = () => ({
    bg: darkMode ? 'bg-gray-900' : 'bg-white',
    text: darkMode ? 'text-gray-100' : 'text-gray-900',
    textSecondary: darkMode ? 'text-gray-300' : 'text-gray-600',
    border: darkMode ? 'border-gray-700' : 'border-gray-200',
    card: darkMode ? 'bg-gray-800' : 'bg-white',
    shadow: darkMode ? 'shadow-gray-900/50' : 'shadow-gray-200/50'
  });

  return {
    getTypographyStyles,
    getThemeClasses,
    darkMode,
    fontSize,
    lineHeight,
    letterSpacing,
    fontFamily
  };
};

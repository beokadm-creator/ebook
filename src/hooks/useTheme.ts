import { useEffect } from 'react';
import { useViewerStore } from '@/stores/viewerStore';

type Theme = 'light' | 'dark';

/**
 * Unified dark mode hook — delegates to viewerStore as single source of truth.
 * viewerStore uses Zustand persist middleware (key: 'ebook-viewer-settings'),
 * so darkMode is automatically persisted. No separate localStorage key needed.
 */
export function useTheme() {
  const darkMode = useViewerStore((state) => state.darkMode);
  const toggleDarkMode = useViewerStore((state) => state.toggleDarkMode);

  const theme: Theme = darkMode ? 'dark' : 'light';

  useEffect(() => {
    document.documentElement.classList.remove('light', 'dark');
    document.documentElement.classList.add(theme);
  }, [theme]);

  return {
    theme,
    toggleTheme: toggleDarkMode,
    isDark: darkMode
  };
} 
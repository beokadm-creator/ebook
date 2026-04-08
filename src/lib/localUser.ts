const LOCAL_USER_KEY = 'ebook-local-user-id';
const PREFS_KEY = 'ebook-user-preferences';
const VIEWER_SETTINGS_KEY = 'ebook-viewer-settings';
const VIEWER_PROGRESS_PREFIX = 'ebook-viewer-progress:';

export interface UserPreferences {
  darkMode: boolean;
  fontSize: number;
  lineHeight: number;
  letterSpacing: number;
  fontFamily: string;
}

export interface ViewerPreferences {
  fontScale: number;
  lineHeight: number;
  letterSpacing: number;
  readingWidth: 'compact' | 'comfortable' | 'wide';
}

export interface ViewerProgress {
  anchorId: string | null;
  progressRatio: number;
  scrollY: number;
  updatedAt: string;
}

export interface ViewerProgressEntry {
  publicationId: string;
  progress: ViewerProgress;
}

export function getDefaultPreferences(): UserPreferences {
  return {
    darkMode: false,
    fontSize: 16,
    lineHeight: 1.6,
    letterSpacing: 0,
    fontFamily: 'Pretendard'
  };
}

export function getDefaultViewerPreferences(): ViewerPreferences {
  return {
    fontScale: 1,
    lineHeight: 1.8,
    letterSpacing: 0,
    readingWidth: 'comfortable',
  };
}

export function getLocalUserId(): string {
  let id = localStorage.getItem(LOCAL_USER_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(LOCAL_USER_KEY, id);
  }
  return id;
}

export function getLocalUserPreferences(): UserPreferences {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    return raw ? JSON.parse(raw) : getDefaultPreferences();
  } catch {
    return getDefaultPreferences();
  }
}

export function saveLocalUserPreferences(prefs: Partial<UserPreferences>): void {
  const current = getLocalUserPreferences();
  const merged = { ...current, ...prefs };
  localStorage.setItem(PREFS_KEY, JSON.stringify(merged));
}

export function getViewerPreferences(): ViewerPreferences {
  try {
    const raw = localStorage.getItem(VIEWER_SETTINGS_KEY);
    return raw ? { ...getDefaultViewerPreferences(), ...JSON.parse(raw) } : getDefaultViewerPreferences();
  } catch {
    return getDefaultViewerPreferences();
  }
}

export function saveViewerPreferences(prefs: Partial<ViewerPreferences>): void {
  const current = getViewerPreferences();
  const merged = { ...current, ...prefs };
  localStorage.setItem(VIEWER_SETTINGS_KEY, JSON.stringify(merged));
}

export function getViewerProgress(publicationId: string): ViewerProgress | null {
  try {
    const raw = localStorage.getItem(`${VIEWER_PROGRESS_PREFIX}${publicationId}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveViewerProgress(publicationId: string, progress: ViewerProgress): void {
  localStorage.setItem(`${VIEWER_PROGRESS_PREFIX}${publicationId}`, JSON.stringify(progress));
}

export function listViewerProgress(): ViewerProgressEntry[] {
  const entries: ViewerProgressEntry[] = [];

  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (!key || !key.startsWith(VIEWER_PROGRESS_PREFIX)) {
      continue;
    }

    try {
      const raw = localStorage.getItem(key);
      if (!raw) {
        continue;
      }

      entries.push({
        publicationId: key.replace(VIEWER_PROGRESS_PREFIX, ''),
        progress: JSON.parse(raw) as ViewerProgress,
      });
    } catch {
      continue;
    }
  }

  return entries;
}

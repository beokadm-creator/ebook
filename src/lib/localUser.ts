const LOCAL_USER_KEY = 'ebook-local-user-id';
const PREFS_KEY = 'ebook-user-preferences';

export interface UserPreferences {
  darkMode: boolean;
  fontSize: number;
  lineHeight: number;
  letterSpacing: number;
  fontFamily: string;
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

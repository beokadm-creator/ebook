import { create } from 'zustand';
import { getLocalUserId } from '../lib/localUser';

export interface Bookmark {
  id: string;
  publicationId: string;
  articleId?: string;
  blockId?: string;
  title: string;
  description?: string;
  createdAt: number;
}

export interface Highlight {
  id: string;
  publicationId: string;
  articleId?: string;
  blockId: string;
  text: string;
  color: 'yellow' | 'green' | 'blue' | 'pink' | 'orange';
  note?: string;
  createdAt: number;
}

interface PersonalizationState {
  bookmarks: Bookmark[];
  highlights: Highlight[];

  // 북마크 액션
  addBookmark: (bookmark: Omit<Bookmark, 'id' | 'createdAt'>) => void;
  removeBookmark: (id: string) => void;
  isBookmarked: (publicationId: string, articleId?: string, blockId?: string) => boolean;
  getBookmarksByPublication: (publicationId: string) => Bookmark[];

  // 하이라이트 액션
  addHighlight: (highlight: Omit<Highlight, 'id' | 'createdAt'>) => void;
  removeHighlight: (id: string) => void;
  updateHighlight: (id: string, updates: Partial<Highlight>) => void;
  getHighlightsByBlock: (blockId: string) => Highlight[];
  getHighlightsByPublication: (publicationId: string) => Highlight[];

  // 전체 삭제
  clearAll: () => void;
}

function getStorageKeys() {
  const userId = getLocalUserId();
  return {
    bookmarks: `ebook-bookmarks-${userId}`,
    highlights: `ebook-highlights-${userId}`,
  };
}

function loadFromStorage<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveToStorage<T>(key: string, data: T[]): void {
  localStorage.setItem(key, JSON.stringify(data));
}

export const usePersonalizationStore = create<PersonalizationState>()(
  (set, get) => ({
    bookmarks: loadFromStorage<Bookmark>(getStorageKeys().bookmarks),
    highlights: loadFromStorage<Highlight>(getStorageKeys().highlights),

    addBookmark: (bookmark) => {
      const newBookmark: Bookmark = {
        ...bookmark,
        id: `bookmark-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        createdAt: Date.now(),
      };

      set((state) => {
        const bookmarks = [...state.bookmarks, newBookmark];
        saveToStorage(getStorageKeys().bookmarks, bookmarks);
        return { bookmarks };
      });
    },

    removeBookmark: (id) => {
      set((state) => {
        const bookmarks = state.bookmarks.filter((b) => b.id !== id);
        saveToStorage(getStorageKeys().bookmarks, bookmarks);
        return { bookmarks };
      });
    },

    isBookmarked: (publicationId, articleId, blockId) => {
      return get().bookmarks.some(
        (b) =>
          b.publicationId === publicationId &&
          (articleId ? b.articleId === articleId : true) &&
          (blockId ? b.blockId === blockId : true)
      );
    },

    getBookmarksByPublication: (publicationId) => {
      return get().bookmarks.filter((b) => b.publicationId === publicationId);
    },

    addHighlight: (highlight) => {
      const newHighlight: Highlight = {
        ...highlight,
        id: `highlight-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        createdAt: Date.now(),
      };

      set((state) => {
        const highlights = [...state.highlights, newHighlight];
        saveToStorage(getStorageKeys().highlights, highlights);
        return { highlights };
      });
    },

    removeHighlight: (id) => {
      set((state) => {
        const highlights = state.highlights.filter((h) => h.id !== id);
        saveToStorage(getStorageKeys().highlights, highlights);
        return { highlights };
      });
    },

    updateHighlight: (id, updates) => {
      set((state) => {
        const highlights = state.highlights.map((h) =>
          h.id === id ? { ...h, ...updates } : h
        );
        saveToStorage(getStorageKeys().highlights, highlights);
        return { highlights };
      });
    },

    getHighlightsByBlock: (blockId) => {
      return get().highlights.filter((h) => h.blockId === blockId);
    },

    getHighlightsByPublication: (publicationId) => {
      return get().highlights.filter((h) => h.publicationId === publicationId);
    },

    clearAll: () => {
      const keys = getStorageKeys();
      localStorage.removeItem(keys.bookmarks);
      localStorage.removeItem(keys.highlights);
      set({ bookmarks: [], highlights: [] });
    },
  })
);

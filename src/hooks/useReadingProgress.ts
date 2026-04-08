import { useEffect, useRef, useCallback } from 'react';
import { getLocalUserId } from '../lib/localUser';

interface ReadingProgressOptions {
  publicationId: string;
  publicationTitle?: string;
  totalBlocks: number;
  enabled?: boolean;
}

interface ProgressEntry {
  progress: number;
  currentIndex: number;
  lastRead: number;
  title?: string;
}

interface ProgressData {
  [publicationId: string]: ProgressEntry;
}

function getStorageKey(): string {
  const userId = getLocalUserId();
  return `ebook-reading-progress-${userId}`;
}

function loadAllProgress(): ProgressData {
  try {
    const raw = localStorage.getItem(getStorageKey());
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveAllProgress(data: ProgressData): void {
  localStorage.setItem(getStorageKey(), JSON.stringify(data));
}

export function useReadingProgress({
  publicationId,
  publicationTitle,
  totalBlocks,
  enabled = true
}: ReadingProgressOptions) {
  const lastSavedIndexRef = useRef<number>(-1);
  const saveTimeoutRef = useRef<NodeJS.Timeout>();
  const progressRef = useRef<number>(0);

  const saveProgress = useCallback((currentIndex: number) => {
    if (!enabled || totalBlocks === 0) return;

    const newProgress = Math.round(((currentIndex + 1) / totalBlocks) * 100);

    if (Math.abs(newProgress - progressRef.current) < 5) return;
    if (currentIndex === lastSavedIndexRef.current) return;

    progressRef.current = newProgress;
    lastSavedIndexRef.current = currentIndex;

    const allProgress = loadAllProgress();
    allProgress[publicationId] = {
      progress: newProgress,
      currentIndex,
      lastRead: Date.now(),
      title: publicationTitle || allProgress[publicationId]?.title,
    };
    saveAllProgress(allProgress);
  }, [publicationId, publicationTitle, totalBlocks, enabled]);

  const handleScroll = useCallback((scrollTop: number, clientHeight: number, scrollHeight: number) => {
    if (!enabled || totalBlocks === 0) return;

    const scrollPercentage = scrollTop / (scrollHeight - clientHeight);
    const currentIndex = Math.min(
      Math.floor(scrollPercentage * totalBlocks),
      totalBlocks - 1
    );

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(() => {
      saveProgress(currentIndex);
    }, 1000);
  }, [totalBlocks, enabled, saveProgress]);

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  const loadProgress = useCallback((): { progress: number; currentIndex: number } | null => {
    if (!publicationId) return null;

    const allProgress = loadAllProgress();
    const entry = allProgress[publicationId];
    if (entry) {
      progressRef.current = entry.progress;
      lastSavedIndexRef.current = entry.currentIndex;
      return {
        progress: entry.progress,
        currentIndex: entry.currentIndex
      };
    }
    return null;
  }, [publicationId]);

  return {
    handleScroll,
    saveProgress,
    loadProgress,
    progress: progressRef.current
  };
}

/** Load all reading progress entries for the current local user (for MyPage). */
export function loadAllReadingProgress(): ProgressData {
  return loadAllProgress();
}

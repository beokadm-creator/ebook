import React, { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { FunnelIcon, ListBulletIcon, MagnifyingGlassIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { EbookEntry } from '@/lib/publishing/ebook';
import { renderRunsToReact } from '@/lib/publishing/richText';
import { SourcePublicationType } from '@/types/publishing';
import {
  getDefaultViewerPreferences,
  getViewerPreferences,
  getViewerProgress,
  saveViewerPreferences,
  saveViewerProgress,
} from '@/lib/localUser';

interface EbookViewerProps {
  publicationId: string;
  title: string;
  entries: EbookEntry[];
  sourcePublicationType?: SourcePublicationType;
}

const presentationThemes: Record<string, string> = {
  abstract: 'bg-[#f7f4ec]',
  poster: 'bg-[#f3efe6]',
  presentation: 'bg-[#f5f1e8]',
  default: 'bg-[#fcfaf5]',
};

const renderHighlightedText = (text: string, query: string) => {
  if (!query.trim()) {
    return text;
  }

  const normalizedQuery = query.trim();
  const parts = text.split(new RegExp(`(${normalizedQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
  return parts.map((part, index) =>
    part.toLowerCase() === normalizedQuery.toLowerCase() ? (
      <mark key={`${part}-${index}`} className="rounded bg-amber-200 px-0.5 text-inherit">
        {part}
      </mark>
    ) : (
      <React.Fragment key={`${part}-${index}`}>{part}</React.Fragment>
    ),
  );
};

const EbookViewer: React.FC<EbookViewerProps> = ({ publicationId, title, entries, sourcePublicationType }) => {
  const viewerPreferences = useMemo(() => getViewerPreferences(), []);
  const initialSavedProgress = useMemo(() => getViewerProgress(publicationId), [publicationId]);
  const [fontScale, setFontScale] = useState(viewerPreferences.fontScale ?? getDefaultViewerPreferences().fontScale);
  const [lineHeight, setLineHeight] = useState(viewerPreferences.lineHeight ?? getDefaultViewerPreferences().lineHeight);
  const [letterSpacing, setLetterSpacing] = useState(viewerPreferences.letterSpacing ?? getDefaultViewerPreferences().letterSpacing);
  const [readingWidth, setReadingWidth] = useState<'compact' | 'comfortable' | 'wide'>(viewerPreferences.readingWidth ?? 'comfortable');
  const [showNavigator, setShowNavigator] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [savedProgressLabel, setSavedProgressLabel] = useState<string | null>(null);
  const [currentAnchorId, setCurrentAnchorId] = useState<string | null>(null);
  const [currentProgressRatio, setCurrentProgressRatio] = useState(initialSavedProgress?.progressRatio ?? 0);
  const deferredSearchTerm = useDeferredValue(searchTerm);
  const restoreDoneRef = useRef(false);

  const tocItems = useMemo(
    () =>
      entries
        .filter((entry): entry is Extract<EbookEntry, { type: 'text' }> => entry.type === 'text' && Boolean(entry.toc))
        .map((entry) => ({
          id: entry.toc!.id,
          label: entry.toc!.label,
          level: entry.toc!.level,
          anchorId: entry.anchorId,
          preview: entry.text.slice(0, 80),
        })),
    [entries],
  );

  const navigatorResults = useMemo(() => {
    const query = deferredSearchTerm.trim().toLowerCase();
    if (!query) {
      return tocItems;
    }

    return tocItems.filter((item) => item.label.toLowerCase().includes(query) || item.preview.toLowerCase().includes(query));
  }, [deferredSearchTerm, tocItems]);
  const currentTocItem = tocItems.find((item) => item.anchorId === currentAnchorId) ?? null;
  const recentTocItem = tocItems.find((item) => item.anchorId === initialSavedProgress?.anchorId) ?? null;
  const progressPercent = Math.round(currentProgressRatio * 100);

  const containerWidthClass =
    readingWidth === 'compact' ? 'max-w-2xl' : readingWidth === 'wide' ? 'max-w-5xl' : 'max-w-3xl';
  const shellBackground = presentationThemes[sourcePublicationType || 'default'] ?? presentationThemes.default;

  const scrollToAnchor = (anchorId: string) => {
    const target = document.getElementById(anchorId);
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setShowNavigator(false);
  };

  const renderEntryContent = (entry: Extract<EbookEntry, { type: 'text' }>) =>
    deferredSearchTerm.trim() ? renderHighlightedText(entry.text, deferredSearchTerm) : renderRunsToReact(entry.runs);

  useEffect(() => {
    saveViewerPreferences({ fontScale, lineHeight, letterSpacing, readingWidth });
  }, [fontScale, letterSpacing, lineHeight, readingWidth]);

  useEffect(() => {
    if (!entries.length || restoreDoneRef.current) {
      return;
    }

    const saved = getViewerProgress(publicationId);
    if (!saved) {
      restoreDoneRef.current = true;
      return;
    }

    window.requestAnimationFrame(() => {
      if (saved.anchorId) {
        document.getElementById(saved.anchorId)?.scrollIntoView({ block: 'start' });
      } else if (saved.scrollY > 0) {
        window.scrollTo({ top: saved.scrollY });
      }
      setSavedProgressLabel(saved.anchorId ? '최근 위치 복원' : '읽던 위치 복원');
      restoreDoneRef.current = true;
    });
  }, [entries, publicationId]);

  useEffect(() => {
    if (!entries.length) {
      return;
    }

    let timeoutId: number | null = null;
    const textAnchors = entries
      .filter((entry): entry is Extract<EbookEntry, { type: 'text' }> => entry.type === 'text')
      .map((entry) => entry.anchorId);

    const saveProgressSnapshot = () => {
      const scrollTop = window.scrollY;
      const totalScrollable = Math.max(document.documentElement.scrollHeight - window.innerHeight, 1);
      let anchorId: string | null = textAnchors[0] ?? null;
      for (let index = textAnchors.length - 1; index >= 0; index -= 1) {
        const anchor = textAnchors[index];
        const node = document.getElementById(anchor);
        if (node && node.getBoundingClientRect().top <= 140) {
          anchorId = anchor;
          break;
        }
      }
      setCurrentAnchorId(anchorId);

      saveViewerProgress(publicationId, {
        anchorId,
        scrollY: scrollTop,
        progressRatio: Math.min(1, Math.max(0, scrollTop / totalScrollable)),
        updatedAt: new Date().toISOString(),
      });
      setCurrentProgressRatio(Math.min(1, Math.max(0, scrollTop / totalScrollable)));
    };

    const handleScroll = () => {
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
      timeoutId = window.setTimeout(saveProgressSnapshot, 120);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    saveProgressSnapshot();

    return () => {
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
      window.removeEventListener('scroll', handleScroll);
    };
  }, [entries, publicationId]);

  return (
    <div className={`min-h-screen ${shellBackground} text-slate-900`}>
      <div className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">Mobile eBook Viewer</p>
            <h1 className="truncate font-serif text-xl tracking-tight sm:text-2xl">{title}</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowNavigator(true)}
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700"
            >
              <ListBulletIcon className="h-4 w-4" />
              탐색
            </button>
            <button
              type="button"
              onClick={() => setShowSettings(true)}
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700"
            >
              <FunnelIcon className="h-4 w-4" />
              보기
            </button>
          </div>
        </div>
      </div>

      <div className={`mx-auto ${containerWidthClass} px-4 pb-24 pt-6 sm:px-6`}>
        <div className="mb-6 rounded-[28px] border border-slate-200 bg-white/80 px-5 py-4 text-sm text-slate-600 shadow-[0_14px_40px_rgba(15,23,42,0.06)]">
          <p>폰트 {Math.round(fontScale * 100)}% · 행간 {lineHeight.toFixed(2)} · 자간 {letterSpacing.toFixed(2)}px</p>
          <p className="mt-1">
            {sourcePublicationType === 'presentation'
              ? '구연발표형'
              : sourcePublicationType === 'poster'
                ? '포스터형'
                : '본문형'}
          </p>
          {savedProgressLabel ? <p className="mt-1 text-xs text-emerald-700">{savedProgressLabel}</p> : null}
        </div>

        <article
          className="space-y-8"
          style={{
            fontSize: `${fontScale}rem`,
            lineHeight,
            letterSpacing: `${letterSpacing}px`,
          }}
        >
          {entries.map((entry) => {
            if (entry.type === 'image') {
              return (
                <figure
                  key={entry.id}
                  id={entry.anchorId}
                  className={entry.readingWidth === 'full' || readingWidth === 'wide' ? 'mx-auto max-w-5xl' : 'mx-auto max-w-3xl'}
                >
                  <img
                    src={entry.src}
                    alt={entry.alt}
                    className="w-full rounded-[28px] shadow-[0_20px_60px_rgba(15,23,42,0.12)]"
                  />
                  {entry.caption ? (
                    <figcaption className="mt-3 text-center text-sm text-slate-500">{entry.caption}</figcaption>
                  ) : null}
                </figure>
              );
            }

            if (entry.semanticRole === 'title') {
              return (
                <h2 key={entry.id} id={entry.anchorId} className="font-serif text-4xl leading-tight tracking-tight sm:text-5xl">
                  {renderEntryContent(entry)}
                </h2>
              );
            }

            if (entry.semanticRole === 'heading' || entry.semanticRole === 'subheading') {
              return (
                <section key={entry.id} id={entry.anchorId} className="scroll-mt-24 rounded-[24px] bg-white/70 px-5 py-5 shadow-[0_10px_30px_rgba(15,23,42,0.05)]">
                  <h3 className={`leading-tight text-slate-900 ${entry.semanticRole === 'heading' ? 'text-2xl font-semibold sm:text-3xl' : 'text-xl font-semibold sm:text-2xl'}`}>
                    {renderEntryContent(entry)}
                  </h3>
                </section>
              );
            }

            if (entry.semanticRole === 'caption') {
              return (
                <p key={entry.id} id={entry.anchorId} className="text-center text-sm text-slate-500">
                  {renderEntryContent(entry)}
                </p>
              );
            }

            return (
              <p key={entry.id} id={entry.anchorId} className="text-[1em] text-slate-700">
                {renderEntryContent(entry)}
              </p>
            );
          })}
        </article>
      </div>

      {showNavigator ? (
        <div className="fixed inset-0 z-40 bg-slate-900/35">
          <div className="absolute inset-x-0 top-0 max-h-[88vh] overflow-y-auto rounded-b-[32px] bg-white px-4 pb-6 pt-5 shadow-2xl sm:left-auto sm:right-6 sm:top-6 sm:w-[420px] sm:rounded-[32px]">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">Navigator</p>
                <h2 className="mt-2 text-xl font-semibold text-slate-900">탐색</h2>
              </div>
              <button
                type="button"
                onClick={() => setShowNavigator(false)}
                className="rounded-full border border-slate-200 p-2 text-slate-500"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            <label className="mb-4 flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <MagnifyingGlassIcon className="h-4 w-4 text-slate-400" />
              <input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="섹션명, 키워드 검색"
                className="w-full bg-transparent text-sm outline-none"
              />
            </label>

            {currentTocItem ? (
              <button
                type="button"
                onClick={() => scrollToAnchor(currentTocItem.anchorId)}
                className="mb-3 block w-full rounded-2xl bg-sky-50 px-4 py-3 text-left"
              >
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-600">현재 읽는 섹션</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">{currentTocItem.label}</p>
                <p className="mt-1 text-xs text-sky-700">전체 읽기 진행률 {progressPercent}%</p>
              </button>
            ) : null}

            {recentTocItem && recentTocItem.anchorId !== currentTocItem?.anchorId ? (
              <button
                type="button"
                onClick={() => scrollToAnchor(recentTocItem.anchorId)}
                className="mb-4 block w-full rounded-2xl bg-emerald-50 px-4 py-3 text-left"
              >
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-600">최근 읽은 섹션</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">{recentTocItem.label}</p>
                {initialSavedProgress?.updatedAt ? (
                  <p className="mt-1 text-xs text-emerald-700">
                    마지막 기록 {new Date(initialSavedProgress.updatedAt).toLocaleString('ko-KR')}
                  </p>
                ) : null}
              </button>
            ) : null}

            <div className="mb-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                <span>읽기 진행</span>
                <span>{progressPercent}%</span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
                <div className="h-full rounded-full bg-slate-900 transition-[width]" style={{ width: `${progressPercent}%` }} />
              </div>
              <p className="mt-2 text-xs text-slate-500">
                {currentTocItem ? `현재 섹션: ${currentTocItem.label}` : '섹션 이동 전입니다.'}
              </p>
            </div>

            <div className="space-y-2">
              {navigatorResults.length ? (
                navigatorResults.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => scrollToAnchor(item.anchorId)}
                    className={`block w-full rounded-2xl px-4 py-3 text-left transition hover:bg-slate-50 ${item.level === 2 ? 'ml-4 w-[calc(100%-1rem)]' : 'bg-white'}`}
                  >
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Level {item.level}</p>
                    <p className="mt-1 text-sm font-semibold text-slate-800">{renderHighlightedText(item.label, deferredSearchTerm)}</p>
                    <p className="mt-1 line-clamp-2 text-xs text-slate-500">{renderHighlightedText(item.preview, deferredSearchTerm)}</p>
                  </button>
                ))
              ) : (
                <div className="rounded-2xl bg-slate-50 px-4 py-5 text-sm text-slate-500">결과 없음</div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {showSettings ? (
        <div className="fixed inset-0 z-40 bg-slate-900/35">
          <div className="absolute inset-x-0 bottom-0 rounded-t-[32px] bg-white px-4 pb-8 pt-5 shadow-2xl sm:left-auto sm:right-6 sm:top-24 sm:w-[420px] sm:rounded-[32px]">
            <div className="mb-5 flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">Reading</p>
                <h2 className="mt-2 text-xl font-semibold text-slate-900">보기 설정</h2>
              </div>
              <button
                type="button"
                onClick={() => setShowSettings(false)}
                className="rounded-full border border-slate-200 p-2 text-slate-500"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              <label className="block rounded-2xl bg-slate-50 px-4 py-3">
                <span className="mb-2 block text-sm font-semibold text-slate-700">폰트 크기</span>
                <input type="range" min="0.9" max="1.4" step="0.05" value={fontScale} onChange={(event) => setFontScale(Number(event.target.value))} className="w-full" />
              </label>
              <label className="block rounded-2xl bg-slate-50 px-4 py-3">
                <span className="mb-2 block text-sm font-semibold text-slate-700">행간</span>
                <input type="range" min="1.5" max="2.2" step="0.05" value={lineHeight} onChange={(event) => setLineHeight(Number(event.target.value))} className="w-full" />
              </label>
              <label className="block rounded-2xl bg-slate-50 px-4 py-3">
                <span className="mb-2 block text-sm font-semibold text-slate-700">자간</span>
                <input type="range" min="-0.5" max="1.5" step="0.05" value={letterSpacing} onChange={(event) => setLetterSpacing(Number(event.target.value))} className="w-full" />
              </label>
              <label className="block rounded-2xl bg-slate-50 px-4 py-3">
                <span className="mb-2 block text-sm font-semibold text-slate-700">본문 폭</span>
                <div className="grid grid-cols-3 gap-2">
                  <button type="button" onClick={() => setReadingWidth('compact')} className={`rounded-xl px-3 py-2 text-sm font-semibold ${readingWidth === 'compact' ? 'bg-slate-900 text-white' : 'bg-white text-slate-700'}`}>좁게</button>
                  <button type="button" onClick={() => setReadingWidth('comfortable')} className={`rounded-xl px-3 py-2 text-sm font-semibold ${readingWidth === 'comfortable' ? 'bg-slate-900 text-white' : 'bg-white text-slate-700'}`}>기본</button>
                  <button type="button" onClick={() => setReadingWidth('wide')} className={`rounded-xl px-3 py-2 text-sm font-semibold ${readingWidth === 'wide' ? 'bg-slate-900 text-white' : 'bg-white text-slate-700'}`}>넓게</button>
                </div>
              </label>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default EbookViewer;

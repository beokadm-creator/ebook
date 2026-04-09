import React, { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { FunnelIcon, ListBulletIcon, MagnifyingGlassIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { EbookEntry } from '@/lib/publishing/ebook';
import { getRenderableImageUrl } from '@/lib/publishing/assets';
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
    <div className={`min-h-screen ${shellBackground} text-slate-900 transition-colors duration-500`}>
      <div className="sticky top-0 z-30 glass-effect border-b border-white/20 dark:border-slate-800/50">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3 overflow-hidden">
             <button
                type="button"
                onClick={() => window.history.back()}
                className="flex-shrink-0 w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                aria-label="뒤로 가기"
             >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5 text-slate-600 dark:text-slate-300">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
                </svg>
             </button>
            <div className="min-w-0">
              <h1 className="truncate font-black text-lg sm:text-xl xl:text-2xl tracking-tight text-slate-900 leading-tight">{title}</h1>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              type="button"
              onClick={() => setShowNavigator(true)}
              className="inline-flex w-10 h-10 sm:w-auto sm:px-4 items-center justify-center gap-2 rounded-2xl bg-white shadow-sm border border-slate-200 text-sm font-bold text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <ListBulletIcon className="h-5 w-5 sm:h-4 sm:w-4" />
              <span className="hidden sm:inline">탐색</span>
            </button>
            <button
              type="button"
              onClick={() => setShowSettings(true)}
              className="inline-flex w-10 h-10 sm:w-auto sm:px-4 items-center justify-center gap-2 rounded-2xl bg-slate-900 text-white shadow-sm text-sm font-bold hover:bg-slate-800 transition-colors"
            >
              <FunnelIcon className="h-5 w-5 sm:h-4 sm:w-4" />
              <span className="hidden sm:inline">설정</span>
            </button>
          </div>
        </div>
      </div>

      <div className={`mx-auto ${containerWidthClass} px-4 pb-24 pt-8 sm:px-6`}>
        <div className="mb-8 rounded-[2rem] border border-slate-200/60 bg-white/60 backdrop-blur-md px-6 py-5 text-sm text-slate-600 shadow-xl shadow-slate-200/20">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 font-bold">
            <span>가독성 설정:</span>
            <span className="px-2 py-1 bg-slate-100 rounded-lg">폰트 {Math.round(fontScale * 100)}%</span>
            <span className="px-2 py-1 bg-slate-100 rounded-lg">행간 {lineHeight.toFixed(2)}</span>
            <span className="px-2 py-1 bg-slate-100 rounded-lg">자간 {letterSpacing.toFixed(2)}px</span>
          </div>
          <div className="mt-3 flex items-center justify-between">
            <p className="font-semibold text-slate-500">
              {sourcePublicationType === 'presentation'
                ? '구연발표 뷰'
                : sourcePublicationType === 'poster'
                  ? '포스터 뷰'
                  : '텍스트 뷰'}
            </p>
            {savedProgressLabel && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold tracking-wide">
                 <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                 {savedProgressLabel}
              </span>
            )}
          </div>
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
                    src={getRenderableImageUrl(entry.src)}
                    alt={entry.alt}
                    className="w-full rounded-2xl shadow-[0_20px_60px_rgba(15,23,42,0.12)]"
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
                <section key={entry.id} id={entry.anchorId} className="scroll-mt-24 rounded-2xl bg-white/70 px-5 py-5 shadow-[0_10px_30px_rgba(15,23,42,0.05)]">
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
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm transition-all duration-300">
          <div className="absolute inset-x-0 top-0 max-h-[88vh] overflow-y-auto rounded-b-[2.5rem] bg-white/95 backdrop-blur-xl border-b border-white/20 px-6 pb-8 pt-6 shadow-2xl sm:left-auto sm:right-6 sm:top-6 sm:w-[420px] sm:rounded-[2.5rem] sm:border">
            <div className="mb-6 flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-widest text-slate-400 mb-2">Navigator</p>
                <h2 className="text-2xl font-black text-slate-900 tracking-tight">탐색</h2>
              </div>
              <button
                type="button"
                onClick={() => setShowNavigator(false)}
                className="rounded-full bg-slate-100 p-2 text-slate-500 hover:bg-slate-200 transition-colors"
                aria-label="닫기"
              >
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>

            <label className="mb-6 flex items-center gap-3 rounded-[1.25rem] border border-slate-200/60 bg-slate-50/80 px-5 py-4 shadow-sm">
              <MagnifyingGlassIcon className="h-5 w-5 text-slate-400" />
              <input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="섹션명, 키워드 검색"
                className="w-full bg-transparent text-sm font-bold text-slate-900 placeholder:text-slate-400 outline-none"
              />
            </label>

            {currentTocItem ? (
              <button
                type="button"
                onClick={() => scrollToAnchor(currentTocItem.anchorId)}
                className="mb-3 block w-full rounded-[1.25rem] bg-sky-50 px-5 py-4 text-left transition-colors hover:bg-sky-100"
              >
                <p className="text-xs font-black uppercase tracking-widest text-sky-600 mb-1">현재 읽는 섹션</p>
                <p className="text-sm font-bold text-slate-900 mb-1">{currentTocItem.label}</p>
                <p className="text-xs font-semibold text-sky-700">전체 진행률 {progressPercent}%</p>
              </button>
            ) : null}

            {recentTocItem && recentTocItem.anchorId !== currentTocItem?.anchorId ? (
              <button
                type="button"
                onClick={() => scrollToAnchor(recentTocItem.anchorId)}
                className="mb-4 block w-full rounded-[1.25rem] bg-emerald-50 px-5 py-4 text-left transition-colors hover:bg-emerald-100"
              >
                <p className="text-xs font-black uppercase tracking-widest text-emerald-600 mb-1">최근 읽은 섹션</p>
                <p className="text-sm font-bold text-slate-900 mb-1">{recentTocItem.label}</p>
                {initialSavedProgress?.updatedAt ? (
                  <p className="text-xs font-semibold text-emerald-700">
                    마지막 기록 {new Date(initialSavedProgress.updatedAt).toLocaleString('ko-KR')}
                  </p>
                ) : null}
              </button>
            ) : null}

            <div className="mb-6 rounded-[1.25rem] border border-slate-200/60 bg-slate-50/80 px-5 py-4">
              <div className="flex items-center justify-between text-xs font-black uppercase tracking-widest text-slate-500 mb-3">
                <span>진행 상황</span>
                <span className="text-slate-900">{progressPercent}%</span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-slate-200/60">
                <div className="h-full rounded-full bg-slate-900 transition-[width] duration-300 ease-out" style={{ width: `${progressPercent}%` }} />
              </div>
              <p className="mt-3 text-xs font-semibold text-slate-500">
                {currentTocItem ? `현재 섹션: ${currentTocItem.label}` : '아직 섹션을 탐색하지 않았습니다.'}
              </p>
            </div>

            <div className="space-y-2">
              {navigatorResults.length ? (
                navigatorResults.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => scrollToAnchor(item.anchorId)}
                    className={`block w-full rounded-[1.25rem] px-5 py-4 text-left transition-colors border border-transparent shadow-sm hover:border-slate-200/60 hover:bg-slate-50 ${item.level === 2 ? 'ml-4 w-[calc(100%-1rem)] bg-white/50' : 'bg-white'}`}
                  >
                    <p className="text-xs font-black uppercase tracking-widest text-slate-400 mb-1">Level {item.level}</p>
                    <p className="text-sm font-bold text-slate-900 mb-1">{renderHighlightedText(item.label, deferredSearchTerm)}</p>
                    <p className="line-clamp-2 text-xs font-medium text-slate-500 leading-relaxed">{renderHighlightedText(item.preview, deferredSearchTerm)}</p>
                  </button>
                ))
              ) : (
                <div className="rounded-[1.25rem] bg-slate-50/80 px-5 py-8 text-center text-sm font-bold text-slate-500">결과를 찾을 수 없습니다</div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {showSettings ? (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm transition-all duration-300">
          <div className="absolute inset-x-0 bottom-0 rounded-t-[2.5rem] bg-white/95 backdrop-blur-xl border-t border-white/20 px-6 pb-10 pt-8 shadow-2xl sm:left-auto sm:right-6 sm:top-24 sm:w-[420px] sm:rounded-[2.5rem] sm:border">
            <div className="mb-8 flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-widest text-slate-400 mb-2">Display Settings</p>
                <h2 className="text-2xl font-black text-slate-900 tracking-tight">보기 설정</h2>
              </div>
              <button
                type="button"
                onClick={() => setShowSettings(false)}
                className="rounded-full bg-slate-100 p-2 text-slate-500 hover:bg-slate-200 transition-colors"
                aria-label="닫기"
              >
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>

            <div className="space-y-4">
              <label className="block rounded-2xl bg-slate-50/80 border border-slate-200/60 px-5 py-4">
                <span className="mb-3 flex items-center justify-between text-sm font-bold text-slate-700">
                   <span>텍스트 크기</span>
                   <span className="text-slate-400">{Math.round(fontScale * 100)}%</span>
                </span>
                <input type="range" min="0.9" max="1.4" step="0.05" value={fontScale} onChange={(event) => setFontScale(Number(event.target.value))} className="w-full accent-slate-900" />
              </label>
              
              <label className="block rounded-2xl bg-slate-50/80 border border-slate-200/60 px-5 py-4">
                <span className="mb-3 flex items-center justify-between text-sm font-bold text-slate-700">
                   <span>줄 간격 (행간)</span>
                   <span className="text-slate-400">{lineHeight.toFixed(2)}</span>
                </span>
                <input type="range" min="1.5" max="2.2" step="0.05" value={lineHeight} onChange={(event) => setLineHeight(Number(event.target.value))} className="w-full accent-slate-900" />
              </label>

              <label className="block rounded-2xl bg-slate-50/80 border border-slate-200/60 px-5 py-4">
                <span className="mb-3 flex items-center justify-between text-sm font-bold text-slate-700">
                   <span>글자 간격 (자간)</span>
                   <span className="text-slate-400">{letterSpacing.toFixed(2)}px</span>
                </span>
                <input type="range" min="-0.5" max="1.5" step="0.05" value={letterSpacing} onChange={(event) => setLetterSpacing(Number(event.target.value))} className="w-full accent-slate-900" />
              </label>

              <div className="block rounded-2xl bg-slate-50/80 border border-slate-200/60 px-5 py-4">
                <span className="mb-3 block text-sm font-bold text-slate-700">본문 폭</span>
                <div className="grid grid-cols-3 gap-2">
                  <button type="button" onClick={() => setReadingWidth('compact')} className={`rounded-xl px-3 py-2.5 text-sm font-bold transition-colors shadow-sm ${readingWidth === 'compact' ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 hover:bg-slate-100'}`}>좁게</button>
                  <button type="button" onClick={() => setReadingWidth('comfortable')} className={`rounded-xl px-3 py-2.5 text-sm font-bold transition-colors shadow-sm ${readingWidth === 'comfortable' ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 hover:bg-slate-100'}`}>기본</button>
                  <button type="button" onClick={() => setReadingWidth('wide')} className={`rounded-xl px-3 py-2.5 text-sm font-bold transition-colors shadow-sm ${readingWidth === 'wide' ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 hover:bg-slate-100'}`}>넓게</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default EbookViewer;

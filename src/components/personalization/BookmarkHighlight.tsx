import React, { useState, useRef, useEffect } from 'react';
import {
  BookmarkIcon,
  BookmarkSlashIcon,
  PencilIcon,
  TrashIcon,
  CheckIcon
} from '@heroicons/react/24/outline';
import { usePersonalizationStore, Highlight, Bookmark } from '@/stores/personalizationStore';

interface HighlightMenuProps {
  position: { x: number; y: number };
  onHighlight: (color: Highlight['color']) => void;
  onClose: () => void;
}

const HIGHLIGHT_COLORS: Array<{ color: Highlight['color']; bgClass: string; label: string }> = [
  { color: 'yellow', bgClass: 'bg-yellow-200 dark:bg-yellow-900/30', label: '노란색' },
  { color: 'green', bgClass: 'bg-green-200 dark:bg-green-900/30', label: '초록색' },
  { color: 'blue', bgClass: 'bg-blue-200 dark:bg-blue-900/30', label: '파란색' },
  { color: 'pink', bgClass: 'bg-pink-200 dark:bg-pink-900/30', label: '분홍색' },
  { color: 'orange', bgClass: 'bg-orange-200 dark:bg-orange-900/30', label: '주황색' },
];

export const HighlightMenu: React.FC<HighlightMenuProps> = ({ position, onHighlight, onClose }) => {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  return (
    <div
      ref={menuRef}
      className="fixed z-[70] bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border-2 border-gray-200 dark:border-gray-700 p-3"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        transform: 'translate(-50%, -100%) translateY(-10px)',
      }}
    >
      <div className="flex gap-2">
        {HIGHLIGHT_COLORS.map(({ color, bgClass, label }) => (
          <button
            key={color}
            onClick={() => onHighlight(color)}
            className={`w-10 h-10 ${bgClass} rounded-xl hover:opacity-80 transition-opacity border-2 border-transparent hover:border-gray-300 dark:hover:border-gray-600`}
            title={label}
            aria-label={label}
          >
            <span className="sr-only">{label}</span>
          </button>
        ))}
      </div>
    </div>
  );
};

interface BookmarkButtonProps {
  publicationId: string;
  articleId?: string;
  blockId?: string;
  title: string;
  description?: string;
}

export const BookmarkButton: React.FC<BookmarkButtonProps> = ({
  publicationId,
  articleId,
  blockId,
  title,
  description
}) => {
  const { addBookmark, removeBookmark, isBookmarked } = usePersonalizationStore();
  const [isAnimating, setIsAnimating] = useState(false);

  const bookmarked = isBookmarked(publicationId, articleId, blockId);

  const handleToggleBookmark = () => {
    setIsAnimating(true);
    setTimeout(() => setIsAnimating(false), 300);

    if (bookmarked) {
      // 해당 북마크 찾아서 삭제
      const bookmark = usePersonalizationStore.getState().bookmarks.find(
        (b) =>
          b.publicationId === publicationId &&
          (articleId ? b.articleId === articleId : true) &&
          (blockId ? b.blockId === blockId : true)
      );
      if (bookmark) {
        removeBookmark(bookmark.id);
      }
    } else {
      addBookmark({
        publicationId,
        articleId,
        blockId,
        title,
        description,
      });
    }
  };

  return (
    <button
      onClick={handleToggleBookmark}
      className={`p-3 rounded-xl transition-all ${
        bookmarked
          ? 'bg-yellow-100 dark:bg-yellow-900/20 text-yellow-600 dark:text-yellow-400'
          : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
      } ${isAnimating ? 'scale-110' : ''}`}
      aria-label={bookmarked ? '북마크 제거' : '북마크 추가'}
    >
      {bookmarked ? (
        <BookmarkIcon className={`w-6 h-6 ${isAnimating ? 'animate-bounce' : ''}`} />
      ) : (
        <BookmarkSlashIcon className="w-6 h-6" />
      )}
    </button>
  );
};

interface HighlightListProps {
  publicationId: string;
}

export const HighlightList: React.FC<HighlightListProps> = ({
  publicationId
}) => {
  const { highlights, removeHighlight, updateHighlight } = usePersonalizationStore();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [note, setNote] = useState('');

  const publicationHighlights = highlights.filter((h) => h.publicationId === publicationId);

  const handleUpdateNote = (id: string) => {
    updateHighlight(id, { note });
    setEditingId(null);
    setNote('');
  };

  if (publicationHighlights.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-600 dark:text-gray-400 text-sm">
          텍스트를 드래그하여 하이라이트를 추가하세요
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {publicationHighlights.map((highlight) => (
        <div
          key={highlight.id}
          className={`p-4 rounded-xl border-2 transition-all ${
            editingId === highlight.id
              ? 'border-brand-primary'
              : 'border-gray-200 dark:border-gray-700'
          }`}
        >
          <div className="flex items-start gap-3">
            {/* 색상 인디케이터 */}
            <div className={`flex-shrink-0 w-3 h-3 rounded-full ${
              HIGHLIGHT_COLORS.find((c) => c.color === highlight.color)?.bgClass || 'bg-gray-300'
            }`} />

            {/* 내용 */}
            <div className="flex-1 min-w-0">
              <p
                className={`text-sm text-gray-900 dark:text-gray-100 line-clamp-3 mb-2 ${
                  HIGHLIGHT_COLORS.find((c) => c.color === highlight.color)?.bgClass || ''
                }`}
              >
                {highlight.text}
              </p>

              {editingId === highlight.id ? (
                <div className="space-y-2">
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="메모를 입력하세요..."
                    className="w-full px-3 py-2 bg-white dark:bg-gray-900 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:border-brand-primary focus:outline-none resize-none"
                    rows={2}
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleUpdateNote(highlight.id)}
                      className="flex items-center gap-1 px-3 py-1.5 bg-brand-primary text-white rounded-lg text-xs font-medium hover:bg-brand-primary-hover transition-colors"
                    >
                      <CheckIcon className="w-3 h-3" />
                      저장
                    </button>
                    <button
                      onClick={() => {
                        setEditingId(null);
                        setNote('');
                      }}
                      className="px-3 py-1.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-xs font-medium hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                    >
                      취소
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  {highlight.note && (
                    <p className="text-xs text-gray-600 dark:text-gray-400 mb-2 italic">
                      💬 {highlight.note}
                    </p>
                  )}
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setEditingId(highlight.id);
                        setNote(highlight.note || '');
                      }}
                      className="flex items-center gap-1 px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded-lg text-xs hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                    >
                      <PencilIcon className="w-3 h-3" />
                      메모
                    </button>
                    <button
                      onClick={() => {
                        if (window.confirm('이 하이라이트를 삭제하시겠습니까?')) {
                          removeHighlight(highlight.id);
                        }
                      }}
                      className="flex items-center gap-1 px-2 py-1 bg-red-100 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg text-xs hover:bg-red-200 dark:hover:bg-red-900/40 transition-colors"
                    >
                      <TrashIcon className="w-3 h-3" />
                      삭제
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

interface BookmarkListProps {
  onBookmarkClick?: (bookmark: Bookmark) => void;
}

export const BookmarkList: React.FC<BookmarkListProps> = ({ onBookmarkClick }) => {
  const { bookmarks, removeBookmark } = usePersonalizationStore();

  if (bookmarks.length === 0) {
    return (
      <div className="text-center py-8">
        <BookmarkIcon className="mx-auto w-12 h-12 text-gray-400 mb-3" />
        <p className="text-gray-600 dark:text-gray-400 text-sm">
          북마크가 없습니다
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {bookmarks.map((bookmark) => (
        <div
          key={bookmark.id}
          className="p-4 bg-white dark:bg-gray-800 rounded-xl border-2 border-gray-200 dark:border-gray-700 hover:border-brand-primary transition-colors cursor-pointer"
          onClick={() => onBookmarkClick?.(bookmark)}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <h4 className="text-sm font-bold text-gray-900 dark:text-gray-100 mb-1 line-clamp-1">
                {bookmark.title}
              </h4>
              {bookmark.description && (
                <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-2">
                  {bookmark.description}
                </p>
              )}
              <p className="text-xs text-gray-500 dark:text-gray-500 mt-2">
                {new Date(bookmark.createdAt).toLocaleDateString('ko-KR')}
              </p>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (window.confirm('이 북마크를 삭제하시겠습니까?')) {
                  removeBookmark(bookmark.id);
                }
              }}
              className="flex-shrink-0 p-2 hover:bg-red-100 dark:hover:bg-red-900/20 rounded-lg transition-colors"
            >
              <TrashIcon className="w-4 h-4 text-red-600 dark:text-red-400" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};
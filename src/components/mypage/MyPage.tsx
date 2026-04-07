import { useState, useEffect } from 'react';
import { getDoc, doc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { usePersonalizationStore } from '../../stores/personalizationStore';
import { loadAllReadingProgress } from '../../hooks/useReadingProgress';
import { useViewerStore } from '../../stores/viewerStore';
import { 
  BookOpenIcon, 
  BookmarkIcon, 
  Cog6ToothIcon,
  SunIcon,
  MoonIcon,
  ClockIcon
} from '@heroicons/react/24/outline';

interface ReadingProgress {
  id: string;
  publicationId: string;
  progress: number;
  lastRead: Date;
}

interface Publication {
  id: string;
  title: string;
  coverImage?: string;
  type?: string;
}

type TabType = 'library' | 'bookmarks' | 'settings';

export default function MyPage() {
  const [activeTab, setActiveTab] = useState<TabType>('library');
  const [readingProgress, setReadingProgress] = useState<ReadingProgress[]>([]);
  const [publications, setPublications] = useState<Map<string, Publication>>(new Map());
  const [loading, setLoading] = useState(true);

  const bookmarks = usePersonalizationStore((state) => state.bookmarks);
  const removeBookmark = usePersonalizationStore((state) => state.removeBookmark);
  const { darkMode, toggleDarkMode, fontSize, increaseFontSize, decreaseFontSize, resetSettings } = useViewerStore();

  useEffect(() => {
    const loadLibraryData = async () => {
      try {
        setLoading(true);

        const allProgress = loadAllReadingProgress();
        const progressData: ReadingProgress[] = [];
        const pubMap = new Map<string, Publication>();

        // First, populate progress entries from localStorage (titles may already be stored)
        for (const [publicationId, entry] of Object.entries(allProgress)) {
          progressData.push({
            id: publicationId,
            publicationId,
            progress: entry.progress || 0,
            lastRead: new Date(entry.lastRead),
          });

          if (entry.title) {
            pubMap.set(publicationId, {
              id: publicationId,
              title: entry.title,
            });
          }
        }

        // Sort by lastRead descending
        progressData.sort((a, b) => b.lastRead.getTime() - a.lastRead.getTime());

        // Fetch publication titles from Firestore for entries that don't have a title cached
        const missingTitleIds = progressData
          .map((p) => p.publicationId)
          .filter((id) => !pubMap.has(id));

        await Promise.all(
          missingTitleIds.map(async (publicationId) => {
            try {
              const pubDoc = await getDoc(doc(db, 'publications', publicationId));
              if (pubDoc.exists()) {
                const pubData = pubDoc.data();
                pubMap.set(publicationId, {
                  id: pubDoc.id,
                  title: typeof pubData.title === 'string' ? pubData.title : (pubData.title?.ko || ''),
                  coverImage: pubData.coverImage,
                  type: pubData.type
                });
              }
            } catch {
              // Skip publications that can't be loaded
            }
          })
        );

        setReadingProgress(progressData);
        setPublications(pubMap);
      } catch (error) {
        console.error('Failed to load library data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadLibraryData();
  }, []);

  const handleDeleteBookmark = async (bookmarkId: string) => {
    if (confirm('북마크를 삭제하시겠습니까?')) {
      removeBookmark(bookmarkId);
    }
  };

  const formatDate = (date: Date) => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return '오늘';
    if (diffDays === 1) return '어제';
    if (diffDays < 7) return `${diffDays}일 전`;
    return date.toLocaleDateString('ko-KR');
  };

  const tabs = [
    { id: 'library' as TabType, label: '내 라이브러리', icon: BookOpenIcon },
    { id: 'bookmarks' as TabType, label: '북마크', icon: BookmarkIcon },
    { id: 'settings' as TabType, label: '환경 설정', icon: Cog6ToothIcon }
  ];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">
            마이페이지
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            나의 개인 공간
          </p>
        </div>

        <div className="border-b border-gray-200 dark:border-gray-700 mb-8">
          <nav className="flex space-x-8">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center space-x-2 py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                  activeTab === tab.id
                    ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                <tab.icon className="w-5 h-5" />
                <span>{tab.label}</span>
              </button>
            ))}
          </nav>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm">
          {activeTab === 'library' && (
            <div className="p-6">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-6">
                내 라이브러리
              </h2>

              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                </div>
              ) : readingProgress.length === 0 ? (
                <div className="text-center py-12">
                  <BookOpenIcon className="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
                  <p className="text-gray-500 dark:text-gray-400">
                    아직 열람한 eBook이 없습니다.
                  </p>
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {readingProgress.map((item: ReadingProgress) => {
                    const pub = publications.get(item.publicationId);
                    if (!pub) return null;

                    return (
                      <div
                        key={item.id}
                        className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:shadow-md transition-shadow"
                      >
                        <div className="flex items-start space-x-4">
                          {pub.coverImage && (
                            <img
                              src={pub.coverImage}
                              alt={pub.title}
                              className="w-20 h-28 object-cover rounded"
                            />
                          )}
                          <div className="flex-1 min-w-0">
                            <h3 className="font-medium text-gray-900 dark:text-gray-100 truncate mb-1">
                              {pub.title}
                            </h3>
                            <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
                              {item.progress}% 완료
                            </p>
                            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 mb-3">
                              <div
                                className="bg-blue-600 h-2 rounded-full transition-all"
                                style={{ width: `${item.progress}%` }}
                              />
                            </div>
                            <div className="flex items-center text-xs text-gray-400">
                              <ClockIcon className="w-3 h-3 mr-1" />
                              {formatDate(item.lastRead)}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {activeTab === 'bookmarks' && (
            <div className="p-6">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-6">
                북마크
              </h2>

              {bookmarks.length === 0 ? (
                <div className="text-center py-12">
                  <BookmarkIcon className="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
                  <p className="text-gray-500 dark:text-gray-400">
                    저장한 북마크가 없습니다.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {bookmarks.map((bookmark) => (
                    <div
                      key={bookmark.id}
                      className="flex items-start justify-between p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <h3 className="font-medium text-gray-900 dark:text-gray-100 mb-1">
                          {bookmark.title}
                        </h3>
                        {bookmark.description && (
                          <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                            {bookmark.description}
                          </p>
                        )}
                        <p className="text-xs text-gray-400">
                          {new Date(bookmark.createdAt).toLocaleDateString('ko-KR')}
                        </p>
                      </div>
                      <button
                        onClick={() => handleDeleteBookmark(bookmark.id)}
                        className="ml-4 text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                      >
                        삭제
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'settings' && (
            <div className="p-6">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-6">
                환경 설정
              </h2>

              <div className="space-y-6">
                <div className="border-b border-gray-200 dark:border-gray-700 pb-6">
                  <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-4">
                    표시 설정
                  </h3>

                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-gray-900 dark:text-gray-100">다크 모드</p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          어두운 테마를 사용합니다
                        </p>
                      </div>
                      <button
                        onClick={toggleDarkMode}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                          darkMode ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-700'
                        }`}
                      >
                        {darkMode ? (
                          <MoonIcon className="inline-block w-4 h-4 translate-x-6 text-white" />
                        ) : (
                          <SunIcon className="inline-block w-4 h-4 translate-x-1 text-gray-400" />
                        )}
                      </button>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <p className="font-medium text-gray-900 dark:text-gray-100">글꼴 크기</p>
                        <span className="text-sm text-gray-500 dark:text-gray-400">{fontSize}px</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={decreaseFontSize}
                          className="px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
                        >
                          -
                        </button>
                        <div className="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-full">
                          <div
                            className="h-2 bg-blue-600 rounded-full transition-all"
                            style={{ width: `${((fontSize - 12) / (32 - 12)) * 100}%` }}
                          />
                        </div>
                        <button
                          onClick={increaseFontSize}
                          className="px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-4">
                    초기화
                  </h3>
                  <button
                    onClick={() => {
                      if (confirm('모든 설정을 기본값으로 초기화하시겠습니까?')) {
                        resetSettings();
                      }
                    }}
                    className="px-4 py-2 text-red-600 border border-red-600 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20"
                  >
                    설정 초기화
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

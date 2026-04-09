import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { doc, getDoc, collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Conference, Publication, TOCItem, BilingualValue } from '@/types/content';
import { useBrandingStore } from '@/stores/brandingStore';
import { useI18nStore } from '@/stores/i18nStore';
import { 
  ArrowLeftIcon,
  BookOpenIcon,
  CalendarIcon,
  MapPinIcon,
  UserGroupIcon,
  PlayIcon,
  DocumentTextIcon,
  ChevronRightIcon
} from '@heroicons/react/24/outline';

const ConferenceDetail: React.FC = () => {
  const { conferenceId } = useParams<{ conferenceId: string }>();
  const [conference, setConference] = useState<Conference | null>(null);
  const [publications, setPublications] = useState<Publication[]>([]);
  const [selectedPublication, setSelectedPublication] = useState<Publication | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const setBranding = useBrandingStore((state) => state.setBranding);
  const clearBranding = useBrandingStore((state) => state.clearBranding);
  const { language } = useI18nStore();

  // 컴포넌트 언마운트 시 브랜딩 초기화
  useEffect(() => {
    return () => {
      clearBranding();
    };
  }, [clearBranding]);

  const getLocalText = (value: BilingualValue | string | undefined): string => {
    if (!value) return '';
    if (typeof value === 'string') return value;
    return value[language] || value.ko || value.en || '';
  };

  useEffect(() => {
    const fetchConferenceData = async () => {
      if (!conferenceId) return;

      try {
        setLoading(true);

        // 학술대회 정보 가져오기
        const conferenceDoc = await getDoc(doc(db, 'conferences', conferenceId));
        if (!conferenceDoc.exists()) {
          setError('학술대회를 찾을 수 없습니다.');
          return;
        }

        const conferenceData = {
          id: conferenceDoc.id,
          ...conferenceDoc.data()
        } as Conference;
        setConference(conferenceData);

        // 브랜딩 설정 적용
        if (conferenceData.branding) {
          setBranding(conferenceData.branding);
        }

        // 간행물 리스트 가져오기
        const publicationsQuery = query(
          collection(db, 'publications'),
          where('conferenceId', '==', conferenceId)
        );
        const publicationsSnapshot = await getDocs(publicationsQuery);
        const publicationsData = publicationsSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        } as Publication));

        setPublications(publicationsData);

        // 첫 번째 간행물 자동 선택
        if (publicationsData.length > 0) {
          setSelectedPublication(publicationsData[0]);
        }

      } catch (err: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
        console.error('Error fetching conference data:', err);
        setError('데이터를 불러오는데 실패했습니다.');
      } finally {
        setLoading(false);
      }
    };

    fetchConferenceData();
  }, [conferenceId]);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
  };

  const getPublicationTypeLabel = (type: string) => {
    const labels = {
      abstract: '초록집',
      poster: '포스터',
      presentation: '구연발표'
    };
    return labels[type as keyof typeof labels] || type;
  };

  const renderTOC = (toc: TOCItem[]) => {
    return (
      <ul className="space-y-2">
        {toc.map((item) => (
          <li key={item.id}>
            <a
              href={`#block-${item.blockId}`}
              className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors py-1"
            >
              <span className={`text-gray-400 ${item.level === 1 ? 'font-bold' : ''}`}>
                {'•'.repeat(item.level)}
              </span>
              <span className="flex-1">{getLocalText(item.title)}</span>
            </a>
            {item.children && item.children.length > 0 && (
              <div className="ml-4 mt-1">{renderTOC(item.children)}</div>
            )}
          </li>
        ))}
      </ul>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">로딩 중...</p>
        </div>
      </div>
    );
  }

  if (error || !conference) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 max-w-md text-center">
          <p className="text-red-600 dark:text-red-400 mb-4">{error || '학술대회를 찾을 수 없습니다.'}</p>
          <Link
            to="/"
            className="inline-block bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg"
          >
            목록으로 돌아가기
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* 헤더 */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="container mx-auto px-4 py-6">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 mb-4"
          >
            <ArrowLeftIcon className="w-4 h-4" />
            <span className="text-sm font-medium">목록으로</span>
          </Link>

          <div className="flex items-start justify-between">
            <div className="flex-1">
              <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-4">
                {getLocalText(conference.name)}
              </h1>
              <p className="text-gray-600 dark:text-gray-400 mb-4">
                {getLocalText(conference.description)}
              </p>

              <div className="flex flex-wrap gap-6 text-sm text-gray-600 dark:text-gray-400">
                <div className="flex items-center gap-2">
                  <CalendarIcon className="w-4 h-4" />
                  <span>{formatDate(conference.startDate)} ~ {formatDate(conference.endDate)}</span>
                </div>

                <div className="flex items-center gap-2">
                  <MapPinIcon className="w-4 h-4" />
                  <span>{getLocalText(conference.venue)}</span>
                </div>

                <div className="flex items-center gap-2">
                  <UserGroupIcon className="w-4 h-4" />
                  <span>{conference.organizer}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 메인 컨텐츠 */}
      <div className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* 왼쪽: 간행물 리스트 */}
          <div className="lg:col-span-1">
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6 sticky top-6">
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-4">
                간행물 ({publications.length})
              </h2>

              {publications.length === 0 ? (
                <div className="text-center py-8">
                  <DocumentTextIcon className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    등록된 간행물이 없습니다
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {publications.map((publication) => (
                    <button
                      key={publication.id}
                      onClick={() => setSelectedPublication(publication)}
                      className={`w-full text-left p-4 rounded-lg transition-colors ${
                        selectedPublication?.id === publication.id
                          ? 'bg-blue-50 dark:bg-blue-900/20 border-2 border-blue-600 dark:border-blue-400'
                          : 'bg-gray-50 dark:bg-gray-900 border-2 border-transparent hover:border-gray-300 dark:hover:border-gray-700'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-medium text-blue-600 dark:text-blue-400 uppercase">
                          {getPublicationTypeLabel(publication.type)}
                        </span>
                        {publication.status === 'published' && (
                          <span className="text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-2 py-1 rounded-full">
                            발행완료
                          </span>
                        )}
                      </div>

                      <h3 className="font-medium text-gray-900 dark:text-gray-100 mb-1">
                        {getLocalText(publication.title)}
                      </h3>

                      {publication.publishedAt && (
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {formatDate(typeof publication.publishedAt === 'string' ? publication.publishedAt : publication.publishedAt.toISOString())}
                        </p>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* 오른쪽: 선택된 간행물 상세 및 목차 */}
          <div className="lg:col-span-2">
            {selectedPublication ? (
              <div className="space-y-6">
                {/* 간행물 정보 카드 */}
                <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg overflow-hidden">
                  {selectedPublication.coverImage && (
                    <div className="aspect-w-16 aspect-h-9">
                      <img
                        src={selectedPublication.coverImage}
                        alt={getLocalText(selectedPublication.title)}
                        className="w-full h-48 object-cover"
                      />
                    </div>
                  )}

                  <div className="p-6">
                    <div className="flex items-center gap-3 mb-4">
                      <span className="text-sm font-medium text-blue-600 dark:text-blue-400 uppercase">
                        {getPublicationTypeLabel(selectedPublication.type)}
                      </span>
                      {selectedPublication.status === 'published' && (
                        <span className="text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-2 py-1 rounded-full">
                          발행완료
                        </span>
                      )}
                    </div>

                    <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-4">
                      {getLocalText(selectedPublication.title)}
                    </h2>

                    {selectedPublication.articles && selectedPublication.articles.length > 0 && (
                      <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 mb-6">
                        <BookOpenIcon className="w-4 h-4" />
                        <span>{selectedPublication.articles.length}개의 발표 자료</span>
                      </div>
                    )}

                    <Link
                      to={`/viewer/${selectedPublication.id}`}
                      className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-6 rounded-lg transition-colors"
                    >
                      <PlayIcon className="w-4 h-4" />
                      eBook 열기
                    </Link>
                  </div>
                </div>

                {/* 목차 프리뷰 */}
                {selectedPublication.articles && selectedPublication.articles.length > 0 && (
                  <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6">
                    <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-4">
                      목차 프리뷰
                    </h3>

                    <div className="space-y-4">
                      {selectedPublication.articles.slice(0, 5).map((article) => (
                        <div key={article.id}>
                          <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-2">
                            {getLocalText(article.title)}
                          </h4>

                          {article.toc && article.toc.length > 0 && (
                            <div className="ml-4 text-sm text-gray-600 dark:text-gray-400">
                              {renderTOC(article.toc.slice(0, 3))}
                            </div>
                          )}

                          {article.toc && article.toc.length > 3 && (
                            <p className="text-sm text-gray-500 dark:text-gray-500 mt-1 ml-4">
                              ... 외 {article.toc.length - 3}개 항목
                            </p>
                          )}
                        </div>
                      ))}
                    </div>

                    {selectedPublication.articles.length > 5 && (
                      <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700 text-center">
                        <Link
                          to={`/viewer/${selectedPublication.id}`}
                          className="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 text-sm font-medium inline-flex items-center gap-1"
                        >
                          전체 목차 보기
                          <ChevronRightIcon className="w-4 h-4" />
                        </Link>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-12 text-center">
                <DocumentTextIcon className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">
                  간행물을 선택해주세요
                </h3>
                <p className="text-gray-600 dark:text-gray-400">
                  왼쪽 목록에서 간행물을 선택하면 상세 정보가 표시됩니다.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConferenceDetail;
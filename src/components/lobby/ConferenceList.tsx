import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Conference, BilingualValue } from '@/types/content';
import { SearchBar, SearchResult } from '@/components/search/SearchBar';
import { searchContent } from '@/lib/searchService';
import LanguageSelector from '@/components/common/LanguageSelector';
import { useAuth } from '@/contexts/AuthContext';
import { useI18nStore } from '@/stores/i18nStore';
import { 
  CalendarIcon,
  MapPinIcon,
  UserGroupIcon,
  BookOpenIcon,
  ChevronRightIcon,
  SparklesIcon,
  UserIcon,
  ArrowRightStartOnRectangleIcon,
  MagnifyingGlassIcon
} from '@heroicons/react/24/outline';

interface ConferenceCardProps {
  conference: Conference;
}

const ConferenceCard: React.FC<ConferenceCardProps> = ({ conference }) => {
  const { language } = useI18nStore();

  const getLocalText = (value: BilingualValue | string | undefined): string => {
    if (!value) return '';
    if (typeof value === 'string') return value;
    return value[language] || value.ko || value.en || '';
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
  };

  const isOngoing = () => {
    const now = new Date();
    const startDate = new Date(conference.startDate);
    const endDate = new Date(conference.endDate);
    return now >= startDate && now <= endDate;
  };

  return (
    <Link to={`/conferences/${conference.id}`}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg hover:shadow-2xl active:shadow-xl transition-all duration-300 overflow-hidden border-2 border-gray-200 dark:border-gray-700 cursor-pointer group hover:border-blue-300 dark:hover:border-blue-600">
        {/* 진행 중 배너 - 더 큰 텍스트와 아이콘 */}
        {isOngoing() && (
          <div className="bg-gradient-to-r from-blue-600 to-purple-600 px-5 py-3">
            <div className="flex items-center gap-3 text-white">
              <SparklesIcon className="w-5 h-5 animate-pulse" />
              <span className="text-base font-bold">진행 중인 세미나</span>
            </div>
          </div>
        )}

        <div className="p-6">
          {/* 학술대회 이름 - 더 크고 명확하게 */}
          <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-4 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors leading-tight">
            {getLocalText(conference.name)}
          </h3>

          {/* 설명 - 더 큰 텍스트 */}
          <p className="text-gray-600 dark:text-gray-400 text-base mb-5 line-clamp-2 leading-relaxed">
            {getLocalText(conference.description)}
          </p>

          {/* 메타 정보 - 더 큰 아이콘과 텍스트 */}
          <div className="space-y-3 mb-5">
            <div className="flex items-center gap-3 text-base text-gray-700 dark:text-gray-300">
              <CalendarIcon className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              <span className="font-medium">{formatDate(conference.startDate)} ~ {formatDate(conference.endDate)}</span>
            </div>

            <div className="flex items-center gap-3 text-base text-gray-700 dark:text-gray-300">
              <MapPinIcon className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              <span className="font-medium">{getLocalText(conference.venue)}</span>
            </div>

            <div className="flex items-center gap-3 text-base text-gray-700 dark:text-gray-300">
              <UserGroupIcon className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              <span className="font-medium">{conference.organizer}</span>
            </div>
          </div>

          {/* 간행물 수 - 더 크고 명확하게 */}
          {conference.publications && conference.publications.length > 0 && (
            <div className="flex items-center justify-between pt-5 border-t-2 border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-3 text-base font-bold text-gray-900 dark:text-gray-100">
                <BookOpenIcon className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                <span>{conference.publications.length}개의 간행물</span>
              </div>
              <ChevronRightIcon className="w-7 h-7 text-gray-400 group-hover:text-blue-600 dark:group-hover:text-blue-400 group-hover:translate-x-2 transition-all" />
            </div>
          )}
        </div>
      </div>
    </Link>
  );
};

const ConferenceList: React.FC = () => {
  const [conferences, setConferences] = useState<Conference[]>([]);
  const [filteredConferences, setFilteredConferences] = useState<Conference[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const { user, signOut } = useAuth();

  useEffect(() => {
    const fetchConferences = async () => {
      try {
        setLoading(true);
        
        const q = query(
          collection(db, 'conferences'),
          orderBy('startDate', 'desc')
        );

        const querySnapshot = await getDocs(q);
        const conferencesData = querySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        } as Conference));

        // 진행 중인 세미나를 상단으로 정렬
        const sortedConferences = conferencesData.sort((a, b) => {
          const aOngoing = new Date(a.startDate) <= new Date() && new Date() <= new Date(a.endDate);
          const bOngoing = new Date(b.startDate) <= new Date() && new Date() <= new Date(b.endDate);
          
          if (aOngoing && !bOngoing) return -1;
          if (!aOngoing && bOngoing) return 1;
          
          return new Date(b.startDate).getTime() - new Date(a.startDate).getTime();
        });

        setConferences(sortedConferences);
        setFilteredConferences(sortedConferences);
      } catch (err: any) {
        console.error('Error fetching conferences:', err);
        setError('학술대회 목록을 불러오는데 실패했습니다.');
      } finally {
        setLoading(false);
      }
    };

    fetchConferences();
  }, []);

  // Firestore 기반 검색: conferences + publications 통합 검색
  const handleSearch = useCallback(async (searchQuery: string): Promise<SearchResult[]> => {
    if (!searchQuery.trim()) {
      setFilteredConferences(conferences);
      return [];
    }

    const results = await searchContent(searchQuery);

    // 검색 결과 중 conference 타입으로 화면의 카드 목록 필터링
    const matchedConfIds = new Set(
      results.filter(r => r.type === 'conference').map(r => r.id)
    );
    setFilteredConferences(
      matchedConfIds.size > 0
        ? conferences.filter(c => matchedConfIds.has(c.id))
        : []
    );

    return results;
  }, [conferences]);

  const handleSearchResultClick = useCallback((result: SearchResult) => {
    if (result.type === 'conference' && result.conferenceId) {
      navigate(`/conferences/${result.conferenceId}`);
    } else if (result.type === 'publication' && result.publicationId) {
      navigate(`/viewer/${result.publicationId}`);
    }
  }, [navigate]);

  const handleLogout = async () => {
    try {
      await signOut();
    } catch (err) {
      console.error('Logout failed:', err);
    }
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

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 max-w-md">
          <div className="text-center">
            <p className="text-red-600 dark:text-red-400 mb-4">{error}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg"
            >
              다시 시도
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* 헤더 */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">
                학술회의 eBook 라이브러리
              </h1>
              <p className="text-gray-600 dark:text-gray-400">
                다양한 학술대회의 발표 자료를 eBook으로 열람하세요
              </p>
            </div>
            <div className="flex items-center gap-4">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                총 {conferences.length}개의 학술대회
              </p>
              <LanguageSelector />
              {user ? (
                <div className="flex items-center gap-2">
                  <Link
                    to="/admin"
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                  >
                    <UserIcon className="w-4 h-4" />
                    관리
                  </Link>
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                  >
                    <ArrowRightStartOnRectangleIcon className="w-4 h-4" />
                    로그아웃
                  </button>
                </div>
              ) : (
                <Link
                  to="/login"
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                >
                  <UserIcon className="w-4 h-4" />
                  로그인
                </Link>
              )}
            </div>
          </div>
          {/* 검색바 */}
          <SearchBar
            onSearch={handleSearch}
            onResultClick={handleSearchResultClick}
            placeholder="학술대회 검색..."
            showFilters={false}
          />
        </div>
      </div>

      {/* 학술대회 리스트 */}
      <div className="container mx-auto px-4 py-8">
        {filteredConferences.length === 0 && conferences.length > 0 ? (
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-12 text-center">
            <MagnifyingGlassIcon className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">
              검색 결과가 없습니다
            </h3>
            <p className="text-gray-600 dark:text-gray-400">
              다른 검색어로 시도해보세요
            </p>
          </div>
        ) : filteredConferences.length === 0 ? (
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-12 text-center">
            <BookOpenIcon className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">
              등록된 학술대회가 없습니다
            </h3>
            <p className="text-gray-600 dark:text-gray-400">
              첫 번째 학술대회를 등록해보세요!
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredConferences.map((conference) => (
              <ConferenceCard key={conference.id} conference={conference} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ConferenceList;
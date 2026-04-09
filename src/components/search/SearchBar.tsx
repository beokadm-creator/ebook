import React, { useState, useCallback } from 'react';
import {
  MagnifyingGlassIcon,
  XMarkIcon,
  FunnelIcon,
  AcademicCapIcon,
  BookOpenIcon,
  DocumentIcon,
  PencilIcon
} from '@heroicons/react/24/outline';
import { useI18nStore } from '@/stores/i18nStore';

export interface SearchResult {
  id: string;
  type: 'conference' | 'publication' | 'article' | 'content';
  title: string;
  description?: string;
  conferenceId?: string;
  publicationId?: string;
  articleId?: string;
  blockId?: string;
  relevance: number;
}

interface SearchBarProps {
  onSearch: (query: string) => Promise<SearchResult[]>;
  onResultClick?: (result: SearchResult) => void;
  placeholder?: string;
  showFilters?: boolean;
}

export const SearchBar: React.FC<SearchBarProps> = ({
  onSearch,
  onResultClick,
  placeholder,
  showFilters = false
}) => {
  const { t, language } = useI18nStore();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState<'all' | 'conferences' | 'publications' | 'content'>('all');

  // 디바운스 검색
  const debouncedSearch = useCallback(
    async (searchQuery: string) => {
      if (!searchQuery.trim()) {
        setResults([]);
        setShowResults(false);
        return;
      }

      setIsSearching(true);
      try {
        const searchResults = await onSearch(searchQuery);
        
        // 필터링
        const filteredResults = selectedFilter === 'all' 
          ? searchResults
          : searchResults.filter(result => {
              if (selectedFilter === 'conferences') return result.type === 'conference';
              if (selectedFilter === 'publications') return result.type === 'publication';
              if (selectedFilter === 'content') return result.type === 'article' || result.type === 'content';
              return true;
            });

        setResults(filteredResults);
        setShowResults(true);
      } catch (error) {
        console.error('Search failed:', error);
        setResults([]);
      } finally {
        setIsSearching(false);
      }
    },
    [onSearch, selectedFilter]
  );

  // 디바운스 타이머 ref
  const timerRef = React.useRef<ReturnType<typeof setTimeout>>();

  // 검색 입력 처리 (디바운스 300ms)
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newQuery = e.target.value;
    setQuery(newQuery);

    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    timerRef.current = setTimeout(() => {
      debouncedSearch(newQuery);
    }, 300);
  };

  // 언마운트 시 타이머 정리
  React.useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  // 검색 초기화
  const clearSearch = () => {
    setQuery('');
    setResults([]);
    setShowResults(false);
  };

  // 결과 클릭 처리
  const handleResultClick = (result: SearchResult) => {
    onResultClick?.(result);
    setShowResults(false);
  };

  // 현재 언어로 제목 변환
  const getLocalTitle = (title: any): string => { // eslint-disable-line @typescript-eslint/no-explicit-any
    if (typeof title === 'string') return title;
    return title?.[language] || title?.ko || title?.en || '';
  };

  return (
    <div className="relative w-full">
      {/* 검색바 입력 영역 */}
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
          <MagnifyingGlassIcon className="h-5 w-5 text-gray-400" />
        </div>
        
        <input
          type="text"
          value={query}
          onChange={handleInputChange}
          placeholder={placeholder || t.conference.allConferences}
          className={`w-full pl-12 pr-12 py-4 bg-white dark:bg-gray-800 border-2 rounded-xl text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-brand-primary transition-colors ${
             showResults ? 'rounded-b-none border-b-0' : ''
          }`}
        />

        {query && (
          <button
            onClick={clearSearch}
            className="absolute inset-y-0 right-0 pr-4 flex items-center"
          >
            <XMarkIcon className="h-5 w-5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors" />
          </button>
        )}
      </div>

      {/* 검색 필터 */}
      {showFilters && query && (
        <div className="flex items-center gap-2 px-4 py-3 bg-white dark:bg-gray-800 border-x-2 border-b-2 border-gray-200 dark:border-gray-700">
          <FunnelIcon className="w-4 h-4 text-gray-500 dark:text-gray-400 mr-2" />
          <div className="flex gap-2">
            {(['all', 'conferences', 'publications', 'content'] as const).map((filter) => (
              <button
                key={filter}
                onClick={() => setSelectedFilter(filter)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  selectedFilter === filter
                    ? 'bg-brand-primary text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
              >
                {filter === 'all' && '전체'}
                {filter === 'conferences' && '학술대회'}
                {filter === 'publications' && '간행물'}
                {filter === 'content' && '콘텐츠'}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 검색 결과 드롭다운 */}
      {showResults && (
        <div className="absolute z-50 w-full bg-white dark:bg-gray-800 border-2 border-t-0 border-gray-200 dark:border-gray-700 rounded-b-xl shadow-2xl max-h-[60vh] overflow-y-auto">
          {isSearching ? (
            <div className="p-6 text-center">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-brand-primary"></div>
              <p className="mt-3 text-sm text-gray-600 dark:text-gray-400">
                검색 중...
              </p>
            </div>
          ) : results.length > 0 ? (
            <div className="divide-y divide-gray-200 dark:divide-gray-700">
              {results.map((result) => (
                <button
                  key={result.id}
                  onClick={() => handleResultClick(result)}
                  className="w-full px-6 py-4 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-left"
                >
                  <div className="flex items-start gap-3">
                    {/* 타입 아이콘 */}
                    <div className={`flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center ${
                      result.type === 'conference'
                        ? 'bg-blue-100 dark:bg-blue-900/20'
                        : result.type === 'publication'
                        ? 'bg-green-100 dark:bg-green-900/20'
                        : 'bg-purple-100 dark:bg-purple-900/20'
                    }`}>
                      <span className="text-lg">
                        {result.type === 'conference' && <AcademicCapIcon className="h-5 w-5" />}
                        {result.type === 'publication' && <BookOpenIcon className="h-5 w-5" />}
                        {result.type === 'article' && <DocumentIcon className="h-5 w-5" />}
                        {result.type === 'content' && <PencilIcon className="h-5 w-5" />}
                      </span>
                    </div>

                    {/* 내용 */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">
                        {result.type === 'conference' && '학술대회'}
                        {result.type === 'publication' && '간행물'}
                        {result.type === 'article' && '논문'}
                        {result.type === 'content' && '콘텐츠'}
                      </p>
                      <h4 className="text-base font-bold text-gray-900 dark:text-gray-100 mb-1 line-clamp-1">
                        {getLocalTitle(result.title)}
                      </h4>
                      {result.description && (
                        <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
                          {result.description}
                        </p>
                      )}
                    </div>

                    {/* 관련성 점수 */}
                    {result.relevance && (
                      <div className="flex-shrink-0">
                        <div className={`px-2 py-1 rounded text-xs font-bold ${
                          result.relevance > 0.8
                            ? 'bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-400'
                            : result.relevance > 0.5
                            ? 'bg-yellow-100 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400'
                            : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                        }`}>
                          {Math.round(result.relevance * 100)}%
                        </div>
                      </div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="p-8 text-center">
              <MagnifyingGlassIcon className="mx-auto h-12 w-12 text-gray-400 mb-3" />
              <p className="text-gray-900 dark:text-gray-100 font-medium mb-1">
                검색 결과 없음
              </p>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                다른 검색어를 시도해보세요
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
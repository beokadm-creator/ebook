import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Conference, BilingualValue } from '@/types/content';
import { SearchBar, SearchResult } from '@/components/search/SearchBar';
import { searchContent } from '@/lib/searchService';
import { useI18nStore } from '@/stores/i18nStore';
import { 
  CalendarIcon,
  MapPinIcon,
  BookOpenIcon,
  ChevronRightIcon,
  MagnifyingGlassIcon,
  AcademicCapIcon
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
    <Link to={`/conferences/${conference.id}`} className="block group h-full">
      <div className="relative bg-white/80 dark:bg-slate-900/80 backdrop-blur-md rounded-2xl p-1 shadow-lg shadow-slate-200/20 dark:shadow-none border border-slate-200/60 dark:border-slate-800 transition-all duration-300 hover:shadow-2xl hover:shadow-blue-900/5 hover:-translate-y-1 h-full flex flex-col overflow-hidden">
        {/* Top Section with Icon and Status */}
        <div className="p-8 pb-4">
          <div className="flex items-start justify-between mb-6">
            <div className="w-16 h-16 rounded-[1.25rem] bg-slate-100 dark:bg-slate-800 flex items-center justify-center group-hover:bg-blue-600 group-hover:scale-110 transition-all duration-300 shadow-sm">
              <AcademicCapIcon className="w-8 h-8 text-slate-500 group-hover:text-white transition-colors duration-300" />
            </div>
            {isOngoing() && (
              <span className="flex items-center gap-2 px-4 py-2 rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 text-xs font-black tracking-widest uppercase shadow-sm">
                <span className="w-2 h-2 rounded-full bg-blue-600 dark:bg-blue-400 animate-pulse"></span>
                LIVE
              </span>
            )}
          </div>

          <h3 className="text-2xl font-black text-slate-900 dark:text-white mb-3 line-clamp-2 min-h-[4rem] leading-tight group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
            {getLocalText(conference.name)}
          </h3>
          
          <p className="text-slate-500 dark:text-slate-400 text-sm font-medium line-clamp-2 mb-6 leading-relaxed">
            {getLocalText(conference.description)}
          </p>
        </div>

        {/* Meta Info */}
        <div className="px-6 py-5 bg-slate-50/50 dark:bg-slate-900/20 mt-auto border-t border-slate-100 dark:border-slate-800">
          <div className="space-y-3">
            <div className="flex items-center gap-3 text-sm text-slate-600 dark:text-slate-400">
              <CalendarIcon className="w-4 h-4" />
              <span className="font-medium tracking-tight">
                {formatDate(conference.startDate)} - {formatDate(conference.endDate)}
              </span>
            </div>
            <div className="flex items-center gap-3 text-sm text-slate-600 dark:text-slate-400">
              <MapPinIcon className="w-4 h-4" />
              <span className="font-medium truncate">{getLocalText(conference.venue)}</span>
            </div>
          </div>
        </div>

        {/* Footer with Publication Count */}
        {conference.publications && conference.publications.length > 0 && (
          <div className="px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex -space-x-2">
                {[...Array(Math.min(3, conference.publications.length))].map((_, i) => (
                  <div key={i} className="w-7 h-7 rounded-full border-2 border-white dark:border-slate-800 bg-slate-200 dark:bg-slate-700 flex items-center justify-center overflow-hidden">
                    <BookOpenIcon className="w-3.5 h-3.5 text-slate-400" />
                  </div>
                ))}
              </div>
              <span className="text-[13px] font-bold text-slate-900 dark:text-slate-200 ml-1">
                {conference.publications.length} 간행물
              </span>
            </div>
            <div className="w-8 h-8 rounded-full bg-slate-900 dark:bg-white flex items-center justify-center transform translate-x-4 opacity-0 group-hover:translate-x-0 group-hover:opacity-100 transition-all duration-300">
               <ChevronRightIcon className="w-4 h-4 text-white dark:text-slate-900" />
            </div>
          </div>
        )}
      </div>
    </Link>
  );
};

const ConferenceList: React.FC = () => {
  const [conferences, setConferences] = useState<Conference[]>([]);
  const [filteredConferences, setFilteredConferences] = useState<Conference[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchConferences = async () => {
      try {
        setLoading(true);
        const q = query(collection(db, 'conferences'), orderBy('startDate', 'desc'));
        const querySnapshot = await getDocs(q);
        const conferencesData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Conference));

        const sortedConferences = conferencesData.sort((a, b) => {
          const aOngoing = new Date(a.startDate) <= new Date() && new Date() <= new Date(a.endDate);
          const bOngoing = new Date(b.startDate) <= new Date() && new Date() <= new Date(b.endDate);
          if (aOngoing && !bOngoing) return -1;
          if (!aOngoing && bOngoing) return 1;
          return new Date(b.startDate).getTime() - new Date(a.startDate).getTime();
        });

        setConferences(sortedConferences);
        setFilteredConferences(sortedConferences);
      } catch (err) {
        console.error('Error fetching conferences:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchConferences();
  }, []);

  const handleSearch = useCallback(async (searchQuery: string): Promise<SearchResult[]> => {
    if (!searchQuery.trim()) {
      setFilteredConferences(conferences);
      return [];
    }
    const results = await searchContent(searchQuery);
    const matchedConfIds = new Set(results.filter(r => r.type === 'conference').map(r => r.id));
    setFilteredConferences(matchedConfIds.size > 0 ? conferences.filter(c => matchedConfIds.has(c.id)) : []);
    return results;
  }, [conferences]);

  const handleSearchResultClick = useCallback((result: SearchResult) => {
    if (result.type === 'conference' && result.conferenceId) {
      navigate(`/conferences/${result.conferenceId}`);
    } else if (result.type === 'publication' && result.publicationId) {
      navigate(`/viewer/${result.publicationId}`);
    }
  }, [navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-mesh dark:bg-slate-950">
        <div className="text-center animate-fade-in text-slate-500 font-bold uppercase tracking-widest text-xs">
          <div className="w-12 h-12 rounded-full border-4 border-slate-100 border-t-blue-600 animate-spin mx-auto mb-4"></div>
          지식을 준비 중입니다...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-mesh dark:bg-slate-950 transition-colors duration-500">
      {/* Top Glass Navigation */}
      <nav className="sticky top-0 z-50 glass-effect border-b border-white/20 dark:border-slate-800/50 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3 group">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-600/20 group-hover:scale-105 transition-transform">
              <AcademicCapIcon className="w-6 h-6 text-white" />
            </div>
            <span className="text-xl font-black tracking-tighter text-slate-900 dark:text-white uppercase">
              EBOOK
            </span>
          </Link>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-6 pt-16 pb-32">
        {/* Dynamic Hero Section */}
        <div className="text-center md:text-left max-w-4xl mx-auto md:mx-0 mb-24 animate-fade-in-up">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-slate-900 text-white dark:bg-white dark:text-slate-900 text-[10px] font-black tracking-[0.2em] uppercase mb-8 mx-auto md:mx-0 shadow-xl shadow-slate-900/10">
             <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></span>
             Premium Knowledge Space
          </div>
          <h1 className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-black tracking-tighter text-slate-900 dark:text-white mb-8 leading-[1.05]">
            Academic Knowledge, <br className="hidden sm:block" />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-500">Perfected.</span>
          </h1>
          <p className="text-lg sm:text-xl text-slate-600 dark:text-slate-400 mb-12 leading-relaxed font-bold max-w-2xl mx-auto md:mx-0">
            최신 학술대회의 모든 발표 자료를 완벽하게 모바일 최적화된 eBook 뷰어로 경험하세요. 최고의 전문가들을 위한 가장 혁신적인 지식 아카이브입니다.
          </p>

          <div className="max-w-2xl mx-auto md:mx-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-2xl p-3 rounded-[2rem] shadow-[0_20px_60px_rgba(15,23,42,0.08)] border border-white/40 dark:border-slate-800">
            <SearchBar
              onSearch={handleSearch}
              onResultClick={handleSearchResultClick}
              placeholder="학술대회명, 발표자, 키워드 검색..."
              showFilters={false}
            />
          </div>
        </div>

        {/* Content Section */}
        <div className="space-y-12">
          <div className="flex items-end justify-between border-b border-slate-200 dark:border-slate-800 pb-6">
            <div>
              <h2 className="text-2xl font-black text-slate-900 dark:text-white mb-1">
                학술대회 보관함
              </h2>
              <p className="text-slate-500 dark:text-slate-400 text-sm font-medium">
                총 {conferences.length}개의 학술대회가 등록되어 있습니다.
              </p>
            </div>
          </div>

          {filteredConferences.length === 0 ? (
            <div className="py-24 text-center animate-fade-in">
              <div className="w-20 h-20 bg-slate-100 dark:bg-slate-900 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <MagnifyingGlassIcon className="w-10 h-10 text-slate-300" />
              </div>
              <h3 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">검색 결과가 없습니다</h3>
              <p className="text-slate-500 dark:text-slate-400">다른 키워드나 태그로 검색해 보세요.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {filteredConferences.map((conference, index) => (
                <div key={conference.id} className="animate-fade-in-up" style={{ animationDelay: `${index * 0.1}s` }}>
                  <ConferenceCard conference={conference} />
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Modern Footer with Hongcom Info */}
      <footer className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 py-16 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-start mb-12">
            <div>
              <div className="flex items-center gap-3 mb-6">
                <div className="w-8 h-8 bg-slate-200 dark:bg-slate-800 rounded-lg flex items-center justify-center">
                  <AcademicCapIcon className="w-5 h-5 text-slate-500" />
                </div>
                <span className="font-black text-slate-900 dark:text-white tracking-widest uppercase">EBOOK</span>
              </div>
              <p className="text-slate-500 dark:text-slate-400 text-sm font-medium leading-relaxed max-w-sm">
                최신 학술대회의 가치를 디지털로 보존하고 확산합니다. 혁신적인 eBook 솔루션으로 전문가의 지식 경험을 완성합니다.
              </p>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 text-sm">
              <div className="space-y-4">
                <h4 className="font-black text-slate-900 dark:text-white uppercase tracking-widest text-xs">Company Info</h4>
                <div className="space-y-2 text-slate-500 dark:text-slate-400 font-medium">
                   <p>주식회사 홍커뮤니케이션 (HONG COM. CORP)</p>
                   <p>대표이사: 이혜정</p>
                   <p>사업자등록번호: 264-81-48344</p>
                </div>
              </div>
              <div className="space-y-4">
                <h4 className="font-black text-slate-900 dark:text-white uppercase tracking-widest text-xs">Contact Us</h4>
                <div className="space-y-2 text-slate-500 dark:text-slate-400 font-medium">
                   <p>서울특별시 송파구 송파대로 167, B동 319호 (문정동, 문정역테라타워)</p>
                   <p>TEL: 02-6959-3871~3</p>
                   <p>FAX: 02-2054-3874</p>
                   <p>Email: info@hongcomm.kr</p>
                </div>
              </div>
            </div>
          </div>
          
          <div className="pt-8 border-t border-slate-100 dark:border-slate-900 flex flex-col md:flex-row items-center justify-between gap-4">
            <span className="text-xs font-bold text-slate-400 dark:text-slate-500 tracking-tight">
              © 2026 HONG COM. CORP. ALL RIGHTS RESERVED.
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default ConferenceList;
import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { doc, getDoc, collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Conference, Publication, BilingualValue } from '@/types/content';
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
  AcademicCapIcon,
} from '@heroicons/react/24/outline';

interface PublicationCardProps {
  publication: Publication;
  formatDate: (v: string | Date | undefined) => string;
  getLocalText: (v: BilingualValue | string | undefined) => string;
  getPublicationTypeLabel: (v: string) => string;
}

const PublicationCard: React.FC<PublicationCardProps> = ({ 
  publication, 
  formatDate, 
  getLocalText,
  getPublicationTypeLabel 
}) => {
  return (
    <div className="group bg-white/80 dark:bg-slate-900/80 backdrop-blur-md rounded-2xl overflow-hidden border border-slate-200/60 dark:border-slate-800 shadow-lg shadow-slate-200/20 dark:shadow-none p-2 transition-all duration-300 hover:shadow-2xl hover:shadow-blue-900/5 hover:-translate-y-1 flex flex-col md:flex-row relative">
      <div className="md:w-72 flex-shrink-0 bg-slate-100 dark:bg-slate-800/50 rounded-[2rem] overflow-hidden relative group-hover:bg-blue-50 dark:group-hover:bg-blue-900/20 transition-colors">
        {publication.coverImage ? (
          <img
            src={publication.coverImage}
            alt={getLocalText(publication.title)}
            className="w-full h-full object-cover aspect-[3/4] md:aspect-[3/4] group-hover:scale-105 transition-transform duration-500"
          />
        ) : (
          <div className="aspect-[3/4] md:h-full flex flex-col items-center justify-center p-8 text-center text-slate-400 dark:text-slate-500">
             <DocumentTextIcon className="w-16 h-16 mb-4 opacity-50" />
             <span className="text-xs font-black uppercase tracking-widest bg-white/50 dark:bg-slate-900/50 px-3 py-1.5 rounded-full">{getPublicationTypeLabel(publication.type)}</span>
          </div>
        )}
        <div className="absolute inset-0 bg-slate-900/5 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
           <div className="w-16 h-16 bg-white/90 backdrop-blur-sm rounded-full flex items-center justify-center shadow-2xl transform scale-90 group-hover:scale-100 transition-transform duration-300">
              <PlayIcon className="w-8 h-8 text-blue-600 ml-1" />
           </div>
        </div>
      </div>

      <div className="flex-1 p-6 md:p-10 flex flex-col justify-between">
        <div>
          <div className="flex items-center gap-3 mb-6">
            <span className="text-xs font-black text-blue-600 dark:text-blue-400 uppercase tracking-widest px-3 py-1.5 bg-blue-50 dark:bg-blue-900/30 rounded-full border border-blue-100 dark:border-blue-800">
              {getPublicationTypeLabel(publication.type)}
            </span>
            {publication.status === 'published' && (
              <span className="flex items-center gap-1.5 text-[10px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-widest">
                 <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                 PUBLISHED
              </span>
            )}
          </div>

          <h3 className="text-3xl md:text-4xl font-black text-slate-900 dark:text-white mb-6 leading-[1.1] group-hover:text-transparent group-hover:bg-clip-text group-hover:bg-gradient-to-r group-hover:from-blue-600 group-hover:to-indigo-500 transition-all duration-300">
            {getLocalText(publication.title)}
          </h3>

          <div className="flex flex-wrap items-center gap-6 text-sm text-slate-500 dark:text-slate-400 font-bold mb-8">
             <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800/50 px-3 py-1.5 rounded-lg border border-slate-100 dark:border-slate-800">
                <CalendarIcon className="w-4 h-4 text-slate-400" />
                <span>{formatDate(publication.publishedAt)}</span>
             </div>
             {publication.articles && publication.articles.length > 0 && (
               <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800/50 px-3 py-1.5 rounded-lg border border-slate-100 dark:border-slate-800">
                  <BookOpenIcon className="w-4 h-4 text-slate-400" />
                  <span>{publication.articles.length} 발표자료</span>
               </div>
             )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4 mt-auto">
          <Link
            to={`/viewer/${publication.id}`}
            className="inline-flex w-full md:w-auto justify-center items-center gap-3 bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-black px-10 py-5 rounded-[1.25rem] hover:bg-blue-600 dark:hover:bg-blue-500 hover:text-white transition-all duration-300 shadow-xl shadow-slate-900/10 active:scale-95 group-hover:shadow-blue-600/20"
          >
            <PlayIcon className="w-6 h-6" />
            <span className="tracking-wide">E-BOOK 화면으로 열람하기</span>
          </Link>
        </div>
      </div>
    </div>
  );
};

const ConferenceDetail: React.FC = () => {
  const { conferenceId } = useParams<{ conferenceId: string }>();
  const [conference, setConference] = useState<Conference | null>(null);
  const [publications, setPublications] = useState<Publication[]>([]);
  const [loading, setLoading] = useState(true);
  const setBranding = useBrandingStore((state) => state.setBranding);
  const clearBranding = useBrandingStore((state) => state.clearBranding);
  const { language } = useI18nStore();

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
        const conferenceDoc = await getDoc(doc(db, 'conferences', conferenceId));
        if (!conferenceDoc.exists()) return;

        const conferenceData = { id: conferenceDoc.id, ...conferenceDoc.data() } as Conference;
        setConference(conferenceData);
        if (conferenceData.branding) setBranding(conferenceData.branding);

        const publicationsQuery = query(collection(db, 'publications'), where('conferenceId', '==', conferenceId));
        const publicationsSnapshot = await getDocs(publicationsQuery);
        const publicationsData = publicationsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Publication));
        setPublications(publicationsData);
      } catch (err) {
        console.error('Error fetching conference data:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchConferenceData();
  }, [conferenceId, setBranding]);

  const formatDate = (value: string | Date | undefined): string => {
    if (!value) return '날짜 정보 없음';
    let date: Date;
    if (value instanceof Date) {
      date = value;
    } else if (typeof value === 'object' && value !== null && 'toDate' in value) {
      const timestamp = value as { toDate: () => Date };
      date = timestamp.toDate();
    } else {
      date = new Date(value);
    }
    if (isNaN(date.getTime())) return '날짜 정보 없음';
    return date.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
  };

  const getPublicationTypeLabel = (type: string) => {
    const labels = { abstract: '초록집', poster: '포스터', presentation: '구연발표' };
    return labels[type as keyof typeof labels] || type;
  };

  if (loading) {
     return (
       <div className="min-h-screen flex items-center justify-center bg-mesh">
         <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600"></div>
       </div>
     );
  }

  if (!conference) return null;

  return (
    <div className="min-h-screen bg-mesh dark:bg-slate-950 transition-colors duration-500">
      {/* Redesigned Header */}
      <nav className="glass-effect border-b border-white/20 dark:border-slate-800/50 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3 transition-transform hover:translate-x-[-4px]">
            <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
              <ArrowLeftIcon className="w-4 h-4 text-slate-500" />
            </div>
            <span className="text-sm font-black text-slate-500 uppercase tracking-widest">목록으로</span>
          </Link>
          <div className="flex items-center gap-3">
             <span className="text-lg font-black text-slate-900 dark:text-white tracking-widest uppercase">EBOOK</span>
          </div>
        </div>
      </nav>

      <main className="max-w-5xl mx-auto px-6 pt-20 pb-24">
        {/* Conference Hero Header */}
        <header className="mb-24 animate-fade-in-up md:px-8">
          <div className="flex flex-col md:flex-row md:items-center gap-4 mb-8">
             <span className="self-start px-4 py-2 rounded-full bg-slate-900 text-white dark:bg-white dark:text-slate-900 text-xs font-black tracking-[0.2em] uppercase shadow-xl shadow-slate-900/10">
               CONFERENCE ARCHIVE
             </span>
             <span className="hidden md:block w-1.5 h-1.5 rounded-full bg-slate-300 dark:bg-slate-700"></span>
             <span className="text-slate-500 dark:text-slate-400 text-sm font-bold tracking-tight">
               {formatDate(conference.startDate)} - {formatDate(conference.endDate)}
             </span>
          </div>
          
          <h1 className="text-5xl sm:text-6xl md:text-7xl font-black text-slate-900 dark:text-white mb-10 tracking-tighter leading-[1.05]">
            {getLocalText(conference.name)}
          </h1>
          
          <p className="text-xl md:text-2xl text-slate-600 dark:text-slate-400 font-bold leading-relaxed max-w-4xl mb-16">
            {getLocalText(conference.description)}
          </p>

          <div className="flex flex-col sm:flex-row flex-wrap gap-6 sm:gap-12 py-8 px-8 border border-slate-200/60 dark:border-slate-800/60 bg-white/40 dark:bg-slate-900/40 backdrop-blur-md rounded-2xl shadow-[0_10px_40px_rgba(15,23,42,0.04)]">
             <div className="flex flex-col gap-2">
                <span className="text-[11px] font-black text-slate-400 uppercase tracking-widest">LOCATION</span>
                <div className="flex items-center gap-2 text-slate-900 dark:text-slate-200 font-black text-lg">
                   <MapPinIcon className="w-6 h-6 text-blue-600" />
                   {getLocalText(conference.venue)}
                </div>
             </div>
             <div className="hidden sm:block w-px bg-slate-200/60 dark:bg-slate-800/60"></div>
             <div className="flex flex-col gap-2">
                <span className="text-[11px] font-black text-slate-400 uppercase tracking-widest">ORGANIZER</span>
                <div className="flex items-center gap-2 text-slate-900 dark:text-slate-200 font-black text-lg">
                   <UserGroupIcon className="w-6 h-6 text-blue-600" />
                   {conference.organizer}
                </div>
             </div>
          </div>
        </header>

        {/* Publications Grid */}
        <section className="space-y-10 animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
           <div className="flex items-center justify-between">
              <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">발간된 리츠 자료</h2>
              <span className="text-slate-400 font-bold text-sm">{publications.length} 개의 간행물</span>
           </div>

           {publications.length === 0 ? (
             <div className="bg-white dark:bg-slate-900 rounded-2xl p-20 text-center border-2 border-dashed border-slate-200 dark:border-slate-800">
                <DocumentTextIcon className="w-16 h-16 text-slate-200 dark:text-slate-800 mx-auto mb-4" />
                <p className="text-slate-400 font-bold">등록된 간행물이 없습니다.</p>
             </div>
           ) : (
             <div className="grid grid-cols-1 gap-8">
                {publications.map((pub) => (
                  <PublicationCard 
                    key={pub.id} 
                    publication={pub} 
                    formatDate={formatDate} 
                    getLocalText={getLocalText}
                    getPublicationTypeLabel={getPublicationTypeLabel}
                  />
                ))}
             </div>
           )}
        </section>
      </main>

      {/* Modern Footer with Hongcom Info */}
      <footer className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 py-16 px-6">
        <div className="max-w-5xl mx-auto">
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

export default ConferenceDetail;
import React, { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, query, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import PublicationManagement from './PublicationManagement';
import { Conference, BilingualValue } from '@/types/content';
import { useBrandingStore } from '@/stores/brandingStore';
import { showToast } from '@/components/common/Toast';
import BilingualInput from '@/components/common/BilingualInput';
import {
  PlusIcon,
  PencilIcon,
  TrashIcon,
  CalendarIcon,
  MapPinIcon,
  UserGroupIcon,
  XMarkIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  RectangleStackIcon,
  BookOpenIcon,
  ArrowRightOnRectangleIcon
} from '@heroicons/react/24/outline';

export const ConferenceManagement: React.FC = () => {
  const setBranding = useBrandingStore((state) => state.setBranding);
  const [conferences, setConferences] = useState<Conference[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingConference, setEditingConference] = useState<Conference | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [selectedConferenceId, setSelectedConferenceId] = useState<string | null>(null);

  useEffect(() => {
    loadConferences();
  }, []);

  const loadConferences = async () => {
    try {
      setLoading(true);
      const q = query(
        collection(db, 'conferences'),
        orderBy('startDate', 'desc')
      );
      const snapshot = await getDocs(q);
      const conferencesData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as Conference));
      setConferences(conferencesData);
    } catch (error) {
      console.error('Failed to load conferences:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (conference: Omit<Conference, 'id' | 'createdAt' | 'updatedAt'>) => {
    try {
      await addDoc(collection(db, 'conferences'), {
        ...conference,
        createdAt: new Date(),
        updatedAt: new Date()
      });
      await loadConferences();
      setShowForm(false);
      showToast('새 프로젝트가 등록되었습니다.', 'success');
    } catch (error) {
      console.error('Failed to create conference:', error);
      showToast('학술대회 생성에 실패했습니다.', 'error');
    }
  };

  const handleUpdate = async (id: string, updates: Partial<Conference>) => {
    try {
      const docRef = doc(db, 'conferences', id);
      await updateDoc(docRef, {
        ...updates,
        updatedAt: new Date()
      });
      if (updates.branding) {
        setBranding(updates.branding);
      }
      await loadConferences();
      setEditingConference(null);
      showToast('프로젝트 정보가 수정되었습니다.', 'success');
    } catch (error) {
      console.error('Failed to update conference:', error);
      showToast('학술대회 업데이트에 실패했습니다.', 'error');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('정말로 이 학술대회를 삭제하시겠습니까?')) return;

    try {
      await deleteDoc(doc(db, 'conferences', id));
      await loadConferences();
      showToast('프로젝트가 삭제되었습니다.', 'success');
    } catch (error) {
      console.error('Failed to delete conference:', error);
      showToast('학술대회 삭제에 실패했습니다.', 'error');
    }
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const getLocalName = (name: BilingualValue): string => {
    if (!name) return '';
    return typeof name === 'string' ? name : name.ko || name.en || '';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50 dark:bg-slate-950">
        <div className="relative">
          <div className="animate-spin rounded-full h-16 w-16 border-4 border-brand-primary/20 border-t-brand-primary"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-gray-50 dark:bg-slate-950">
      {/* 사이드바 */}
      <aside className="w-72 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 flex flex-col fixed h-full z-30">
        <div className="p-8">
          <div className="flex items-center gap-3 mb-10">
            <div className="w-10 h-10 bg-brand-primary rounded-xl flex items-center justify-center text-white shadow-lg shadow-brand-primary/20">
              <span className="font-black text-xl">E</span>
            </div>
            <span className="font-black text-xl tracking-tighter text-gray-900 dark:text-white uppercase">Admin</span>
          </div>

          <button
            onClick={() => setShowForm(true)}
            className="w-full flex items-center justify-center gap-2 px-6 py-4 bg-gradient-to-r from-brand-primary to-brand-secondary hover:from-brand-primary-hover hover:to-brand-secondary text-white rounded-2xl font-bold transition-all shadow-lg shadow-brand-primary/20 hover:shadow-brand-primary/30 mb-8 active:scale-95"
          >
            <PlusIcon className="w-5 h-5" strokeWidth={2.5} />
            새 프로젝트 추가
          </button>

          <nav className="space-y-1">
            <button
              onClick={() => setSelectedConferenceId(null)}
              className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl font-bold transition-all ${
                !selectedConferenceId 
                  ? 'bg-brand-primary/10 text-brand-primary' 
                  : 'text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800'
              }`}
            >
              <RectangleStackIcon className="w-5 h-5" />
              학술대회 목록
            </button>
            {selectedConferenceId && (
              <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-800 space-y-1">
                <div className="px-4 py-2 text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">
                  Managing Project
                </div>
                <div className="px-4 py-3 bg-gray-50 dark:bg-gray-800/50 rounded-xl mb-2">
                  <p className="text-sm font-bold text-gray-900 dark:text-gray-100 truncate">
                    {getLocalName(conferences.find(c => c.id === selectedConferenceId)?.name || {ko: '', en: ''})}
                  </p>
                </div>
                <button
                  className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl font-bold text-brand-primary bg-brand-primary/5"
                >
                  <BookOpenIcon className="w-5 h-5" />
                  간행물 관리
                </button>
              </div>
            )}
          </nav>
        </div>

        <div className="mt-auto p-8 border-t border-gray-100 dark:border-gray-800">
          <button 
            onClick={() => window.location.href = '/'}
            className="w-full flex items-center gap-3 px-4 py-3 text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors font-bold text-sm"
          >
            <ArrowRightOnRectangleIcon className="w-5 h-5" />
            서비스 나가기
          </button>
        </div>
      </aside>

      {/* 메인 콘텐츠 */}
      <main className="flex-1 ml-72 p-8 lg:p-12">
        <div className="max-w-6xl mx-auto">
          {selectedConferenceId ? (
            <div className="space-y-8 animate-fade-in-up">
              <header>
                <h2 className="text-4xl font-black text-gray-900 dark:text-white tracking-tight">
                  간행물 관리
                </h2>
                <p className="text-gray-500 dark:text-gray-400 mt-2 font-medium">
                  {getLocalName(conferences.find(c => c.id === selectedConferenceId)?.name || {ko: '', en: ''})} 학회의 모든 자료를 편집합니다.
                </p>
              </header>
              <PublicationManagement 
                conferenceId={selectedConferenceId} 
                onBack={() => setSelectedConferenceId(null)}
              />
            </div>
          ) : (
            <div className="space-y-10 animate-fade-in-up">
              <header>
                <h2 className="text-4xl font-black text-gray-900 dark:text-white tracking-tight">
                  프로젝트 대시보드
                </h2>
                <p className="text-gray-500 dark:text-gray-400 mt-2 font-medium">
                  현재 운영 중인 전체 학술대회 정보를 조회하고 편집할 수 있습니다.
                </p>
              </header>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
                {conferences.map((conference) => (
                  <div
                    key={conference.id}
                    onClick={() => setSelectedConferenceId(conference.id)}
                    className="group relative bg-white dark:bg-gray-900 rounded-[2.5rem] border border-gray-100 dark:border-gray-800 overflow-hidden card-hover cursor-pointer p-8 flex flex-col h-full shadow-sm hover:shadow-xl hover:shadow-gray-200/50 dark:hover:shadow-black/50 transition-all duration-300"
                  >
                    <div className="flex justify-between items-start mb-6">
                      <div className="w-14 h-14 rounded-2xl bg-gray-50 dark:bg-gray-800 flex items-center justify-center text-brand-primary group-hover:bg-brand-primary group-hover:text-white transition-all duration-300">
                        <CalendarIcon className="w-7 h-7" />
                      </div>
                      <div className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest ${
                        conference.status === 'published'
                          ? 'bg-green-100 text-green-700 dark:bg-green-500/10 dark:text-green-400'
                          : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-500/10 dark:text-yellow-400'
                      }`}>
                        {conference.status === 'published' ? 'Published' : 'Draft'}
                      </div>
                    </div>

                    <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-2 line-clamp-2 leading-tight">
                      {getLocalName(conference.name)}
                    </h3>
                    <p className="text-sm text-gray-500 dark:text-gray-500 mb-6 font-medium">
                      {formatDate(conference.startDate)} ~ {formatDate(conference.endDate)}
                    </p>

                    <div className="mt-auto flex items-center justify-between pt-6 border-t border-gray-50 dark:border-gray-800">
                      <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Managing</span>
                      <div className="flex gap-2" onClick={e => e.stopPropagation()}>
                        <button
                          onClick={() => setEditingConference(conference)}
                          className="p-3 text-gray-400 hover:text-brand-primary hover:bg-brand-primary/10 rounded-xl transition-all"
                        >
                          <PencilIcon className="w-5 h-5" />
                        </button>
                        <button
                          onClick={() => handleDelete(conference.id)}
                          className="p-3 text-gray-400 hover:text-red-500 hover:bg-red-500/10 rounded-xl transition-all"
                        >
                          <TrashIcon className="w-5 h-5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>

      {(showForm || editingConference) && (
        <ConferenceForm
          conference={editingConference}
          onSubmit={editingConference ? (data) => handleUpdate(editingConference.id!, data) : handleCreate}
          onClose={() => {
            setShowForm(false);
            setEditingConference(null);
          }}
        />
      )}
    </div>
  );
};

interface ConferenceFormProps {
  conference?: Conference | null;
  onSubmit: (data: Omit<Conference, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  onClose: () => void;
}

const ConferenceForm: React.FC<ConferenceFormProps> = ({ conference, onSubmit, onClose }) => {
  const [formData, setFormData] = useState({
    name: { ko: '', en: '' } as BilingualValue,
    startDate: '',
    endDate: '',
    venue: { ko: '', en: '' } as BilingualValue,
    status: 'published' as 'draft' | 'published',
    description: { ko: '', en: '' } as BilingualValue,
    organizer: '',
    branding: {
      primaryColor: '#3b82f6',
      secondaryColor: '#8b5cf6'
    }
  });

  useEffect(() => {
    if (conference) {
      setFormData({
        name: conference.name,
        startDate: conference.startDate,
        endDate: conference.endDate,
        venue: conference.venue,
        status: conference.status,
        description: conference.description || { ko: '', en: '' },
        organizer: conference.organizer || '',
        branding: {
          primaryColor: conference.branding?.primaryColor || '#3b82f6',
          secondaryColor: conference.branding?.secondaryColor || '#8b5cf6'
        }
      });
    }
  }, [conference]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSubmit(formData as Omit<Conference, 'id' | 'createdAt'>);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-gray-900/40 dark:bg-black/80 backdrop-blur-sm p-4 sm:p-6 animate-fade-in">
      <div className="bg-white dark:bg-gray-900 shadow-2xl w-full max-w-xl rounded-[2.5rem] overflow-hidden border border-white/20 dark:border-white/5 animate-fade-in-up transform transition-all">
        <div className="bg-white/90 dark:bg-gray-900/90 backdrop-blur-xl border-b border-gray-100 dark:border-gray-800 px-8 py-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-brand-primary/10 to-brand-secondary/10 flex items-center justify-center text-brand-primary shadow-inner shrink-0">
              <PencilIcon className="w-6 h-6 outline-none" />
            </div>
            <div>
              <h3 className="text-2xl font-black text-gray-900 dark:text-white tracking-tight leading-tight">
                {conference ? '프로젝트 편집' : '새 프로젝트 등록'}
              </h3>
              <p className="text-[11px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mt-1">
                Project details
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-3 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-2xl transition-all duration-200 group">
            <XMarkIcon className="w-6 h-6 text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-200" />
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto scrollbar-hide">
          <form id="conference-form" onSubmit={handleSubmit} className="p-8 space-y-8">
            <BilingualInput
              label="프로젝트/행사 명칭"
              value={formData.name}
              onChange={(value) => setFormData({ ...formData, name: value })}
              placeholder={{ ko: '예: 2024년 정기 학술대회', en: 'Example: 2024 Annual Conference' }}
              required
            />
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-[11px] font-black text-gray-400 uppercase tracking-widest">시작일</label>
                <input
                  type="date"
                  value={formData.startDate}
                  onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                  required
                  className="w-full px-4 py-3 bg-gray-50/50 dark:bg-gray-800/50 border border-transparent focus:border-brand-primary rounded-xl transition-all outline-none text-sm text-gray-900 dark:text-white"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[11px] font-black text-gray-400 uppercase tracking-widest">종료일</label>
                <input
                  type="date"
                  value={formData.endDate}
                  onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                  required
                  min={formData.startDate}
                  className="w-full px-4 py-3 bg-gray-50/50 dark:bg-gray-800/50 border border-transparent focus:border-brand-primary rounded-xl transition-all outline-none text-sm text-gray-900 dark:text-white"
                />
              </div>
            </div>
            <BilingualInput
              label="개최 장소"
              value={formData.venue}
              onChange={(value) => setFormData({ ...formData, venue: value })}
              placeholder={{ ko: '예: 서울 코엑스', en: 'Example: COEX, Seoul' }}
            />
          </form>
        </div>
        
        <div className="bg-gray-50/50 dark:bg-gray-800/50 border-t border-gray-100 dark:border-gray-800 p-6 sm:px-8">
          <div className="flex gap-4">
            <button onClick={onClose} type="button" className="px-6 py-4 text-gray-400 dark:text-gray-500 font-bold hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
              취소
            </button>
            <button
              type="submit"
              form="conference-form"
              className="flex-1 px-8 py-4 bg-gradient-to-r from-brand-primary to-brand-secondary hover:from-brand-primary-hover hover:to-brand-secondary text-white rounded-2xl font-black text-lg transition-all duration-200 shadow-xl shadow-brand-primary/20 active:scale-[0.98] transform hover:-translate-y-1"
            >
              {conference ? '수정 완료' : '등록'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
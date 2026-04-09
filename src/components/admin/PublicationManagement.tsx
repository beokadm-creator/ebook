import React, { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, updateDoc, doc, query, orderBy, writeBatch } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Publication, Conference, BilingualValue } from '@/types/content';
import { showToast } from '@/components/common/Toast';
import BilingualInput from '@/components/common/BilingualInput';
import {
  PlusIcon,
  PencilIcon,
  TrashIcon,
  BookOpenIcon,
  XMarkIcon,
  BuildingOfficeIcon,
  TagIcon,
  DocumentTextIcon,
  PhotoIcon,
  PresentationChartBarIcon,
  CloudArrowUpIcon,
  LinkIcon,
  ArrowTopRightOnSquareIcon,
  RectangleStackIcon
} from '@heroicons/react/24/outline';

interface PublicationManagementProps {
  conferenceId?: string | null;
  onBack?: () => void;
}

const PublicationManagement: React.FC<PublicationManagementProps> = ({ conferenceId }) => {
  const [publications, setPublications] = useState<Publication[]>([]);
  const [conferences, setConferences] = useState<Conference[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingPublication, setEditingPublication] = useState<Publication | null>(null);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    loadData();
  }, [conferenceId]);

  const loadData = async () => {
    try {
      setLoading(true);
      // Fetch Conferences for selection
      const confSnapshot = await getDocs(query(collection(db, 'conferences'), orderBy('startDate', 'desc')));
      const confData = confSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Conference));
      setConferences(confData);

      // Fetch Publications
      let q = query(collection(db, 'publications'), orderBy('createdAt', 'desc'));
      const pubSnapshot = await getDocs(q);
      let pubData = pubSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Publication));
      
      // Filter if conferenceId is provided
      if (conferenceId) {
        pubData = pubData.filter(p => p.conferenceId === conferenceId);
      }
      
      setPublications(pubData);
    } catch (error) {
      console.error('Failed to load data:', error);
      showToast('데이터 로드에 실패했습니다.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (data: Omit<Publication, 'id' | 'createdAt'>) => {
    try {
      await addDoc(collection(db, 'publications'), {
        ...data,
        createdAt: new Date(),
        publishedAt: data.status === 'published' ? new Date() : null
      });
      await loadData();
      setShowForm(false);
      showToast('간행물이 생성되었습니다.', 'success');
    } catch (error) {
      console.error('Failed to create:', error);
      showToast('간행물 생성에 실패했습니다.', 'error');
    }
  };

  const handleUpdate = async (id: string, updates: Partial<Publication>) => {
    try {
      const docRef = doc(db, 'publications', id);
      const finalUpdates = { ...updates };
      if (updates.status === 'published' && !editingPublication?.publishedAt) {
        finalUpdates.publishedAt = new Date();
      }
      
      await updateDoc(docRef, finalUpdates);
      await loadData();
      setEditingPublication(null);
      showToast('간행물이 업데이트되었습니다.', 'success');
    } catch (error) {
      console.error('Failed to update:', error);
      showToast('업데이트에 실패했습니다.', 'error');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('정말로 이 간행물을 삭제하시겠습니까? 연결된 문서 정보가 모두 사라집니다.')) return;
    try {
      const editorDocs = await getDocs(collection(db, 'publications', id, 'editor'));
      const editorPages = await getDocs(collection(db, 'publications', id, 'editorPages'));
      const editorAssets = await getDocs(collection(db, 'publications', id, 'editorAssets'));
      const batch = writeBatch(db);

      editorDocs.docs.forEach((item) => batch.delete(item.ref));
      editorPages.docs.forEach((item) => batch.delete(item.ref));
      editorAssets.docs.forEach((item) => batch.delete(item.ref));
      batch.delete(doc(db, 'publications', id));
      await batch.commit();

      await loadData();
      showToast('간행물이 삭제되었습니다.', 'success');
    } catch (error) {
      console.error('Failed to delete:', error);
      showToast('삭제에 실패했습니다.', 'error');
    }
  };

  const handleCopyLink = (pubId: string) => {
    const url = `${window.location.origin}/viewer/${pubId}`;
    navigator.clipboard.writeText(url);
    showToast('뷰어 주소가 복사되었습니다.', 'success');
  };

  const handleOpenEditor = (pubId: string) => {
    window.location.href = `/editor/${pubId}`;
  };

  const handleOpenStudio = (pubId: string) => {
    window.location.href = `/studio/${pubId}`;
  };

  const handleViewViewer = (pubId: string) => {
    window.location.href = `/viewer/${pubId}`;
  };

  const getLocalValue = (val: BilingualValue | string | undefined): string => {
    if (!val) return '';
    if (typeof val === 'string') return val;
    return val.ko || val.en || '';
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'abstract': return <DocumentTextIcon className="w-5 h-5" />;
      case 'poster': return <PhotoIcon className="w-5 h-5" />;
      case 'presentation': return <PresentationChartBarIcon className="w-5 h-5" />;
      default: return <BookOpenIcon className="w-5 h-5" />;
    }
  };

  const getTypeName = (type: string) => {
    switch (type) {
      case 'abstract': return '초록집';
      case 'poster': return '포스터집';
      case 'presentation': return '발표자료';
      default: return type;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">간행물 관리</h2>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">학술대회별 초록집, 포스터, 발표자료를 관리합니다.</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-6 py-3 bg-brand-primary hover:bg-brand-primary-hover text-white rounded-xl font-bold transition-all shadow-lg shadow-brand-primary/20"
        >
          <PlusIcon className="w-5 h-5" />
          새 간행물
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {publications.map((pub) => {
          const conference = conferences.find(c => c.id === pub.conferenceId);
          return (
            <div
              key={pub.id}
              className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-100 dark:border-gray-700 overflow-hidden hover:border-brand-primary transition-all group"
            >
              <div className={`px-4 py-2 flex items-center justify-between ${
                pub.status === 'published' ? 'bg-green-50 text-green-700' : 'bg-yellow-50 text-yellow-700'
              }`}>
                <span className="text-xs font-black uppercase tracking-widest">
                  {pub.status === 'published' ? '공개됨' : '임시저장'}
                </span>
                <div className="flex items-center gap-1 text-xs font-bold">
                  {getTypeIcon(pub.type)}
                  {getTypeName(pub.type)}
                </div>
              </div>

              <div className="p-6">
                <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2 line-clamp-2 min-h-[3.5rem]">
                  {getLocalValue(pub.title)}
                </h3>

                <div className="space-y-3 mb-6">
                  <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                    <BuildingOfficeIcon className="w-4 h-4 text-brand-primary" />
                    <span className="truncate">{conference ? getLocalValue(conference.name) : '알 수 없는 학술대회'}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                    <TagIcon className="w-4 h-4 text-brand-primary" />
                    <span>콘텐츠 유형: {getTypeName(pub.type)}</span>
                  </div>
                </div>

                {/* 주요 액션 버튼들 */}
                <div className="grid grid-cols-3 gap-2 mb-4">
                  <button
                    onClick={() => handleOpenStudio(pub.id!)}
                    className="flex items-center justify-center gap-2 px-3 py-3 bg-slate-50 dark:bg-slate-700/60 text-slate-700 dark:text-slate-200 rounded-xl font-bold hover:bg-slate-900 hover:text-white transition-all text-sm"
                  >
                    <RectangleStackIcon className="w-5 h-5" />
                    마스터
                  </button>
                  <button
                    onClick={() => handleOpenEditor(pub.id!)}
                    className="flex items-center justify-center gap-2 px-3 py-3 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-xl font-bold hover:bg-blue-600 hover:text-white transition-all text-sm"
                  >
                    <CloudArrowUpIcon className="w-5 h-5" />
                    출판 편집
                  </button>
                  <button
                    onClick={() => handleViewViewer(pub.id!)}
                    className="flex items-center justify-center gap-2 px-3 py-3 bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400 rounded-xl font-bold hover:bg-purple-600 hover:text-white transition-all text-sm"
                  >
                    <ArrowTopRightOnSquareIcon className="w-5 h-5" />
                    뷰어 보기
                  </button>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => handleCopyLink(pub.id!)}
                    title="주소 복사"
                    className="p-3 bg-gray-50 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-xl hover:bg-gray-200 transition-all"
                  >
                    <LinkIcon className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() => setEditingPublication(pub)}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-gray-50 dark:bg-gray-700 hover:bg-brand-primary hover:text-white text-gray-700 dark:text-gray-200 rounded-xl font-bold transition-all"
                  >
                    <PencilIcon className="w-4 h-4" />
                    정보 수정
                  </button>
                  <button
                    onClick={() => handleDelete(pub.id!)}
                    className="p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-xl hover:bg-red-600 hover:text-white transition-all"
                  >
                    <TrashIcon className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {(showForm || editingPublication) && (
        <PublicationForm
          publication={editingPublication}
          conferences={conferences}
          conferenceId={conferenceId}
          onSubmit={editingPublication ? (data) => handleUpdate(editingPublication.id!, data) : handleCreate}
          onClose={() => {
            setShowForm(false);
            setEditingPublication(null);
          }}
        />
      )}
    </div>
  );
};

interface PublicationFormProps {
  publication?: Publication | null;
  conferences: Conference[];
  conferenceId?: string | null;
  onSubmit: (data: Omit<Publication, 'id' | 'createdAt'>) => Promise<void>;
  onClose: () => void;
}

const PublicationForm: React.FC<PublicationFormProps> = ({ publication, conferences, conferenceId, onSubmit, onClose }) => {
  const [formData, setFormData] = useState({
    title: { ko: '', en: '' } as BilingualValue,
    conferenceId: '',
    type: 'abstract' as Publication['type'],
    status: 'published' as Publication['status'],
    coverImage: ''
  });

  useEffect(() => {
    if (publication) {
      setFormData({
        title: publication.title,
        conferenceId: publication.conferenceId,
        type: publication.type,
        status: publication.status,
        coverImage: publication.coverImage || ''
      });
    } else if (conferenceId) {
      setFormData(prev => ({ ...prev, conferenceId: conferenceId }));
    } else if (conferences.length > 0 && !formData.conferenceId) {
      setFormData(prev => ({ ...prev, conferenceId: conferences[0].id }));
    }
  }, [publication, conferences, conferenceId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.conferenceId) {
      showToast('학술대회를 선택해주세요.', 'error');
      return;
    }
    await onSubmit(formData as Omit<Publication, 'id' | 'createdAt'>);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto border border-gray-100 dark:border-gray-700">
        <div className="sticky top-0 z-10 bg-white/80 dark:bg-gray-800/80 backdrop-blur-md border-b border-gray-100 dark:border-gray-700 px-8 py-6 flex items-center justify-between">
          <div>
            <h3 className="text-2xl font-black text-gray-900 dark:text-gray-100 tracking-tight">
              {publication ? '간행물 수정' : '새 간행물 등록'}
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">간행물 정보를 입력하고 학술대회와 연결하세요.</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-all">
            <XMarkIcon className="w-6 h-6 text-gray-400 hover:text-gray-600" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-8 space-y-6">
          <BilingualInput
            label="간행물 제목"
            value={formData.title}
            onChange={(val) => setFormData({ ...formData, title: val })}
            placeholder={{ ko: '예: 제 65회 대한구강악안면외과학회 초록집', en: 'Example: 65th KAOMS Annual Meeting Abstracts' }}
            required
          />

          {!conferenceId && (
            <div>
              <label className="block text-[11px] font-black text-gray-400 uppercase tracking-widest mb-3">학술대회 선택</label>
              <select
                value={formData.conferenceId}
                onChange={(e) => setFormData({ ...formData, conferenceId: e.target.value })}
                className="w-full px-5 py-4 bg-gray-50/50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-800 focus:border-brand-primary rounded-2xl transition-all text-gray-900 dark:text-white font-medium outline-none"
                required
              >
                <option value="" disabled>학술대회를 선택하세요</option>
                {conferences.map(conf => (
                  <option key={conf.id} value={conf.id}>
                    {conf.name.ko || conf.name.en}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2 uppercase tracking-wider">콘텐츠 유형</label>
              <select
                value={formData.type}
                onChange={(e) => setFormData({ ...formData, type: e.target.value as any })} // eslint-disable-line @typescript-eslint/no-explicit-any
                className="w-full px-5 py-4 bg-gray-50 dark:bg-gray-900 border-2 border-transparent focus:border-brand-primary focus:bg-white dark:focus:bg-gray-950 rounded-2xl transition-all text-gray-900 dark:text-gray-100 font-medium outline-none"
              >
                <option value="abstract">초록집</option>
                <option value="poster">포스터집</option>
                <option value="presentation">발표자료</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2 uppercase tracking-wider">공개 상태</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, status: 'draft' })}
                  className={`flex-1 py-4 rounded-2xl font-bold transition-all ${
                    formData.status === 'draft' ? 'bg-yellow-500 text-white shadow-lg shadow-yellow-500/20' : 'bg-gray-100 dark:bg-gray-700 text-gray-500'
                  }`}
                >
                  임시저장
                </button>
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, status: 'published' })}
                  className={`flex-1 py-4 rounded-2xl font-bold transition-all ${
                    formData.status === 'published' ? 'bg-green-600 text-white shadow-lg shadow-green-600/20' : 'bg-gray-100 dark:bg-gray-700 text-gray-500'
                  }`}
                >
                  게시함
                </button>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2 uppercase tracking-wider">표지 이미지 URL (선택)</label>
            <input
              type="text"
              value={formData.coverImage}
              onChange={(e) => setFormData({ ...formData, coverImage: e.target.value })}
              placeholder="https://example.com/cover.jpg"
              className="w-full px-5 py-4 bg-gray-50 dark:bg-gray-900 border-2 border-transparent focus:border-brand-primary focus:bg-white dark:focus:bg-gray-950 rounded-2xl transition-all text-gray-900 dark:text-gray-100 font-medium outline-none"
            />
          </div>

          <div className="flex gap-4 pt-4">
            <button
              type="submit"
              className="flex-1 px-8 py-5 bg-brand-primary hover:bg-brand-primary-hover text-white rounded-2xl font-black text-lg transition-all shadow-xl shadow-brand-primary/20 active:scale-[0.98]"
            >
              {publication ? '수정 완료' : '간행물 등록하기'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-8 py-5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-2xl font-bold hover:bg-gray-200 transition-all"
            >
              취소
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default PublicationManagement;

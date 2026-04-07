import React, { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, query, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';
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
  XMarkIcon
} from '@heroicons/react/24/outline';

export const ConferenceManagement: React.FC = () => {
  const setBranding = useBrandingStore((state) => state.setBranding);
  const [conferences, setConferences] = useState<Conference[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingConference, setEditingConference] = useState<Conference | null>(null);
  const [showForm, setShowForm] = useState(false);

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
      // 브랜딩이 포함된 경우 brandingStore에도 적용하여 CSS 변수 업데이트
      if (updates.branding) {
        setBranding(updates.branding);
      }
      await loadConferences();
      setEditingConference(null);
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
    } catch (error) {
      console.error('Failed to delete conference:', error);
      showToast('학술대회 삭제에 실패했습니다.', 'error');
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const getLocalName = (name: BilingualValue): string => {
    return typeof name === 'string' ? name : name.ko || name.en || '';
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
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          학술대회 관리
        </h2>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-6 py-3 bg-brand-primary hover:bg-brand-primary-hover text-white rounded-xl font-medium transition-colors"
        >
          <PlusIcon className="w-5 h-5" />
          새 학술대회
        </button>
      </div>

      {/* 학술대회 리스트 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {conferences.map((conference) => (
          <div
            key={conference.id}
            className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700 overflow-hidden hover:border-brand-primary transition-colors"
          >
            {/* 상태 뱃지 */}
            <div className={`px-4 py-2 ${
              conference.status === 'published'
                ? 'bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-400'
                : 'bg-yellow-100 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400'
            }`}>
              <span className="text-sm font-bold">
                {conference.status === 'published' ? '게시됨' : '임시저장'}
              </span>
            </div>

            <div className="p-6">
              {/* 학술대회명 */}
              <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-3">
                {getLocalName(conference.name)}
              </h3>

              {/* 메타 정보 */}
              <div className="space-y-2 mb-4">
                <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                  <CalendarIcon className="w-4 h-4" />
                  <span>{formatDate(conference.startDate)} ~ {formatDate(conference.endDate)}</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                  <MapPinIcon className="w-4 h-4" />
                  <span>{getLocalName(conference.venue)}</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                  <UserGroupIcon className="w-4 h-4" />
                  <span>{conference.organizer}</span>
                </div>
              </div>

              {/* 액션 버튼 */}
              <div className="flex gap-2">
                <button
                  onClick={() => setEditingConference(conference)}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-brand-primary hover:bg-brand-primary-hover text-white rounded-xl font-medium transition-colors"
                >
                  <PencilIcon className="w-4 h-4" />
                  편집
                </button>
                <button
                  onClick={() => handleDelete(conference.id)}
                  className="px-4 py-2 bg-red-100 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-xl hover:bg-red-200 dark:hover:bg-red-900/40 transition-colors"
                >
                  <TrashIcon className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* 생성/폼 모달 */}
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

// 학술대회 폼 컴포넌트
interface ConferenceFormProps {
  conference?: Conference | null;
  onSubmit: (data: Omit<Conference, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  onClose: () => void;
}

const ConferenceForm: React.FC<ConferenceFormProps> = ({ conference, onSubmit, onClose }) => {
  const [formData, setFormData] = useState({
    name: { ko: '', en: '' } as BilingualValue,
    description: { ko: '', en: '' } as BilingualValue,
    startDate: '',
    endDate: '',
    venue: { ko: '', en: '' } as BilingualValue,
    organizer: '',
    status: 'draft' as 'draft' | 'published',
    branding: {
      primaryColor: '#3b82f6',
      secondaryColor: '#8b5cf6',
      logoUrl: '',
      eventName: { ko: '', en: '' } as BilingualValue
    }
  });

  useEffect(() => {
    if (conference) {
      setFormData({
        name: conference.name,
        description: conference.description,
        startDate: conference.startDate,
        endDate: conference.endDate,
        venue: conference.venue,
        organizer: conference.organizer,
        status: conference.status,
        branding: {
          primaryColor: conference.branding?.primaryColor || '#3b82f6',
          secondaryColor: conference.branding?.secondaryColor || '#8b5cf6',
          logoUrl: conference.branding?.logoUrl || '',
          eventName: conference.branding?.eventName || { ko: '', en: '' }
        }
      });
    }
  }, [conference]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSubmit(formData as Omit<Conference, 'id' | 'createdAt'>);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto m-4">
        <div className="sticky top-0 bg-white dark:bg-gray-800 border-b-2 border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between">
          <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100">
            {conference ? '학술대회 편집' : '새 학술대회'}
          </h3>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <XMarkIcon className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* 학술대회명 */}
          <BilingualInput
            label="학술대회명"
            value={formData.name}
            onChange={(value) => setFormData({ ...formData, name: value })}
            placeholder={{
              ko: '예: 2024년 대한치과학회 춘계학술대회',
              en: 'Example: 2024 Korean Academy of Dental Science Spring Conference'
            }}
            required
          />

          {/* 설명 */}
          <BilingualInput
            label="설명"
            value={formData.description}
            onChange={(value) => setFormData({ ...formData, description: value })}
            placeholder={{
              ko: '학술대회에 대한 설명을 입력하세요...',
              en: 'Enter conference description...'
            }}
            required
            multiline
            rows={3}
          />

          {/* 날짜 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-base font-bold text-gray-900 dark:text-gray-100 mb-2">
                시작일 <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={formData.startDate}
                onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                required
                className="w-full px-4 py-3 bg-white dark:bg-gray-900 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-brand-primary focus:ring-2 focus:ring-brand-primary-light focus:outline-none text-gray-900 dark:text-gray-100"
              />
            </div>
            <div>
              <label className="block text-base font-bold text-gray-900 dark:text-gray-100 mb-2">
                종료일 <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={formData.endDate}
                onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                required
                min={formData.startDate}
                className="w-full px-4 py-3 bg-white dark:bg-gray-900 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-brand-primary focus:ring-2 focus:ring-brand-primary-light focus:outline-none text-gray-900 dark:text-gray-100"
              />
            </div>
          </div>

          {/* 장소 */}
          <BilingualInput
            label="장소"
            value={formData.venue}
            onChange={(value) => setFormData({ ...formData, venue: value })}
            placeholder={{
              ko: '예: COEX 그랜드볼룸',
              en: 'Example: COEX Grand Ballroom'
            }}
            required
          />

          {/* 주최 기관 */}
          <div>
            <label className="block text-base font-bold text-gray-900 dark:text-gray-100 mb-2">
              주최 기관 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.organizer}
              onChange={(e) => setFormData({ ...formData, organizer: e.target.value })}
              placeholder="예: 대한치과학회"
              required
              className="w-full px-4 py-3 bg-white dark:bg-gray-900 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-brand-primary focus:ring-2 focus:ring-brand-primary-light focus:outline-none text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
            />
          </div>

          {/* 상태 */}
          <div>
            <label className="block text-base font-bold text-gray-900 dark:text-gray-100 mb-2">
              상태
            </label>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setFormData({ ...formData, status: 'draft' })}
                className={`flex-1 px-4 py-3 rounded-xl font-bold transition-colors ${
                  formData.status === 'draft'
                    ? 'bg-yellow-500 text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
              >
                임시저장
              </button>
              <button
                type="button"
                onClick={() => setFormData({ ...formData, status: 'published' })}
                className={`flex-1 px-4 py-3 rounded-xl font-bold transition-colors ${
                  formData.status === 'published'
                    ? 'bg-green-500 text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
              >
                게시
              </button>
            </div>
          </div>

          {/* 브랜딩 설정 */}
          <div>
            <label className="block text-base font-bold text-gray-900 dark:text-gray-100 mb-3">
              브랜딩 설정
            </label>
            <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-xl border-2 border-gray-200 dark:border-gray-700">
              <div className="space-y-4">
                {/* 기본 색상 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    기본 색상
                  </label>
                  <div className="flex gap-3">
                    <input
                      type="color"
                      value={formData.branding.primaryColor}
                      onChange={(e) => setFormData({
                        ...formData,
                        branding: { ...formData.branding, primaryColor: e.target.value }
                      })}
                      className="w-20 h-12 rounded-lg cursor-pointer border-2 border-gray-200 dark:border-gray-700"
                    />
                    <input
                      type="text"
                      value={formData.branding.primaryColor}
                      onChange={(e) => setFormData({
                        ...formData,
                        branding: { ...formData.branding, primaryColor: e.target.value }
                      })}
                      placeholder="#3b82f6"
                      className="flex-1 px-4 py-3 bg-white dark:bg-gray-900 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-brand-primary focus:outline-none text-gray-900 dark:text-gray-100"
                    />
                  </div>
                </div>

                {/* 보조 색상 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    보조 색상
                  </label>
                  <div className="flex gap-3">
                    <input
                      type="color"
                      value={formData.branding.secondaryColor}
                      onChange={(e) => setFormData({
                        ...formData,
                        branding: { ...formData.branding, secondaryColor: e.target.value }
                      })}
                      className="w-20 h-12 rounded-lg cursor-pointer border-2 border-gray-200 dark:border-gray-700"
                    />
                    <input
                      type="text"
                      value={formData.branding.secondaryColor}
                      onChange={(e) => setFormData({
                        ...formData,
                        branding: { ...formData.branding, secondaryColor: e.target.value }
                      })}
                      placeholder="#8b5cf6"
                      className="flex-1 px-4 py-3 bg-white dark:bg-gray-900 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-brand-primary focus:outline-none text-gray-900 dark:text-gray-100"
                    />
                  </div>
                </div>

                {/* 로고 URL */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    로고 URL
                  </label>
                  <input
                    type="url"
                    value={formData.branding.logoUrl}
                    onChange={(e) => setFormData({
                      ...formData,
                      branding: { ...formData.branding, logoUrl: e.target.value }
                    })}
                    placeholder="https://example.com/logo.png"
                    className="w-full px-4 py-3 bg-white dark:bg-gray-900 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-brand-primary focus:outline-none text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
                  />
                </div>

                {/* 이벤트명 */}
                <BilingualInput
                  label="이벤트명"
                  value={formData.branding.eventName}
                  onChange={(value) => setFormData({
                    ...formData,
                    branding: { ...formData.branding, eventName: value }
                  })}
                  placeholder={{
                    ko: '예: 2024년 춘계학술대회',
                    en: 'Example: 2024 Spring Conference'
                  }}
                />
              </div>
            </div>
          </div>

          {/* 버튼 */}
          <div className="flex gap-3 pt-4 border-t-2 border-gray-200 dark:border-gray-700">
            <button
              type="submit"
              className="flex-1 px-6 py-3 bg-brand-primary hover:bg-brand-primary-hover text-white rounded-xl font-bold transition-colors"
            >
              {conference ? '업데이트' : '생성'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-6 py-3 bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-xl font-bold hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
            >
              취소
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
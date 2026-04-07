import React, { useState, useEffect } from 'react';
import {
  collection,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  query,
  orderBy,
  Timestamp
} from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { showToast } from '@/components/common/Toast';
import {
  PhotoIcon,
  TrashIcon,
  PencilIcon,
  PlusIcon
} from '@heroicons/react/24/outline';

interface Ad {
  id: string;
  title: string;
  imageUrl: string;
  targetUrl: string;
  position: 'header' | 'sidebar' | 'interstitial' | 'footer';
  status: 'active' | 'inactive';
  impressions: number;
  clicks: number;
  startDate: Date;
  endDate?: Date;
  createdAt: Date;
}

export default function AdManagement() {
  const [ads, setAds] = useState<Ad[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingAd, setEditingAd] = useState<Ad | null>(null);
  const [formData, setFormData] = useState<{
    title: string;
    imageUrl: string;
    targetUrl: string;
    position: 'header' | 'sidebar' | 'interstitial' | 'footer';
    status: 'active' | 'inactive';
    startDate: string;
    endDate: string;
  }>({
    title: '',
    imageUrl: '',
    targetUrl: '',
    position: 'sidebar',
    status: 'active',
    startDate: new Date().toISOString().split('T')[0],
    endDate: ''
  });

  useEffect(() => {
    loadAds();
  }, []);

  const loadAds = async () => {
    try {
      setLoading(true);
      const adsQuery = query(
        collection(db, 'advertisements'),
        orderBy('createdAt', 'desc')
      );
      const snapshot = await getDocs(adsQuery);
      const adsData = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          title: data.title || '',
          imageUrl: data.imageUrl || '',
          targetUrl: data.targetUrl || '',
          position: data.position || 'sidebar',
          status: data.status || 'inactive',
          impressions: data.impressions || 0,
          clicks: data.clicks || 0,
          startDate: data.startDate?.toDate() || new Date(),
          endDate: data.endDate?.toDate(),
          createdAt: data.createdAt?.toDate() || new Date()
        } as Ad;
      });
      setAds(adsData);
    } catch (error) {
      console.error('Failed to load ads:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const adData = {
        title: formData.title,
        imageUrl: formData.imageUrl,
        targetUrl: formData.targetUrl,
        position: formData.position,
        status: formData.status,
        impressions: 0,
        clicks: 0,
        startDate: Timestamp.fromDate(new Date(formData.startDate)),
        endDate: formData.endDate ? Timestamp.fromDate(new Date(formData.endDate)) : null,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now()
      };

      if (editingAd) {
        await updateDoc(doc(db, 'advertisements', editingAd.id), {
          ...adData,
          impressions: editingAd.impressions,
          clicks: editingAd.clicks
        });
      } else {
        await addDoc(collection(db, 'advertisements'), adData);
      }

      await loadAds();
      handleCloseModal();
    } catch (error) {
      console.error('Failed to save ad:', error);
      showToast('광고 저장에 실패했습니다.', 'error');
    }
  };

  const handleDelete = async (adId: string) => {
    if (!confirm('이 광고를 삭제하시겠습니까?')) return;

    try {
      await deleteDoc(doc(db, 'advertisements', adId));
      await loadAds();
    } catch (error) {
      console.error('Failed to delete ad:', error);
      showToast('광고 삭제에 실패했습니다.', 'error');
    }
  };

  const handleEdit = (ad: Ad) => {
    setEditingAd(ad);
    setFormData({
      title: ad.title,
      imageUrl: ad.imageUrl,
      targetUrl: ad.targetUrl,
      position: ad.position,
      status: ad.status,
      startDate: ad.startDate.toISOString().split('T')[0],
      endDate: ad.endDate ? ad.endDate.toISOString().split('T')[0] : ''
    });
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingAd(null);
    setFormData({
      title: '',
      imageUrl: '',
      targetUrl: '',
      position: 'sidebar',
      status: 'active',
      startDate: new Date().toISOString().split('T')[0],
      endDate: ''
    });
  };

  const getPositionLabel = (position: string) => {
    const labels = {
      header: '헤더',
      sidebar: '사이드바',
      interstitial: '전면 광고',
      footer: '푸터'
    };
    return labels[position as keyof typeof labels] || position;
  };

  const getCTR = (ad: Ad) => {
    if (ad.impressions === 0) return '0.00%';
    return ((ad.clicks / ad.impressions) * 100).toFixed(2) + '%';
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
          광고 관리
        </h2>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
        >
          <PlusIcon className="w-5 h-5" />
          새 광고
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      ) : ads.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 dark:bg-gray-900 rounded-lg">
          <PhotoIcon className="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
          <p className="text-gray-500 dark:text-gray-400">
            등록된 광고가 없습니다.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {ads.map((ad) => (
            <div
              key={ad.id}
              className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4"
            >
              <div className="flex items-start gap-4">
                <img
                  src={ad.imageUrl}
                  alt={ad.title}
                  className="w-32 h-24 object-cover rounded"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h3 className="font-medium text-gray-900 dark:text-gray-100">
                        {ad.title}
                      </h3>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {getPositionLabel(ad.position)}
                      </p>
                    </div>
                    <span className={`px-2 py-1 text-xs font-medium rounded ${
                      ad.status === 'active'
                        ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                        : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                    }`}>
                      {ad.status === 'active' ? '활성' : '비활성'}
                    </span>
                  </div>

                  <div className="grid grid-cols-4 gap-4 mb-3">
                    <div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">노출수</p>
                      <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                        {ad.impressions.toLocaleString()}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">클릭수</p>
                      <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                        {ad.clicks.toLocaleString()}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">CTR</p>
                      <p className="text-lg font-semibold text-blue-600">
                        {getCTR(ad)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">기간</p>
                      <p className="text-sm text-gray-900 dark:text-gray-100">
                        {ad.startDate.toLocaleDateString('ko-KR')}
                        {ad.endDate && ` ~ ${ad.endDate.toLocaleDateString('ko-KR')}`}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleEdit(ad)}
                      className="p-2 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors"
                    >
                      <PencilIcon className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(ad.id)}
                      className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                    >
                      <TrashIcon className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 모달 */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-6">
                {editingAd ? '광고 수정' : '새 광고'}
              </h3>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    광고 제목
                  </label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    이미지 URL
                  </label>
                  <input
                    type="url"
                    value={formData.imageUrl}
                    onChange={(e) => setFormData({ ...formData, imageUrl: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    클릭 시 이동 URL
                  </label>
                  <input
                    type="url"
                    value={formData.targetUrl}
                    onChange={(e) => setFormData({ ...formData, targetUrl: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    광고 위치
                  </label>
                  <select
                    value={formData.position}
                    onChange={(e) => setFormData({ ...formData, position: e.target.value as 'header' | 'sidebar' | 'interstitial' | 'footer' })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                  >
                    <option value="header">헤더</option>
                    <option value="sidebar">사이드바</option>
                    <option value="interstitial">전면 광고</option>
                    <option value="footer">푸터</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    상태
                  </label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value as 'active' | 'inactive' })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                  >
                    <option value="active">활성</option>
                    <option value="inactive">비활성</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      시작일
                    </label>
                    <input
                      type="date"
                      value={formData.startDate}
                      onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      종료일 (선택)
                    </label>
                    <input
                      type="date"
                      value={formData.endDate}
                      onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
                  <button
                    type="button"
                    onClick={handleCloseModal}
                    className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                  >
                    취소
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                  >
                    {editingAd ? '수정' : '생성'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
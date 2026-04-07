import React, { useState } from 'react';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { doc, updateDoc } from 'firebase/firestore';
import { storage, db } from '@/lib/firebase';
import { Conference, ConferenceBranding, BilingualValue } from '@/types/content';
import { showToast } from '@/components/common/Toast';
import { useI18nStore } from '@/stores/i18nStore';
import {
  PhotoIcon,
  XMarkIcon,
  CheckIcon,
  PaintBrushIcon
} from '@heroicons/react/24/outline';

interface BrandSettingsProps {
  conference: Conference;
  onUpdate?: () => void;
  onClose?: () => void;
}

const BRANDING_COLORS = [
  { name: '블루', value: '#3b82f6' },
  { name: '퍼플', value: '#8b5cf6' },
  { name: '그린', value: '#10b981' },
  { name: '레드', value: '#ef4444' },
  { name: '오렌지', value: '#f97316' },
  { name: '핑크', value: '#ec4899' },
  { name: '인디고', value: '#6366f1' },
  { name: '티얼', value: '#14b8a6' },
];

const BrandingSettings: React.FC<BrandSettingsProps> = ({
  conference,
  onUpdate,
  onClose
}) => {
  const { language } = useI18nStore();
  const [branding, setBranding] = useState<ConferenceBranding>(
    conference.branding || {}
  );

  const getLocalText = (value: BilingualValue | string | undefined): string => {
    if (!value) return '';
    if (typeof value === 'string') return value;
    return value[language] || value.ko || value.en || '';
  };
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string>(
    conference.branding?.logoUrl || ''
  );
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleLogoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      showToast('로고 이미지는 5MB 이하여야 합니다.', 'error');
      return;
    }

    if (!file.type.startsWith('image/')) {
      showToast('이미지 파일만 업로드 가능합니다.', 'error');
      return;
    }

    setLogoFile(file);
    
    // 프리뷰 생성
    const reader = new FileReader();
    reader.onloadend = () => {
      setLogoPreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const uploadLogo = async (): Promise<string | null> => {
    if (!logoFile) return null;

    try {
      setUploading(true);
      const fileName = `logos/${conference.id}/${Date.now()}_${logoFile.name}`;
      const storageRef = ref(storage, fileName);
      await uploadBytes(storageRef, logoFile);
      const downloadURL = await getDownloadURL(storageRef);
      return downloadURL;
    } catch (error) {
      console.error('로고 업로드 실패:', error);
      showToast('로고 업로드에 실패했습니다.', 'error');
      return null;
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);

      let logoUrl = branding.logoUrl;

      // 새 로고 업로드
      if (logoFile) {
        const uploadedUrl = await uploadLogo();
        if (uploadedUrl) {
          logoUrl = uploadedUrl;
        }
      }

      // 브랜딩 정보 업데이트
      const updatedBranding: ConferenceBranding = {
        ...branding,
        logoUrl,
      };

      await updateDoc(doc(db, 'conferences', conference.id), {
        branding: updatedBranding,
      });

      setBranding(updatedBranding);
      showToast('브랜딩 설정이 저장되었습니다.', 'success');
      onUpdate?.();
      onClose?.();
    } catch (error) {
      console.error('브랜딩 저장 실패:', error);
      showToast('브랜딩 설정 저장에 실패했습니다.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleColorSelect = (color: string) => {
    setBranding({ ...branding, primaryColor: color });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black bg-opacity-50">
      <div className="bg-white dark:bg-gray-800 rounded-t-3xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* 헤더 */}
        <div className="sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-brand-primary-light rounded-xl">
              <PaintBrushIcon className="w-6 h-6 text-brand-primary" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
              브랜딩 설정
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
          >
            <XMarkIcon className="w-6 h-6 text-gray-600 dark:text-gray-400" />
          </button>
        </div>

        <div className="p-6 space-y-8">
          {/* 학술대회 정보 */}
          <div className="bg-gray-50 dark:bg-gray-900 rounded-2xl p-4">
            <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-400 mb-1">
              학술대회
            </h3>
            <p className="text-lg font-bold text-gray-900 dark:text-gray-100">
              {getLocalText(conference.name)}
            </p>
          </div>

          {/* 로고 업로드 */}
          <div>
            <label className="block text-base font-bold text-gray-900 dark:text-gray-100 mb-3">
              로고 이미지
            </label>
            
            {/* 로고 프리뷰 */}
            <div className="mb-4">
              {logoPreview ? (
                <div className="relative bg-white dark:bg-gray-900 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-2xl p-8 flex items-center justify-center">
                  <img
                    src={logoPreview}
                    alt="로고 프리뷰"
                    className="max-h-40 max-w-full object-contain"
                  />
                  <button
                    onClick={() => {
                      setLogoFile(null);
                      setLogoPreview('');
                      setBranding({ ...branding, logoUrl: undefined });
                    }}
                    className="absolute top-2 right-2 p-2 bg-red-100 dark:bg-red-900/20 rounded-full hover:bg-red-200 dark:hover:bg-red-900/40 transition-colors"
                  >
                    <XMarkIcon className="w-5 h-5 text-red-600 dark:text-red-400" />
                  </button>
                </div>
              ) : (
                <label className="flex flex-col items-center justify-center w-full h-40 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-2xl cursor-pointer hover:border-brand-primary dark:hover:border-brand-primary transition-colors bg-white dark:bg-gray-900">
                  <div className="flex flex-col items-center justify-center pt-5 pb-6">
                    <PhotoIcon className="w-12 h-12 text-gray-400 mb-3" />
                    <p className="text-sm text-gray-600 dark:text-gray-400 font-medium">
                      로고 이미지를 업로드하세요
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                      PNG, JPG (최대 5MB)
                    </p>
                  </div>
                  <input
                    type="file"
                    className="hidden"
                    accept="image/png, image/jpeg, image/jpg"
                    onChange={handleLogoSelect}
                  />
                </label>
              )}
            </div>

            {!logoPreview && (
              <label className="flex items-center justify-center w-full px-6 py-4 bg-brand-primary hover:bg-brand-primary-hover text-white rounded-xl font-medium transition-colors cursor-pointer">
                <PhotoIcon className="w-5 h-5 mr-2" />
                로고 선택
                <input
                  type="file"
                  className="hidden"
                  accept="image/png, image/jpeg, image/jpg"
                  onChange={handleLogoSelect}
                />
              </label>
            )}
          </div>

          {/* 포인트 컬러 선택 */}
          <div>
            <label className="block text-base font-bold text-gray-900 dark:text-gray-100 mb-3">
              포인트 컬러
            </label>
            
            {/* 색상 프리뷰 */}
            {branding.primaryColor && (
              <div className="mb-4 p-4 bg-gray-50 dark:bg-gray-900 rounded-xl flex items-center gap-3">
                <div
                  className="w-16 h-16 rounded-xl border-2 border-gray-200 dark:border-gray-700"
                  style={{ backgroundColor: branding.primaryColor }}
                />
                <div>
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                    선택된 색상
                  </p>
                  <p className="text-lg font-mono font-bold text-gray-900 dark:text-gray-100">
                    {branding.primaryColor}
                  </p>
                </div>
              </div>
            )}

            {/* 색상 팔레트 */}
            <div className="grid grid-cols-4 gap-3">
              {BRANDING_COLORS.map((color) => (
                <button
                  key={color.value}
                  onClick={() => handleColorSelect(color.value)}
                  className={`relative p-4 rounded-xl border-2 transition-all ${
                    branding.primaryColor === color.value
                      ? 'border-brand-primary ring-2 ring-brand-primary-light'
                      : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                  }`}
                  style={{ backgroundColor: color.value }}
                  aria-label={color.name}
                >
                  {branding.primaryColor === color.value && (
                    <div className="absolute top-1 right-1">
                      <div className="bg-white rounded-full p-1 shadow-md">
                        <CheckIcon className="w-4 h-4 text-gray-900" />
                      </div>
                    </div>
                  )}
                </button>
              ))}
            </div>

            {/* 커스텀 컬러 입력 */}
            <div className="mt-4 flex items-center gap-3">
              <input
                type="color"
                value={branding.primaryColor || '#3b82f6'}
                onChange={(e) => handleColorSelect(e.target.value)}
                className="w-16 h-16 rounded-xl cursor-pointer border-2 border-gray-200 dark:border-gray-700"
              />
              <input
                type="text"
                value={branding.primaryColor || '#3b82f6'}
                onChange={(e) => handleColorSelect(e.target.value)}
                placeholder="#3b82f6"
                className="flex-1 px-4 py-3 bg-white dark:bg-gray-900 border-2 border-gray-200 dark:border-gray-700 rounded-xl font-mono text-lg font-bold text-gray-900 dark:text-gray-100 focus:border-brand-primary focus:outline-none"
                pattern="^#[0-9A-Fa-f]{6}$"
              />
            </div>
          </div>

          {/* 미리보기 섹션 */}
          <div className="bg-gray-50 dark:bg-gray-900 rounded-2xl p-6">
            <h4 className="text-base font-bold text-gray-900 dark:text-gray-100 mb-4">
              미리보기
            </h4>
            
            <div className="space-y-4">
              {/* 버튼 미리보기 */}
              <button
                className="w-full py-4 text-white rounded-xl font-bold text-lg"
                style={{ backgroundColor: branding.primaryColor || '#3b82f6' }}
              >
                기본 버튼 스타일
              </button>

              {/* 뱃지 미리보기 */}
              <div className="flex items-center gap-2">
                <div
                  className="px-4 py-2 rounded-full text-white text-sm font-medium"
                  style={{ backgroundColor: branding.primaryColor || '#3b82f6' }}
                >
                  뱃지
                </div>
                <div
                  className="px-4 py-2 rounded-full text-white text-sm font-medium"
                  style={{ backgroundColor: `${branding.primaryColor || '#3b82f6'}20` }}
                >
                  <span style={{ color: branding.primaryColor || '#3b82f6' }}>
                    라이트 뱃지
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 하단 액션 버튼 */}
        <div className="sticky bottom-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 px-6 py-4 flex gap-3">
          <button
            onClick={onClose}
            disabled={saving}
            className="flex-1 px-6 py-4 bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-xl font-bold text-base hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            취소
          </button>
          <button
            onClick={handleSave}
            disabled={saving || uploading}
            className="flex-1 px-6 py-4 bg-brand-primary hover:bg-brand-primary-hover text-white rounded-xl font-bold text-base disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
          >
            {saving ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                저장 중...
              </>
            ) : (
              <>
                <CheckIcon className="w-5 h-5" />
                저장하기
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default BrandingSettings;
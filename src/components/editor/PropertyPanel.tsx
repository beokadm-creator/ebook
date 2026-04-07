import React, { useState } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import {
  ContentBlock as ContentType,
  BilingualValue,
  HeadingContent,
  TextContent,
  ImageContent,
  VideoContent,
  AdContent,
  ListContent,
  FootnoteContent,
} from '@/types/content';
import BilingualInput from '@/components/common/BilingualInput';

type BlockContent = HeadingContent | TextContent | ImageContent | VideoContent | AdContent | ListContent | FootnoteContent;

interface PropertyPanelProps {
  block: ContentType;
  onUpdate: (updates: { content: BlockContent }) => void;
  onClose: () => void;
}

const PropertyPanel: React.FC<PropertyPanelProps> = ({ block, onUpdate, onClose }) => {
  const [localContent, setLocalContent] = useState<BlockContent>(block.content);

  const handleSave = () => {
    onUpdate({ content: localContent });
    onClose();
  };

  const handleTypeChange = (newType: ContentType['type']) => {
    let newContent: BlockContent;

    switch (newType) {
      case 'heading':
        newContent = { text: { ko: '', en: '' }, level: 2 };
        break;
      case 'text':
        newContent = { html: { ko: '', en: '' } };
        break;
      case 'image':
        newContent = { url: '', caption: { ko: '', en: '' }, alt: { ko: '', en: '' } };
        break;
      case 'video':
        newContent = { platform: 'vimeo', videoId: '' };
        break;
      case 'ad':
        newContent = { advertiser: '', imageUrl: '', linkUrl: '', skipable: true };
        break;
      default:
        return;
    }

    setLocalContent(newContent);
  };

  // Type-safe accessors for editing — block.type determines which content shape is active
  const heading = localContent as HeadingContent;
  const text = localContent as TextContent;
  const image = localContent as ImageContent;
  const video = localContent as VideoContent;
  const ad = localContent as AdContent;

  return (
    <div className="h-full flex flex-col">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">
          블록 속성 편집
        </h3>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
        >
          <XMarkIcon className="w-6 h-6" />
        </button>
      </div>

      {/* 블록 타입 변경 */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          블록 타입
        </label>
        <select
          value={block.type}
          onChange={(e) => handleTypeChange(e.target.value as ContentType['type'])}
          className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg text-gray-900 dark:text-gray-100"
        >
          <option value="heading">제목 (Heading)</option>
          <option value="text">텍스트 (Text)</option>
          <option value="image">이미지 (Image)</option>
          <option value="video">비디오 (Video)</option>
          <option value="ad">광고 (Ad)</option>
        </select>
      </div>

      {/* 타입별 속성 편집 */}
      {block.type === 'heading' && (
        <>
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              제목 텍스트
            </label>
            <BilingualInput
              label="제목 텍스트"
              value={typeof heading.text === 'object' ? heading.text : { ko: String(heading.text || ''), en: '' }}
              onChange={(val: BilingualValue) => setLocalContent({ ...heading, text: val })}
            />
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              레벨
            </label>
            <select
              value={heading.level || 2}
              onChange={(e) => setLocalContent({ ...heading, level: parseInt(e.target.value) })}
              className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg text-gray-900 dark:text-gray-100"
            >
              <option value={1}>H1 (가장 큼)</option>
              <option value={2}>H2 (중간)</option>
              <option value={3}>H3 (작음)</option>
            </select>
          </div>
        </>
      )}

      {block.type === 'text' && (
        <>
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              HTML 내용
            </label>
            <textarea
              value={text.html?.ko || ''}
              onChange={(e) => setLocalContent({ ...text, html: { ko: e.target.value, en: text.html?.en || '' } })}
              rows={10}
              className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg text-gray-900 dark:text-gray-100 font-mono text-sm"
              placeholder="<p>HTML 내용</p>"
            />
          </div>
        </>
      )}

      {block.type === 'image' && (
        <>
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              이미지 URL
            </label>
            <input
              type="text"
              value={image.url || ''}
              onChange={(e) => setLocalContent({ ...image, url: e.target.value })}
              className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg text-gray-900 dark:text-gray-100"
              placeholder="https://..."
            />
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              캡션
            </label>
            <input
              type="text"
              value={image.caption?.ko || ''}
              onChange={(e) => setLocalContent({ ...image, caption: { ko: e.target.value, en: image.caption?.en || '' } })}
              className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg text-gray-900 dark:text-gray-100"
              placeholder="이미지 설명"
            />
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Alt 텍스트
            </label>
            <input
              type="text"
              value={image.alt?.ko || ''}
              onChange={(e) => setLocalContent({ ...image, alt: { ko: e.target.value, en: image.alt?.en || '' } })}
              className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg text-gray-900 dark:text-gray-100"
              placeholder="접근성을 위한 대체 텍스트"
            />
          </div>

          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                너비 (%)
              </label>
              <input
                type="number"
                value={image.width || 100}
                onChange={(e) => setLocalContent({ ...image, width: parseInt(e.target.value) })}
                min="10"
                max="100"
                className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg text-gray-900 dark:text-gray-100"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                높이 (%)
              </label>
              <input
                type="number"
                value={image.height ?? 100}
                onChange={(e) => setLocalContent({ ...image, height: parseInt(e.target.value) || undefined })}
                min="10"
                max="100"
                className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg text-gray-900 dark:text-gray-100"
              />
            </div>
          </div>

          {/* 미리보기 */}
          {image.url && (
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                미리보기
              </label>
              <img
                src={image.url}
                alt={image.alt?.ko || ''}
                style={{
                  width: `${image.width || 100}%`,
                  height: image.height ? `${image.height}%` : 'auto'
                }}
                className="rounded-lg"
              />
            </div>
          )}
        </>
      )}

      {block.type === 'video' && (
        <>
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              플랫폼
            </label>
            <select
              value={video.platform || 'vimeo'}
              onChange={(e) => setLocalContent({ ...video, platform: e.target.value as 'vimeo' | 'youtube' })}
              className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg text-gray-900 dark:text-gray-100"
            >
              <option value="vimeo">Vimeo</option>
              <option value="youtube">YouTube</option>
            </select>
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              비디오 ID
            </label>
            <input
              type="text"
              value={video.videoId || ''}
              onChange={(e) => setLocalContent({ ...video, videoId: e.target.value })}
              className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg text-gray-900 dark:text-gray-100"
              placeholder="123456789"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              예: https://vimeo.com/123456789 → 123456789
            </p>
          </div>

          {video.videoId && (
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                미리보기
              </label>
              <div className="aspect-w-16 aspect-h-9">
                <iframe
                  src={`https://player.vimeo.com/video/${video.videoId}`}
                  className="w-full h-48 rounded-lg"
                  allowFullScreen
                />
              </div>
            </div>
          )}
        </>
      )}

      {block.type === 'ad' && (
        <>
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              광고주
            </label>
            <input
              type="text"
              value={ad.advertiser || ''}
              onChange={(e) => setLocalContent({ ...ad, advertiser: e.target.value })}
              className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg text-gray-900 dark:text-gray-100"
              placeholder="광고주 이름"
            />
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              이미지 URL
            </label>
            <input
              type="text"
              value={ad.imageUrl || ''}
              onChange={(e) => setLocalContent({ ...ad, imageUrl: e.target.value })}
              className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg text-gray-900 dark:text-gray-100"
              placeholder="https://..."
            />
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              링크 URL
            </label>
            <input
              type="text"
              value={ad.linkUrl || ''}
              onChange={(e) => setLocalContent({ ...ad, linkUrl: e.target.value })}
              className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg text-gray-900 dark:text-gray-100"
              placeholder="https://..."
            />
          </div>

          <div className="mb-4">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={ad.skipable || false}
                onChange={(e) => setLocalContent({ ...ad, skipable: e.target.checked })}
                className="rounded"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">
                건너뛰기 버튼 표시
              </span>
            </label>
          </div>
        </>
      )}

      {/* 버튼 */}
      <div className="mt-auto flex gap-3">
        <button
          onClick={handleSave}
          className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-lg font-medium transition-colors"
        >
          적용
        </button>
        <button
          onClick={onClose}
          className="px-6 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 py-3 rounded-lg font-medium transition-colors"
        >
          취소
        </button>
      </div>
    </div>
  );
};

export default PropertyPanel;
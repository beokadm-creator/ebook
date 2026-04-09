import React from 'react';
import { ContentBlock as ContentType, BilingualValue } from '@/types/content';
import { useI18nStore } from '@/stores/i18nStore';

interface ContentBlockProps {
  block: ContentType;
  onFootnoteClick?: (footnoteId: string) => void;
}

const ContentBlock: React.FC<ContentBlockProps> = ({ block, onFootnoteClick }) => {
  const { language } = useI18nStore();

  const getLocalText = (value: BilingualValue | string | undefined): string => {
    if (!value) return '';
    if (typeof value === 'string') return value;
    return value[language] || value.ko || value.en || '';
  };
  const renderContent = () => {
    switch (block.type) {
      case 'heading': {
        const level = block.content.level || 1;
        const HeadingTag = `h${level}` as keyof JSX.IntrinsicElements;
        return (
          <HeadingTag
            id={block.id}
            className={`font-bold mb-4 scroll-mt-4 ${
              level === 1 ? 'text-3xl' : 
              level === 2 ? 'text-2xl' : 'text-xl'
            }`}
          >
            {getLocalText(block.content.text)}
          </HeadingTag>
        );
      }

      case 'text':
        return (
          <div
            dangerouslySetInnerHTML={{ __html: getLocalText(block.content.html) }}
            className="prose prose-lg max-w-none mb-4 leading-relaxed"
          />
        );

      case 'image':
        return (
          <figure className="my-6">
            <img
              src={block.content.url}
              alt={getLocalText(block.content.alt)}
              className="w-full h-auto rounded-lg shadow-md"
              loading="lazy"
            />
            {block.content.caption && (
              <figcaption className="text-sm text-gray-600 dark:text-gray-400 mt-2 text-center">
                {getLocalText(block.content.caption)}
              </figcaption>
            )}
          </figure>
        );

      case 'video': {
        const { platform, videoId } = block.content;
        if (platform === 'youtube') {
          return (
            <div className="my-6">
              <div className="aspect-w-16 aspect-h-9">
                <iframe
                  src={`https://www.youtube.com/embed/${videoId}`}
                  title="YouTube video"
                  className="w-full h-[400px] rounded-lg shadow-md"
                  allowFullScreen
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                />
              </div>
              {block.content.title && (
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-2 text-center">
                  {typeof block.content.title === 'string' ? block.content.title : block.content.title.ko || block.content.title.en}
                </p>
              )}
            </div>
          );
        }
        if (platform === 'vimeo') {
          return (
            <div className="my-6">
              <div className="aspect-w-16 aspect-h-9">
                <iframe
                  src={`https://player.vimeo.com/video/${videoId}`}
                  title="Vimeo video"
                  className="w-full h-[400px] rounded-lg shadow-md"
                  allowFullScreen
                  allow="autoplay; fullscreen; picture-in-picture"
                />
              </div>
              {block.content.title && (
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-2 text-center">
                  {typeof block.content.title === 'string' ? block.content.title : block.content.title.ko || block.content.title.en}
                </p>
              )}
            </div>
          );
        }
        return null;
      }

      case 'ad':
        return (
          <div className="my-6 p-4 bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900 dark:to-purple-900 rounded-lg border-2 border-blue-200 dark:border-blue-700">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                {block.content.imageUrl && (
                  <img
                    src={block.content.imageUrl}
                    alt={block.content.advertiser || '이미지'}
                    className="w-full h-auto rounded mb-3"
                  />
                )}
                {block.content.advertiser && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                    {block.content.advertiser}
                  </p>
                )}
                {block.content.linkUrl && block.content.linkUrl !== '#' && (
                  <a
                    href={block.content.linkUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    자세히 보기 →
                  </a>
                )}
              </div>
              {block.content.skipable && (
                <button type="button" className="ml-4 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
                  ✕
                </button>
              )}
            </div>
          </div>
        );

      case 'list': {
        const ListTag = block.content.ordered ? 'ol' : 'ul';
        const listClass = block.content.ordered
          ? 'list-decimal list-inside mb-4 space-y-2 ml-4'
          : 'list-disc list-inside mb-4 space-y-2 ml-4';
        return (
          <ListTag className={listClass}>
            {block.content.items.map((item: any, index: number) => (
              <li key={`list-${index}`}>{getLocalText(item)}</li>
            ))}
          </ListTag>
        );
      }

      case 'footnote': {
        const footnoteRef = block.content.referenceId || block.id;
        return (
          <div id={`footnote-${footnoteRef}`} className="my-2">
            <button
              type="button"
              onClick={() => onFootnoteClick?.(footnoteRef)}
              className="inline-flex items-center align-super text-xs font-medium text-brand-primary hover:text-brand-primary-hover cursor-pointer"
            >
              <sup>[{block.content.number || '*'}]</sup>
            </button>
            <span className="text-sm text-gray-700 dark:text-gray-300 ml-1">
              {typeof block.content.content === 'string'
                ? block.content.content
                : block.content.content?.ko || block.content.content?.en || ''}
            </span>
          </div>
        );
      }

      default:
        return null;
    }
  };

  return (
    <div className="content-block">
      {renderContent()}
    </div>
  );
};

export default React.memo(ContentBlock);

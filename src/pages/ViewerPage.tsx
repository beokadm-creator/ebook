import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { collection, doc, getDoc, getDocs, query, orderBy } from 'firebase/firestore';
import { db } from '../lib/firebase';
import OptimizedViewer from '../components/viewer/OptimizedViewer';
import ViewerControlPanel from '../components/viewer/ViewerControlPanel';
import MobileViewerControls from '../components/viewer/MobileViewerControls';
import { ContentBlock as ContentType, TOCItem } from '../types/content';
import { useReadingProgress } from '../hooks/useReadingProgress';
import { downloadPublicationAsText } from '../utils/downloadUtils';
import { parseFirebaseError, getSafeErrorMessage, logError } from '../utils/errorHandler';
import { ArrowDownTrayIcon } from '@heroicons/react/24/outline';

const ViewerPage: React.FC = () => {
  const { publicationId } = useParams<{ publicationId: string }>();
  const [contentBlocks, setContentBlocks] = useState<ContentType[]>([]);
  const [publicationTitle, setPublicationTitle] = useState<string>('');
  const [toc, setToc] = useState<TOCItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [initialScrollIndex, setInitialScrollIndex] = useState(0);

  const { handleScroll, loadProgress } = useReadingProgress({
    publicationId: publicationId || '',
    totalBlocks: contentBlocks.length,
    enabled: !!publicationId && contentBlocks.length > 0
  });

  useEffect(() => {
    if (!publicationId) return;

    const loadPublicationData = async () => {
      try {
        setLoading(true);
        const pubDoc = await getDoc(doc(db, 'publications', publicationId!));
        if (!pubDoc.exists()) {
          setError('간행물을 찾을 수 없습니다.');
          return;
        }

        const pubData = pubDoc.data();
        const title = typeof pubData.title === 'string'
          ? pubData.title
          : pubData.title?.ko || pubData.title?.en || '';
        setPublicationTitle(title);

        // 간행물의 아티클 로드
        const articlesSnap = await getDocs(
          query(collection(db, 'publications', publicationId!, 'articles'), orderBy('order', 'asc'))
        );

        const allBlocks: ContentType[] = [];
        const tocItems: TOCItem[] = [];

        // 병렬 처리로 N+1 쿼리 문제 완화
        const articlesData = await Promise.all(
          articlesSnap.docs.map(async (articleDoc) => {
            const articleData = articleDoc.data();
            const articleTitle = typeof articleData.title === 'string'
              ? articleData.title
              : articleData.title?.ko || '';

            const blocksSnap = await getDocs(
              query(
                collection(db, 'publications', publicationId!, 'articles', articleDoc.id, 'contentBlocks'),
                orderBy('order', 'asc')
              )
            );

            return {
              articleDoc,
              articleData,
              articleTitle,
              blocksSnap
            };
          })
        );

        articlesData.forEach(({ articleDoc, articleData, articleTitle, blocksSnap }) => {
          const articleTocItem: TOCItem = {
            id: articleDoc.id,
            title: typeof articleData.title === 'object'
              ? articleData.title
              : { ko: articleTitle, en: '' },
            level: 1,
            blockId: articleDoc.id,
            children: []
          };

          blocksSnap.forEach((blockDoc) => {
            const blockData = blockDoc.data();
            allBlocks.push({ id: blockDoc.id, ...blockData } as ContentType);

            if (blockData.type === 'heading' && blockData.content?.text) {
              const headingTitle = typeof blockData.content.text === 'object'
                ? blockData.content.text
                : { ko: String(blockData.content.text), en: '' };
              articleTocItem.children!.push({
                id: blockDoc.id,
                title: headingTitle,
                level: blockData.content.level || 2,
                blockId: blockDoc.id
              });
            }
          });

          tocItems.push(articleTocItem);
        });

        setContentBlocks(allBlocks);
        setToc(tocItems);

        // 독서 진행률 로드
        const savedProgress = await loadProgress();
        if (savedProgress) {
          const scrollIndex = Math.floor((savedProgress.progress / 100) * allBlocks.length);
          setInitialScrollIndex(Math.max(0, scrollIndex - 5));
        }
      } catch (err) {
        logError(err, 'ViewerPage - loadPublication');
        const parsedError = parseFirebaseError(err);
        setError(getSafeErrorMessage(parsedError));
      } finally {
        setLoading(false);
      }
    };

    loadPublicationData();
  }, [publicationId, loadProgress]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-white dark:bg-gray-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-primary mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-400">불러오는 중...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-white dark:bg-gray-900">
        <div className="text-center">
          <p className="text-red-600 dark:text-red-400 text-lg mb-4">{error}</p>
          <button
            type="button"
            onClick={() => window.history.back()}
            className="bg-brand-primary hover:bg-brand-primary-hover text-white px-6 py-2 rounded-lg"
          >
            돌아가기
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* 상단 네비게이션 바 */}
      <div className="fixed top-0 left-0 right-0 z-40 bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm border-b border-gray-200 dark:border-gray-700 px-4 py-3">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => window.history.back()}
            className="flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
          >
            <span className="text-sm font-medium">← 목록으로</span>
          </button>
          <h1 className="text-base font-bold text-gray-900 dark:text-gray-100 truncate mx-4">
            {publicationTitle}
          </h1>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => downloadPublicationAsText(contentBlocks, publicationTitle)}
              className="p-2 text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
              title="텍스트로 다운로드"
            >
              <ArrowDownTrayIcon className="w-5 h-5" />
            </button>
            <Link
              to="/mypage"
              className="text-xs text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
            >
              마이페이지
            </Link>
          </div>
        </div>
      </div>
      {/* 뷰어 영역 (네비게이션 바 높이만큼 패딩) */}
      <div className="pt-14">
        <OptimizedViewer
          contentBlocks={contentBlocks}
          publicationId={publicationId}
          onScroll={handleScroll}
          initialScrollIndex={initialScrollIndex}
        />
      </div>
      {/* 데스크탑: 사이드 패널, 모바일: FAB + BottomSheet */}
      <div className="hidden md:block">
        <ViewerControlPanel />
      </div>
      <div className="block md:hidden">
        <MobileViewerControls toc={toc} />
      </div>
    </div>
  );
};

export default ViewerPage;

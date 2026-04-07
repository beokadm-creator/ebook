import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import {
  collection,
  collectionGroup,
  getDocs,
  query,
  orderBy,
  writeBatch,
  doc,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import BlockEditor from '../components/editor/BlockEditor';
import ProtectedRoute from '../components/auth/ProtectedRoute';
import { ContentBlock as ContentType } from '../types/content';
import { logError } from '../utils/errorHandler';
import { showToast } from '../components/common/Toast';

const EditorPage: React.FC = () => {
  const { articleId } = useParams<{ articleId: string }>();
  const [blocks, setBlocks] = useState<ContentType[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!articleId) return;

    const loadArticleBlocks = async () => {
      try {
        setLoading(true);
        // Use collectionGroup to find the article in one query instead of N+1
        const articlesSnap = await getDocs(collectionGroup(db, 'articles'));
        const targetArticle = articlesSnap.docs.find(d => d.id === articleId);

        if (targetArticle) {
          const pubRef = targetArticle.ref.parent.parent;
          if (pubRef) {
            const blocksSnap = await getDocs(
              query(
                collection(db, 'publications', pubRef.id, 'articles', articleId!, 'contentBlocks'),
                orderBy('order', 'asc')
              )
            );
            const loadedBlocks = blocksSnap.docs.map(bd => ({ id: bd.id, ...bd.data() } as ContentType));
            setBlocks(loadedBlocks);
          }
        }
      } catch (err) {
        logError(err, 'EditorPage-load');
      } finally {
        setLoading(false);
      }
    };

    loadArticleBlocks();
  }, [articleId]);

  const handleSave = async (updatedBlocks: ContentType[]) => {
    if (!articleId) return;
    try {
      // Use collectionGroup to find the article in one query instead of N+1
      const articlesSnap = await getDocs(collectionGroup(db, 'articles'));
      const targetArticle = articlesSnap.docs.find(d => d.id === articleId);

      if (targetArticle) {
        const pubRef = targetArticle.ref.parent.parent;
        if (pubRef) {
          const batch = writeBatch(db);
          // Delete existing blocks then write new ones
          const existingBlocks = await getDocs(
            collection(db, 'publications', pubRef.id, 'articles', articleId, 'contentBlocks')
          );
          existingBlocks.docs.forEach(bd => batch.delete(bd.ref));
          updatedBlocks.forEach((block, idx) => {
            const blockRef = doc(collection(db, 'publications', pubRef.id, 'articles', articleId, 'contentBlocks'));
            batch.set(blockRef, { ...block, order: idx });
          });
          await batch.commit();
          showToast('저장되었습니다.', 'success');
          return;
        }
      }
      showToast('아티클을 찾을 수 없습니다.', 'error');
    } catch (err) {
      logError(err, 'EditorPage-save');
      showToast('저장에 실패했습니다.', 'error');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-primary" />
      </div>
    );
  }

  return (
    <ProtectedRoute>
      <BlockEditor
        initialBlocks={blocks}
        onSave={handleSave}
      />
    </ProtectedRoute>
  );
};

export default EditorPage;

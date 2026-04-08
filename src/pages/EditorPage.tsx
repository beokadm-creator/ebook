import React, { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import { loadPublishingDocument, savePublishingDocument } from '@/lib/publishing/firestore';
import { usePublishingStore } from '@/stores/publishingStore';
import { showToast } from '@/components/common/Toast';
import { logError } from '@/utils/errorHandler';

const PublishingEditorShell = lazy(() => import('@/components/publishing/PublishingEditorShell'));
const getDraftKey = (publicationId: string) => `publishing-draft:${publicationId}`;

const EditorPage: React.FC = () => {
  const { publicationId } = useParams<{ publicationId: string }>();
  const initialize = usePublishingStore((state) => state.initialize);
  const documentState = usePublishingStore((state) => state.document);
  const historyRevision = usePublishingStore((state) => state.history.revision);
  const autosave = usePublishingStore((state) => state.autosave);
  const markSaving = usePublishingStore((state) => state.markSaving);
  const markSaved = usePublishingStore((state) => state.markSaved);
  const markSaveFailed = usePublishingStore((state) => state.markSaveFailed);
  const [loading, setLoading] = useState(true);
  const saveTimer = useRef<number | null>(null);

  useEffect(() => {
    if (!publicationId) {
      return;
    }

    const load = async () => {
      try {
        setLoading(true);
        const document = await loadPublishingDocument(publicationId);
        const rawDraft = window.localStorage.getItem(getDraftKey(publicationId));

        if (rawDraft) {
          try {
            const parsedDraft = JSON.parse(rawDraft) as typeof document;
            const remoteUpdatedAt = new Date(document.meta.updatedAt).getTime();
            const localUpdatedAt = new Date(parsedDraft.meta.updatedAt).getTime();
            if (localUpdatedAt > remoteUpdatedAt) {
              initialize(parsedDraft);
              showToast('로컬 초안 열기', 'success');
            } else {
              initialize(document);
            }
          } catch {
            initialize(document);
          }
        } else {
          initialize(document);
        }
      } catch (error) {
        logError(error, 'PublishingEditor-load');
        const rawDraft = window.localStorage.getItem(getDraftKey(publicationId));
        if (rawDraft) {
          try {
            initialize(JSON.parse(rawDraft));
            showToast('로컬 초안 복원', 'success');
          } catch {
            showToast('간행물 편집 상태를 불러오지 못했습니다.', 'error');
          }
        } else {
          showToast('간행물 편집 상태를 불러오지 못했습니다.', 'error');
        }
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [initialize, publicationId]);

  useEffect(() => {
    if (!publicationId || loading || !autosave.dirty) {
      return;
    }

    if (saveTimer.current) {
      window.clearTimeout(saveTimer.current);
    }

    saveTimer.current = window.setTimeout(() => {
      markSaving();
      void savePublishingDocument(publicationId, documentState)
        .then(() => {
          window.localStorage.removeItem(getDraftKey(publicationId));
          markSaved();
        })
        .catch((error) => {
          logError(error, 'PublishingEditor-save');
          markSaveFailed('저장 실패');
          showToast('간행물 저장에 실패했습니다.', 'error');
        });
    }, 1500);

    return () => {
      if (saveTimer.current) {
        window.clearTimeout(saveTimer.current);
      }
    };
  }, [autosave.dirty, documentState, historyRevision, loading, markSaveFailed, markSaved, markSaving, publicationId]);

  if (!publicationId) {
    return <div className="p-8 text-center text-red-600">간행물 ID가 없습니다.</div>;
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f3efe7]">
        <div className="text-center">
          <div className="mx-auto h-12 w-12 animate-spin rounded-full border-b-2 border-slate-900" />
          <p className="mt-4 text-sm text-slate-500">A4 편집 상태를 불러오는 중...</p>
        </div>
      </div>
    );
  }

  return (
    <ProtectedRoute>
      <Suspense
        fallback={
          <div className="flex min-h-screen items-center justify-center bg-[#f3efe7]">
            <div className="text-center">
              <div className="mx-auto h-12 w-12 animate-spin rounded-full border-b-2 border-slate-900" />
              <p className="mt-4 text-sm text-slate-500">에디터 쉘을 준비하는 중...</p>
            </div>
          </div>
        }
      >
        <PublishingEditorShell publicationId={publicationId} />
      </Suspense>
    </ProtectedRoute>
  );
};

export default EditorPage;

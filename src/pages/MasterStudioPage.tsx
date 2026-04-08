import React, { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import { useAuth } from '@/contexts/AuthContext';
import { loadPublishingDocument, savePublishingDocument } from '@/lib/publishing/firestore';
import { usePublishingStore } from '@/stores/publishingStore';
import { showToast } from '@/components/common/Toast';
import { logError } from '@/utils/errorHandler';

const MasterStudioShell = lazy(() => import('@/components/publishing/MasterStudioShell'));
const getDraftKey = (publicationId: string) => `publishing-draft:${publicationId}`;

const MasterStudioPage: React.FC = () => {
  const { publicationId } = useParams<{ publicationId: string }>();
  const { user, role, loading: authLoading } = useAuth();
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
    if (!publicationId || authLoading || !user || role !== 'admin') {
      return;
    }

    const load = async () => {
      try {
        setLoading(true);
        const document = await loadPublishingDocument(publicationId);
        initialize(document);
        window.localStorage.removeItem(getDraftKey(publicationId));
      } catch (error) {
        logError(error, 'MasterStudio-load');
        const rawDraft = window.localStorage.getItem(getDraftKey(publicationId));
        if (rawDraft) {
          try {
            initialize(JSON.parse(rawDraft));
            showToast('로컬 초안 복원', 'success');
          } catch {
            showToast('마스터 상태를 불러오지 못했습니다.', 'error');
          }
        } else {
          showToast('마스터 상태를 불러오지 못했습니다.', 'error');
        }
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [authLoading, initialize, publicationId, role, user]);

  useEffect(() => {
    if (!publicationId || authLoading || !user || role !== 'admin' || loading || !autosave.dirty) {
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
          logError(error, 'MasterStudio-save');
          markSaveFailed('저장 실패');
          showToast('마스터 저장에 실패했습니다.', 'error');
        });
    }, 1500);

    return () => {
      if (saveTimer.current) {
        window.clearTimeout(saveTimer.current);
      }
    };
  }, [authLoading, autosave.dirty, documentState, historyRevision, loading, markSaveFailed, markSaved, markSaving, publicationId, role, user]);

  if (!publicationId) {
    return <div className="p-8 text-center text-red-600">간행물 ID가 없습니다.</div>;
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f3efe7]">
        <div className="text-center">
          <div className="mx-auto h-12 w-12 animate-spin rounded-full border-b-2 border-slate-900" />
          <p className="mt-4 text-sm text-slate-500">마스터 스튜디오를 불러오는 중...</p>
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
              <p className="mt-4 text-sm text-slate-500">스튜디오를 준비하는 중...</p>
            </div>
          </div>
        }
      >
        <MasterStudioShell publicationId={publicationId} />
      </Suspense>
    </ProtectedRoute>
  );
};

export default MasterStudioPage;

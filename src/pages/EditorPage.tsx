import React, { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import { useAuth } from '@/contexts/AuthContext';
import { loadPublishingDocument, loadPublishingThreads, saveEditorWorkspaceDelta } from '@/lib/publishing/firestore';
import { PublishingDocument } from '@/types/publishing';
import { usePublishingStore } from '@/stores/publishingStore';
import { showToast } from '@/components/common/Toast';
import { logError } from '@/utils/errorHandler';

const PublishingEditorShell = lazy(() => import('@/components/publishing/PublishingEditorShell'));
const getDraftKey = (publicationId: string) => `publishing-draft:${publicationId}`;

const EditorPage: React.FC = () => {
  const { publicationId } = useParams<{ publicationId: string }>();
  const { user, role, loading: authLoading } = useAuth();
  const initialize = usePublishingStore((state) => state.initialize);
  const loadThreads = usePublishingStore((state) => state.loadThreads);
  const documentState = usePublishingStore((state) => state.document);
  const historyRevision = usePublishingStore((state) => state.history.revision);
  const autosave = usePublishingStore((state) => state.autosave);
  const markSaving = usePublishingStore((state) => state.markSaving);
  const markSaved = usePublishingStore((state) => state.markSaved);
  const markSaveFailed = usePublishingStore((state) => state.markSaveFailed);
  const isThreadsLoaded = usePublishingStore((state) => state.isThreadsLoaded);
  const [loading, setLoading] = useState(true);
  const saveTimer = useRef<number | null>(null);
  const lastSavedDocumentRef = useRef<PublishingDocument | null>(null);

  useEffect(() => {
    if (!publicationId || authLoading || !user || role !== 'admin') {
      return;
    }

    const load = async () => {
      try {
        setLoading(true);
        const document = await loadPublishingDocument(publicationId);
        initialize(document);
        lastSavedDocumentRef.current = structuredClone(document);
        window.localStorage.removeItem(getDraftKey(publicationId));
        
        // lazy load threads
        loadPublishingThreads(publicationId).then((threads) => {
          if (threads.length > 0) {
            loadThreads(threads);
            lastSavedDocumentRef.current!.threads = structuredClone(threads);
          }
        }).catch(err => logError(err, 'PublishingEditor-load-threads'));
        
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
  }, [authLoading, initialize, publicationId, role, user]);

  useEffect(() => {
    if (!publicationId || authLoading || !user || role !== 'admin' || loading || !autosave.dirty || !isThreadsLoaded) {
      return;
    }

    if (saveTimer.current) {
      window.clearTimeout(saveTimer.current);
    }

    saveTimer.current = window.setTimeout(() => {
      markSaving();
      // Firestore 저장 전에 로컬 스토리지에 안전하게 임시 저장 (오프라인 데이터 유실 방지)
      window.localStorage.setItem(getDraftKey(publicationId), JSON.stringify(documentState));
      
      if (!navigator.onLine) {
        // 오프라인 상태일 경우 Firestore 시도 없이 즉시 실패 처리하여 로컬 초안을 유지
        markSaveFailed('오프라인 상태로 인해 로컬에만 임시 저장되었습니다.');
        showToast('인터넷 연결이 끊겨 오프라인 모드로 저장되었습니다.', 'warning');
        return;
      }

      void saveEditorWorkspaceDelta(publicationId, lastSavedDocumentRef.current, documentState)
        .then(() => {
          lastSavedDocumentRef.current = structuredClone(documentState);
          window.localStorage.removeItem(getDraftKey(publicationId));
          markSaved();
        })
        .catch((error) => {
          logError(error, 'PublishingEditor-save');
          markSaveFailed('저장 실패');
          showToast('간행물 저장에 실패했습니다. 로컬에 안전하게 보관 중입니다.', 'error');
        });
    }, 1500);

    return () => {
      if (saveTimer.current) {
        window.clearTimeout(saveTimer.current);
      }
    };
  }, [authLoading, autosave.dirty, documentState, historyRevision, loading, markSaveFailed, markSaved, markSaving, publicationId, role, user, isThreadsLoaded]);

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

import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import EbookViewer from '@/components/publishing/EbookViewer';
import { extractEbookEntries } from '@/lib/publishing/ebook';
import { loadPublishingDocument } from '@/lib/publishing/firestore';
import { PublishingDocument } from '@/types/publishing';
import { logError } from '@/utils/errorHandler';

const ViewerPage: React.FC = () => {
  const { publicationId } = useParams<{ publicationId: string }>();
  const [documentState, setDocumentState] = useState<PublishingDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!publicationId) {
      return;
    }

    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const next = await loadPublishingDocument(publicationId);
        setDocumentState(next);
      } catch (loadError) {
        logError(loadError, 'PublishingViewer-load');
        setError('간행물 콘텐츠를 불러오지 못했습니다.');
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [publicationId]);

  const entries = useMemo(
    () => (documentState ? extractEbookEntries(documentState, 'ko') : []),
    [documentState],
  );

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#fcfaf5]">
        <div className="text-center">
          <div className="mx-auto h-12 w-12 animate-spin rounded-full border-b-2 border-slate-900" />
          <p className="mt-4 text-sm text-slate-500">반응형 eBook 뷰어를 준비하는 중...</p>
        </div>
      </div>
    );
  }

  if (error || !documentState) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#fcfaf5]">
        <div className="rounded-3xl border border-red-200 bg-white px-8 py-6 text-center">
          <p className="text-lg font-semibold text-red-600">{error || '간행물을 찾을 수 없습니다.'}</p>
        </div>
      </div>
    );
  }

  return (
    <EbookViewer
      publicationId={publicationId!}
      title={documentState.meta.title.ko}
      entries={entries}
      sourcePublicationType={documentState.meta.sourcePublicationType}
    />
  );
};

export default ViewerPage;

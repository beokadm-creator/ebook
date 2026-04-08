import React from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import ProtectedRoute from '../components/auth/ProtectedRoute';
import DocumentUploader from '../components/uploader/DocumentUploader';

const UploadPage: React.FC = () => {
  const { conferenceId } = useParams<{ conferenceId: string }>();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();

  const publicationId = searchParams.get('pubId');
  const publicationType = (searchParams.get('type') as any) || 'abstract';

  return (
    <ProtectedRoute>
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-3xl font-black text-gray-900 dark:text-gray-100 mb-2 tracking-tight">
            콘텐츠 업로드
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mb-8">
            워드 문서를 업로드하여 eBook 콘텐츠로 자동 변환합니다.
          </p>
          
          <DocumentUploader
            conferenceId={conferenceId || ''}
            publicationId={publicationId || undefined}
            publicationType={publicationType}
            userId={user?.uid || ''}
          />
        </div>
      </div>
    </ProtectedRoute>
  );
};

export default UploadPage;

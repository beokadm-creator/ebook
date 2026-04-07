import React from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import ProtectedRoute from '../components/auth/ProtectedRoute';
import DocumentUploader from '../components/uploader/DocumentUploader';

const UploadPage: React.FC = () => {
  const { conferenceId } = useParams<{ conferenceId: string }>();
  const { user } = useAuth();

  return (
    <ProtectedRoute>
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-8">
          문서 업로드
        </h1>
        <DocumentUploader
          conferenceId={conferenceId || ''}
          publicationType="abstract"
          userId={user?.uid || ''}
        />
      </div>
    </ProtectedRoute>
  );
};

export default UploadPage;

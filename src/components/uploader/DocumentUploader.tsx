import React, { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import {
  DocumentArrowUpIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  ClockIcon
} from '@heroicons/react/24/outline';
import { useDocumentParsingState } from '@/hooks/useDocumentParsingState';

interface DocumentUploaderProps {
  conferenceId: string;
  publicationId?: string;
  publicationType: 'abstract' | 'poster' | 'presentation';
  userId: string;
  onComplete?: (articleId: string) => void;
}

const DocumentUploader: React.FC<DocumentUploaderProps> = ({
  conferenceId,
  publicationId,
  publicationType,
  userId,
  onComplete
}) => {
  const metadata = {
    conferenceId,
    publicationId,
    publicationType,
    userId
  };

  const { state, uploadDocument, resetState } = useDocumentParsingState(metadata);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;

    if (!file.name.endsWith('.docx')) {
      alert('.docx 파일만 업로드 가능합니다.');
      return;
    }

    try {
      await uploadDocument(file);
    } catch (error) {
      console.error('Upload failed:', error);
    }
  }, [uploadDocument]);

  const { getRootProps, getInputProps, isDragActive, isDragReject } = useDropzone({
    onDrop,
    accept: {
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx']
    },
    maxFiles: 1,
    multiple: false
  });

  // 완료 시 콜백 호출
  React.useEffect(() => {
    if (state.status === 'completed' && state.articleId && onComplete) {
      const timer = setTimeout(() => {
        onComplete(state.articleId!);
      }, 1000);
      
      return () => clearTimeout(timer);
    }
  }, [state.status, state.articleId, onComplete]);

  const handleReset = () => {
    resetState();
  };

  const getStatusIcon = () => {
    switch (state.status) {
      case 'uploading':
      case 'processing':
        return (
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
        );
      case 'completed':
        return (
          <CheckCircleIcon className="w-16 h-16 text-green-500 mx-auto mb-4" />
        );
      case 'error':
        return (
          <ExclamationCircleIcon className="w-16 h-16 text-red-500 mx-auto mb-4" />
        );
      default:
        return (
          <DocumentArrowUpIcon className="w-16 h-16 text-gray-400 mx-auto mb-4" />
        );
    }
  };

  const getStatusTitle = () => {
    switch (state.status) {
      case 'idle':
        return '워드 문서 업로드';
      case 'uploading':
        return '파일 업로드 중...';
      case 'processing':
        return '문서 변환 중...';
      case 'completed':
        return '변환 완료!';
      case 'error':
        return '변환 실패';
    }
  };

  const getStatusMessage = () => {
    switch (state.status) {
      case 'idle':
        return '.docx 파일을 드래그하거나 클릭하여 업로드하세요.';
      case 'uploading':
        return `파일 업로드 중... ${state.uploadProgress.toFixed(0)}%`;
      case 'processing':
        return `문서를 변환하고 있습니다... ${state.parsingProgress.toFixed(0)}%`;
      case 'completed':
        return `콘텐츠 블록 ${state.contentBlocks.length}개, 목차 ${state.toc.length}개 생성 완료!`;
      case 'error':
        return state.error || '알 수 없는 오류가 발생했습니다.';
    }
  };

  if (state.status !== 'idle') {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-8 max-w-2xl mx-auto">
        <div className="text-center">
          {getStatusIcon()}
          
          <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">
            {getStatusTitle()}
          </h3>
          
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            {getStatusMessage()}
          </p>

          {/* 전체 진행률 바 */}
          {(state.status === 'uploading' || state.status === 'processing') && (
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 mb-4">
              <div 
                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${state.progress}%` }}
              />
            </div>
          )}

          {/* 단계별 진행률 표시 */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                파일 업로드
              </p>
              <p className="text-lg font-bold text-gray-900 dark:text-gray-100">
                {state.uploadProgress.toFixed(0)}%
              </p>
            </div>
            <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                문서 변환
              </p>
              <p className="text-lg font-bold text-gray-900 dark:text-gray-100">
                {state.parsingProgress.toFixed(0)}%
              </p>
            </div>
          </div>

          {/* 완료 시 정보 표시 */}
          {state.status === 'completed' && (
            <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4 mb-6">
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="text-2xl font-bold text-green-700 dark:text-green-300">
                    {state.contentBlocks.length}
                  </p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    콘텐츠 블록
                  </p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-green-700 dark:text-green-300">
                    {state.toc.length}
                  </p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    목차 항목
                  </p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-green-700 dark:text-green-300">
                    {state.footnotes.length}
                  </p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    각주
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* 액션 버튼 */}
          <div className="flex gap-3">
            {state.status === 'completed' && (
              <button
                onClick={() => window.location.href = `/editor/${state.articleId}`}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 rounded-lg transition-colors"
              >
                편집하러 가기
              </button>
            )}
            
            {state.status === 'error' && (
              <button
                onClick={handleReset}
                className="flex-1 bg-gray-600 hover:bg-gray-700 text-white font-medium py-3 rounded-lg transition-colors"
              >
                다시 시도
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div
        {...getRootProps()}
        className={`
          border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer
          transition-all duration-300
          ${isDragActive 
            ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20 scale-105' 
            : 'border-gray-300 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-600'
          }
          ${isDragReject ? 'border-red-500 bg-red-50 dark:bg-red-900/20' : ''}
        `}
      >
        <input {...getInputProps()} />
        
        <DocumentArrowUpIcon className="w-20 h-20 text-gray-400 mx-auto mb-4" />
        
        <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">
          {isDragActive ? '파일을 놓으세요' : '워드 문서 업로드'}
        </h3>
        
        <p className="text-gray-600 dark:text-gray-400 mb-4">
          .docx 파일을 드래그하거나 클릭하여 선택하세요
        </p>
        
        <div className="inline-flex items-center gap-2 bg-gray-100 dark:bg-gray-800 px-4 py-2 rounded-full text-sm text-gray-600 dark:text-gray-400">
          <ClockIcon className="w-4 h-4" />
          <span>최대 10MB까지 지원</span>
        </div>
      </div>

      {/* 지원 정보 */}
      <div className="mt-6 bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
        <h4 className="font-medium text-blue-900 dark:text-blue-300 mb-2">
          💡 지원하는 문서 형식
        </h4>
        <ul className="text-sm text-blue-700 dark:text-blue-400 space-y-1">
          <li>• Microsoft Word (.docx)</li>
          <li>• 제목 스타일 (Heading 1, 2, 3) 자동 인식</li>
          <li>• 이미지 자동 추출 및 최적화</li>
          <li>• 각주 자동 변환</li>
        </ul>
      </div>
    </div>
  );
};

export default DocumentUploader;
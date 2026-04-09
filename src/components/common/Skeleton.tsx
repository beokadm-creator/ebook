import React from 'react';

interface ContentBlockSkeletonProps {
  count?: number;
}

export const ContentBlockSkeleton: React.FC<ContentBlockSkeletonProps> = ({ count = 5 }) => {
  return (
    <div className="space-y-4 animate-pulse">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="space-y-3">
          {/* 제목 스켈레톤 */}
          {index % 3 === 0 && (
            <div className="h-7 bg-gray-200 dark:bg-gray-700 rounded-lg w-3/4" />
          )}
          
          {/* 텍스트 스켈레톤 */}
          <div className="space-y-2">
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-full" />
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-11/12" />
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-10/12" />
          </div>

          {/* 이미지 스켈레톤 */}
          {index % 5 === 0 && (
            <div className="h-48 bg-gray-200 dark:bg-gray-700 rounded-xl w-full" />
          )}
        </div>
      ))}
    </div>
  );
};

interface ConferenceCardSkeletonProps {
  count?: number;
}

export const ConferenceCardSkeleton: React.FC<ConferenceCardSkeletonProps> = ({ count = 6 }) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg overflow-hidden border-2 border-gray-200 dark:border-gray-700 animate-pulse">
          {/* 진행 중 배너 스켈레톤 */}
          <div className="h-12 bg-gray-200 dark:bg-gray-700" />
          
          <div className="p-6 space-y-4">
            {/* 학술대회 이름 스켈레톤 */}
            <div className="h-7 bg-gray-200 dark:bg-gray-700 rounded-xl w-3/4" />
            
            {/* 설명 스켈레톤 */}
            <div className="space-y-2">
              <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-full" />
              <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-11/12" />
            </div>

            {/* 메타 정보 스켈레톤 */}
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-5 h-5 bg-gray-200 dark:bg-gray-700 rounded-full" />
                <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2" />
              </div>
              <div className="flex items-center gap-3">
                <div className="w-5 h-5 bg-gray-200 dark:bg-gray-700 rounded-full" />
                <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-2/3" />
              </div>
              <div className="flex items-center gap-3">
                <div className="w-5 h-5 bg-gray-200 dark:bg-gray-700 rounded-full" />
                <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2" />
              </div>
            </div>

            {/* 간행물 수 스켈레톤 */}
            <div className="flex items-center justify-between pt-4 border-t-2 border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-3">
                <div className="w-6 h-6 bg-gray-200 dark:bg-gray-700 rounded-full" />
                <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded w-1/3" />
              </div>
              <div className="w-7 h-7 bg-gray-200 dark:bg-gray-700 rounded-full" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

interface PublicationListSkeletonProps {
  count?: number;
}

export const PublicationListSkeleton: React.FC<PublicationListSkeletonProps> = ({ count = 5 }) => {
  return (
    <div className="space-y-3 animate-pulse">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="bg-white dark:bg-gray-800 rounded-xl border-2 border-gray-200 dark:border-gray-700 p-4 flex items-center gap-4">
          {/* 아이콘 스켈레톤 */}
          <div className="w-12 h-12 bg-gray-200 dark:bg-gray-700 rounded-xl flex-shrink-0" />
          
          {/* 텍스트 영역 스켈레톤 */}
          <div className="flex-1 space-y-2">
            <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded w-3/4" />
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2" />
          </div>

          {/* 화살표 스켈레톤 */}
          <div className="w-6 h-6 bg-gray-200 dark:bg-gray-700 rounded-full" />
        </div>
      ))}
    </div>
  );
};

type ViewerSettingsSkeletonProps = Record<string, never>;

export const ViewerSettingsSkeleton: React.FC<ViewerSettingsSkeletonProps> = () => {
  return (
    <div className="space-y-6 animate-pulse">
      {/* 다크 모드 토글 스켈레톤 */}
      <div className="flex items-center justify-between">
        <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-24" />
        <div className="w-16 h-10 bg-gray-200 dark:bg-gray-700 rounded-full" />
      </div>

      {/* 폰트 크기 조절 스켈레톤 */}
      <div className="space-y-3">
        <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-20" />
        <div className="flex items-center gap-3">
          <div className="flex-1 h-12 bg-gray-200 dark:bg-gray-700 rounded-xl" />
          <div className="flex-1 h-12 bg-gray-200 dark:bg-gray-700 rounded-xl" />
          <div className="flex-1 h-12 bg-gray-200 dark:bg-gray-700 rounded-xl" />
        </div>
      </div>

      {/* 행간 조절 스켈레톤 */}
      <div className="space-y-3">
        <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-16" />
        <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded-full w-full" />
      </div>

      {/* 자간 조절 스켈레톤 */}
      <div className="space-y-3">
        <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-16" />
        <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded-full w-full" />
      </div>

      {/* 폰트 패밀리 선택 스켈레톤 */}
      <div className="space-y-3">
        <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-16" />
        <div className="grid grid-cols-2 gap-3">
          <div className="h-14 bg-gray-200 dark:bg-gray-700 rounded-xl" />
          <div className="h-14 bg-gray-200 dark:bg-gray-700 rounded-xl" />
          <div className="h-14 bg-gray-200 dark:bg-gray-700 rounded-xl" />
          <div className="h-14 bg-gray-200 dark:bg-gray-700 rounded-xl" />
        </div>
      </div>
    </div>
  );
};
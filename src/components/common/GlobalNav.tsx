import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useI18nStore } from '@/stores/i18nStore';
import { SearchBar, SearchResult } from '@/components/search/SearchBar';
import { searchContent } from '@/lib/searchService';
import { useNavigate } from 'react-router-dom';
import {
  AcademicCapIcon,
  UserIcon,
  ArrowRightStartOnRectangleIcon,
  Cog6ToothIcon,
} from '@heroicons/react/24/outline';

const GlobalNav: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t } = useI18nStore();

  // Hide GlobalNav on viewer pages (viewer has its own nav bar)
  if (location.pathname.startsWith('/viewer')) {
    return null;
  }

  const handleSearchResultClick = (result: SearchResult) => {
    if (result.type === 'conference' && result.conferenceId) {
      navigate(`/conferences/${result.conferenceId}`);
    } else if (result.type === 'publication' && result.publicationId) {
      navigate(`/viewer/${result.publicationId}`);
    }
  };

  return (
    <div className="sticky top-0 z-50 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border-b border-gray-200 dark:border-gray-700">
      <div className="container mx-auto px-4 py-3">
        <div className="flex items-center justify-between gap-4">
          {/* Left: Logo/App name */}
          <Link
            to="/"
            className="flex items-center gap-2 text-gray-900 dark:text-gray-100 hover:text-brand-primary dark:hover:text-brand-primary transition-colors flex-shrink-0"
          >
            <AcademicCapIcon className="w-6 h-6" />
            <span className="text-lg font-bold hidden sm:inline">학술회의 eBook</span>
          </Link>

          {/* Center: Search (desktop only) */}
          <div className="hidden md:block flex-1 max-w-xl mx-4">
            <SearchBar
              onSearch={searchContent}
              onResultClick={handleSearchResultClick}
              placeholder={t.conference.searchPlaceholder}
              showFilters={false}
            />
          </div>

          {/* Right: Navigation links */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <Link
              to="/mypage"
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              <UserIcon className="w-4 h-4" />
               <span className="hidden sm:inline">{t.nav.myPage}</span>
            </Link>

            {user ? (
              <>
                <Link
                  to="/admin"
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                >
                  <Cog6ToothIcon className="w-4 h-4" />
                   <span className="hidden sm:inline">{t.nav.admin}</span>
                </Link>
              </>
            ) : (
              <Link
                to="/login"
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
              >
                <ArrowRightStartOnRectangleIcon className="w-4 h-4" />
                <span className="hidden sm:inline">{t.nav.login}</span>
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default GlobalNav;

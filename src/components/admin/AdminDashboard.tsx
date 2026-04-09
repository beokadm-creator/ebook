import React, { useState } from 'react';
import { ConferenceManagement } from './ConferenceManagement';
import PublicationManagement from './PublicationManagement';
import {
  BuildingOfficeIcon,
  BookOpenIcon,
  XMarkIcon,
  Bars3Icon,
} from '@heroicons/react/24/outline';

interface AdminDashboardProps {
  onLogout?: () => void;
}

type TabType = 'conferences' | 'publications';

const AdminDashboard: React.FC<AdminDashboardProps> = ({ onLogout }) => {
  const [activeTab, setActiveTab] = useState<TabType>('conferences');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const menuItems: Array<{
    id: TabType;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
  }> = [
    { id: 'conferences', label: '학술대회', icon: BuildingOfficeIcon },
    { id: 'publications', label: '간행물', icon: BookOpenIcon },
  ];

  const renderContent = () => {
    switch (activeTab) {
      case 'conferences':
        return <ConferenceManagement />;
      case 'publications':
        return <PublicationManagement />;
      default:
        return null;
    }
  };

  const handleTabChange = (id: TabType) => {
    setActiveTab(id);
    setIsMobileMenuOpen(false);
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* 모바일 헤더 */}
      <div className="lg:hidden bg-white dark:bg-gray-800 border-b-2 border-gray-200 dark:border-gray-700 px-4 py-3 flex items-center justify-between sticky top-0 z-40">
        <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100">
          관리자
        </h1>
        <button
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
        >
          {isMobileMenuOpen ? (
            <XMarkIcon className="w-6 h-6 text-gray-600 dark:text-gray-400" />
          ) : (
            <Bars3Icon className="w-6 h-6 text-gray-600 dark:text-gray-400" />
          )}
        </button>
      </div>

      <div className="flex">
        {/* 사이드바 (데스크톱) */}
        <aside className="hidden lg:flex lg:w-64 flex-col bg-white dark:bg-gray-800 border-r-2 border-gray-200 dark:border-gray-700 min-h-screen sticky top-0">
          <div className="p-6 border-b-2 border-gray-200 dark:border-gray-700">
            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">
              관리자
            </h1>
          </div>

          <nav className="flex-1 p-4 space-y-2">
            {menuItems.map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                  activeTab === item.id
                    ? 'bg-brand-primary text-white'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                <item.icon className="w-5 h-5" />
                <span className="font-medium">{item.label}</span>
              </button>
            ))}
          </nav>

          <div className="p-4 border-t-2 border-gray-200 dark:border-gray-700">
            <button
              onClick={onLogout}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-red-100 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-xl hover:bg-red-200 dark:hover:bg-red-900/40 transition-colors font-medium"
            >
              로그아웃
            </button>
          </div>
        </aside>

        {/* 모바일 메뉴 */}
        {isMobileMenuOpen && (
          <div className="lg:hidden fixed inset-0 z-50 bg-black bg-opacity-50">
            <div className="bg-white dark:bg-gray-800 w-64 h-full overflow-y-auto">
              <div className="p-6 border-b-2 border-gray-200 dark:border-gray-700 flex items-center justify-between">
                <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                  관리자
                </h1>
                <button
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                >
                  <XMarkIcon className="w-6 h-6 text-gray-600 dark:text-gray-400" />
                </button>
              </div>

              <nav className="p-4 space-y-2">
                {menuItems.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => handleTabChange(item.id)}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                      activeTab === item.id
                        ? 'bg-brand-primary text-white'
                        : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                    }`}
                  >
                    <item.icon className="w-5 h-5" />
                    <span className="font-medium">{item.label}</span>
                  </button>
                ))}
              </nav>

              <div className="p-4 border-t-2 border-gray-200 dark:border-gray-700">
                <button
                  onClick={() => {
                    onLogout?.();
                    setIsMobileMenuOpen(false);
                  }}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-red-100 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-xl hover:bg-red-200 dark:hover:bg-red-900/40 transition-colors font-medium"
                >
                  로그아웃
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 메인 컨텐츠 */}
        <main className="flex-1 p-6 lg:p-8">
          {renderContent()}
        </main>
      </div>
    </div>
  );
};

export default AdminDashboard;

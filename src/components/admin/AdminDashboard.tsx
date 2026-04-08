import React, { useState, useEffect, useCallback } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { ConferenceManagement } from './ConferenceManagement';
import PublicationManagement from './PublicationManagement';
import AdManagement from './AdManagement';
import UserManagement from './UserManagement';
import { 
  HomeIcon,
  BuildingOfficeIcon,
  PaintBrushIcon,
  BookOpenIcon,
  UsersIcon,
  ChartBarIcon,
  Cog6ToothIcon,
  XMarkIcon,
  Bars3Icon,
  MegaphoneIcon
} from '@heroicons/react/24/outline';

interface DashboardStats {
  totalConferences: number;
  totalPublications: number;
  totalUsers: number;
  activeUsers: number;
}

interface AdminDashboardProps {
  onLogout?: () => void;
}

type TabType = 'overview' | 'conferences' | 'branding' | 'publications' | 'ads' | 'users' | 'analytics' | 'settings';

const AdminDashboard: React.FC<AdminDashboardProps> = ({ onLogout }) => {
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [stats, setStats] = useState<DashboardStats>({
    totalConferences: 0,
    totalPublications: 0,
    totalUsers: 0,
    activeUsers: 0,
  });

  const menuItems: Array<{
    id: TabType;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
  }> = [
    { id: 'overview', label: '대시보드', icon: HomeIcon },
    { id: 'conferences', label: '학술대회', icon: BuildingOfficeIcon },
    { id: 'branding', label: '브랜딩', icon: PaintBrushIcon },
    { id: 'publications', label: '간행물', icon: BookOpenIcon },
    { id: 'ads', label: '광고 관리', icon: MegaphoneIcon },
    { id: 'users', label: '사용자', icon: UsersIcon },
    { id: 'analytics', label: '분석', icon: ChartBarIcon },
    { id: 'settings', label: '설정', icon: Cog6ToothIcon }
  ];

  const loadStats = useCallback(async () => {
    try {
      const confSnap = await getDocs(collection(db, 'conferences'));
      const pubsSnap = await getDocs(collection(db, 'publications'));
      const usersSnap = await getDocs(collection(db, 'users'));
      setStats({
        totalConferences: confSnap.size,
        totalPublications: pubsSnap.size,
        totalUsers: usersSnap.size,
        activeUsers: usersSnap.size,
      });
    } catch (error) {
      console.error('Failed to load stats:', error);
    }
  }, []);

  useEffect(() => {
    // 통계 데이터 로드
    loadStats();
  }, [loadStats]);

  const StatCard: React.FC<{
    title: string;
    value: number;
    icon: React.ComponentType<{ className?: string }>;
    color: string;
  }> = ({ title, value, icon: Icon, color }) => (
    <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 border-2 border-gray-200 dark:border-gray-700">
      <div className="flex items-center justify-between mb-4">
        <div className={`p-3 rounded-xl ${color}`}>
          <Icon className="w-6 h-6 text-white" />
        </div>
        <span className="text-sm text-gray-500 dark:text-gray-400 font-medium">
          이번 달
        </span>
      </div>
      <h3 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-1">
        {value.toLocaleString()}
      </h3>
      <p className="text-sm text-gray-600 dark:text-gray-400 font-medium">
        {title}
      </p>
    </div>
  );

  const renderContent = () => {
    switch (activeTab) {
      case 'overview':
        return (
          <div className="space-y-6">
            {/* 통계 카드 */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard
                title="학술대회"
                value={stats.totalConferences}
                icon={BuildingOfficeIcon}
                color="bg-blue-600"
              />
              <StatCard
                title="간행물"
                value={stats.totalPublications}
                icon={BookOpenIcon}
                color="bg-green-600"
              />
              <StatCard
                title="전체 사용자"
                value={stats.totalUsers}
                icon={UsersIcon}
                color="bg-purple-600"
              />
              <StatCard
                title="활성 사용자"
                value={stats.activeUsers}
                icon={ChartBarIcon}
                color="bg-orange-600"
              />
            </div>

            {/* 최근 활동 */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700 p-6">
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4">
                최근 활동
              </h2>
              <div className="space-y-4">
                {[1, 2, 3, 4, 5].map((item) => (
                  <div key={item} className="flex items-center gap-4 p-4 bg-gray-50 dark:bg-gray-900 rounded-xl">
                    <div className="w-10 h-10 bg-brand-primary rounded-full flex items-center justify-center">
                      <span className="text-white font-bold text-sm">{item}</span>
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        최근 활동 내역 {item}
                      </p>
                      <p className="text-xs text-gray-600 dark:text-gray-400">
                        {item}시간 전
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );

      case 'conferences':
        return <ConferenceManagement />;

      case 'branding':
        return (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700 p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                브랜딩 설정
              </h2>
            </div>
            <div className="text-center py-12">
              <PaintBrushIcon className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600 dark:text-gray-400 mb-2">
                학술대회 관리에서 각 학술대회의 브랜딩을 설정할 수 있습니다.
              </p>
              <button
                type="button"
                onClick={() => setActiveTab('conferences')}
                className="mt-4 px-6 py-3 bg-brand-primary hover:bg-brand-primary-hover text-white rounded-xl font-medium transition-colors"
              >
                학술대회 관리로 이동
              </button>
            </div>
          </div>
        );

      case 'publications':
        return <PublicationManagement />;

      case 'ads':
        return (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700 p-6">
            <AdManagement />
          </div>
        );

      case 'users':
        return (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700 p-6">
            <UserManagement />
          </div>
        );

      case 'analytics':
        return (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700 p-6">
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-6">
              분석 및 통계
            </h2>
            <p className="text-gray-600 dark:text-gray-400 text-center py-12">
              분석 데이터가 여기에 표시됩니다.
            </p>
          </div>
        );

      case 'settings':
        return (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700 p-6">
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-6">
              시스템 설정
            </h2>
            <p className="text-gray-600 dark:text-gray-400 text-center py-12">
              설정 화면이 여기에 표시됩니다.
            </p>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* 모바일 헤더 */}
      <div className="lg:hidden bg-white dark:bg-gray-800 border-b-2 border-gray-200 dark:border-gray-700 px-4 py-3 flex items-center justify-between sticky top-0 z-40">
        <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100">
          Admin Dashboard
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
              Admin Dashboard
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
                  Admin Dashboard
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
                    onClick={() => {
                      setActiveTab(item.id);
                      setIsMobileMenuOpen(false);
                    }}
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
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import ProtectedRoute from './components/auth/ProtectedRoute';
import LoginPage from './components/auth/LoginPage';
import ConferenceList from './components/lobby/ConferenceList';
import ConferenceDetail from './components/lobby/ConferenceDetail';
import MyPage from './components/mypage/MyPage';
import AdminDashboard from './components/admin/AdminDashboard';
import { ConferenceManagement } from './components/admin/ConferenceManagement';
import { OfflineManager } from './components/offline/OfflineManager';
import PWAInstallPrompt from './components/common/PWAInstallPrompt';
import { ErrorBoundary } from './utils/errorHandling';
import GlobalNav from './components/common/GlobalNav';
import { ToastContainer } from './components/common/Toast';
import { useTheme } from './hooks/useTheme';

// Extracted pages
import ViewerPage from './pages/ViewerPage';
import EditorPage from './pages/EditorPage';

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<ConferenceList />} />
      <Route path="/conferences/:conferenceId" element={<ConferenceDetail />} />
      <Route path="/viewer/:publicationId" element={<ViewerPage />} />
      <Route path="/mypage" element={<MyPage />} />
      <Route path="/editor/:publicationId" element={<EditorPage />} />
      <Route path="/admin" element={<ProtectedRoute><AdminDashboard /></ProtectedRoute>} />
      <Route path="/admin/conferences" element={<ProtectedRoute><ConferenceManagement /></ProtectedRoute>} />
      <Route path="/admin/branding" element={
        <ProtectedRoute>
          <div className="container mx-auto px-4 py-8">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-8">
              브랜딩 설정은 학술대회 관리에서 각 학술대회별로 설정할 수 있습니다.
            </h1>
          </div>
        </ProtectedRoute>
      } />
      <Route path="*" element={
        <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4">
          <div className="text-center">
            <h1 className="text-4xl font-bold text-gray-900 dark:text-gray-100 mb-4">404</h1>
            <p className="text-gray-600 dark:text-gray-400 mb-6">페이지를 찾을 수 없습니다</p>
            <button type="button" onClick={() => { window.location.href = '/'; }} className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg">홈으로 이동</button>
          </div>
        </div>
      } />
    </Routes>
  );
}

function App() {
  useTheme();

  return (
    <BrowserRouter>
      <AuthProvider>
        <ErrorBoundary>
          <OfflineManager>
            <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
              <GlobalNav />
              <PWAInstallPrompt />
              <AppRoutes />
              <ToastContainer />
            </div>
          </OfflineManager>
        </ErrorBoundary>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;

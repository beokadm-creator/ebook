import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { parseFirebaseError, getSafeErrorMessage, logError } from '@/utils/errorHandler';
import {
  EnvelopeIcon,
  LockClosedIcon
} from '@heroicons/react/24/outline';

const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const { signIn, loading: authLoading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await signIn(email, password);
      navigate('/');
    } catch (err) {
      logError(err, 'LoginPage - handleSubmit');
      const parsedError = parseFirebaseError(err);
      setError(getSafeErrorMessage(parsedError));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-[#12172b] px-4 py-12 relative">
      <div className="relative max-w-md w-full space-y-6 bg-white dark:bg-gray-900 rounded-3xl p-8 md:p-10 shadow-sm border border-gray-100 dark:border-gray-800">
        {/* 헤더 - 학술적 권위 */}
        <div className="text-center space-y-4">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[#1a2744] dark:bg-[#243660] shadow-sm">
            <LockClosedIcon className="w-7 h-7 text-white" />
          </div>
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-[#1a2744] dark:text-white mb-1">
              관리자 로그인
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 font-normal">
              초록집 관리 시스템
            </p>
          </div>
        </div>

        {/* 로그인 폼 */}
        <form onSubmit={handleSubmit} className="space-y-6 mt-10">
          {/* 에러 메시지 */}
          {error && (
            <div className="bg-red-50/80 dark:bg-red-900/20 backdrop-blur-sm border border-red-200 dark:border-red-800/50 rounded-2xl p-4 flex items-center gap-3 animate-fade-in">
              <div className="w-2 h-2 rounded-full bg-red-600 dark:bg-red-400"></div>
              <p className="text-sm font-medium text-red-800 dark:text-red-400">{error}</p>
            </div>
          )}

          <div className="space-y-5">
            {/* 이메일 */}
            <div>
              <label htmlFor="email" className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2 uppercase tracking-wider text-xs">
                이메일
              </label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none transition-colors group-focus-within:text-brand-primary">
                  <EnvelopeIcon className="h-5 w-5 text-gray-400 group-focus-within:text-brand-primary transition-colors" />
                </div>
                <input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="block w-full pl-12 pr-4 py-4 bg-white/50 dark:bg-gray-900/50 border-2 border-transparent focus:border-brand-primary focus:bg-white dark:focus:bg-gray-950 rounded-2xl transition-all duration-200 text-gray-900 dark:text-white font-medium outline-none placeholder-gray-400 dark:placeholder-gray-500 shadow-sm"
                  placeholder="your@email.com"
                />
              </div>
            </div>

            {/* 비밀번호 */}
            <div>
              <label htmlFor="password" className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2 uppercase tracking-wider text-xs">
                비밀번호
              </label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none transition-colors group-focus-within:text-brand-primary">
                  <LockClosedIcon className="h-5 w-5 text-gray-400 group-focus-within:text-brand-primary transition-colors" />
                </div>
                <input
                  id="password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="block w-full pl-12 pr-4 py-4 bg-white/50 dark:bg-gray-900/50 border-2 border-transparent focus:border-brand-primary focus:bg-white dark:focus:bg-gray-950 rounded-2xl transition-all duration-200 text-gray-900 dark:text-white font-medium outline-none placeholder-gray-400 dark:placeholder-gray-500 shadow-sm"
                  placeholder="••••••••"
                />
              </div>
            </div>
          </div>

          {/* 로그인 버튼 */}
          <button
            type="submit"
            disabled={loading || authLoading}
            className="w-full flex justify-center py-4 px-4 rounded-2xl font-bold text-white bg-gradient-to-r from-brand-primary to-brand-secondary hover:from-brand-primary-hover hover:to-brand-secondary focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-primary focus:ring-offset-white dark:focus:ring-offset-gray-900 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-lg shadow-brand-primary/25 hover:shadow-xl hover:shadow-brand-primary/30 transform hover:-translate-y-0.5 active:translate-y-0"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                로그인 중...
              </span>
            ) : (
              '로그인'
            )}
          </button>
        </form>
      </div>
    </div>
  );
};

export default LoginPage;

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import {
  User,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  UserCredential
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';

interface AuthUser extends User {
  role: 'admin' | null;
}

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  role: 'admin' | null;
  signIn: (email: string, password: string) => Promise<UserCredential>;
  signOut: () => Promise<void>;
  hasRole: (requiredRole: 'admin') => boolean;
  hasAnyRole: (roles: 'admin'[]) => boolean;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<'admin' | null>(null);

  const refreshUser = async () => {
    if (auth.currentUser) {
      try {
        await auth.currentUser.getIdTokenResult(true);
        const userDoc = await getDoc(doc(db, 'users', auth.currentUser.uid));
        if (userDoc.exists()) {
          const userData = userDoc.data();
          const isAdmin = userData.role === 'admin';
          setUser({
            ...auth.currentUser,
            role: isAdmin ? 'admin' : null
          });
          setRole(isAdmin ? 'admin' : null);
        }
      } catch (error) {
        console.error('Error refreshing user:', error);
      }
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        try {
          const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));

          if (userDoc.exists()) {
            const userData = userDoc.data();
            const isAdmin = userData.role === 'admin';

            setUser({
              ...firebaseUser,
              role: isAdmin ? 'admin' : null
            });
            setRole(isAdmin ? 'admin' : null);
          } else {
            // 사용자 문서가 없으면 첫 로그인 시 자동 생성
            await setDoc(doc(db, 'users', firebaseUser.uid), {
              email: firebaseUser.email,
              role: 'admin', // 첫 사용자는 자동으로 admin
              displayName: firebaseUser.displayName || '',
              createdAt: new Date().toISOString(),
            });
            setUser({
              ...firebaseUser,
              role: 'admin'
            });
            setRole('admin');
          }
        } catch (error) {
          console.error('Error fetching user data:', error);
          setUser(firebaseUser as AuthUser);
          setRole(null);
        }
      } else {
        setUser(null);
        setRole(null);
      }
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const signIn = async (email: string, password: string) => {
    const result = await signInWithEmailAndPassword(auth, email, password);
    return result;
  };

  const signOut = async () => {
    await firebaseSignOut(auth);
    setUser(null);
    setRole(null);
  };

  const hasRole = (requiredRole: 'admin'): boolean => {
    return role === requiredRole;
  };

  const hasAnyRole = (roles: 'admin'[]): boolean => {
    return roles.some(r => hasRole(r));
  };

  const value: AuthContextType = {
    user,
    loading,
    role,
    signIn,
    signOut,
    hasRole,
    hasAnyRole,
    refreshUser
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

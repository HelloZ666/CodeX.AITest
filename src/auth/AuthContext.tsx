import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Spin } from 'antd';
import { useQueryClient } from '@tanstack/react-query';
import type { AuthUser } from '../types';
import {
  AUTH_EXPIRED_EVENT,
  extractApiErrorMessage,
  getCurrentUser,
  login as loginRequest,
  logout as logoutRequest,
} from '../utils/api';

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  authenticated: boolean;
  login: (username: string, password: string) => Promise<AuthUser>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<AuthUser | null>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const FullScreenLoading: React.FC = () => (
  <div
    style={{
      minHeight: 'var(--app-viewport-height, 100vh)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #f0f5ff 0%, #ffffff 45%, #e6f4ff 100%)',
    }}
  >
    <Spin size="large" />
  </div>
);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    try {
      const currentUser = await getCurrentUser();
      setUser(currentUser);
      return currentUser;
    } catch {
      setUser(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshUser();
  }, [refreshUser]);

  useEffect(() => {
    const handleUnauthorized = () => {
      setUser(null);
      queryClient.clear();
      setLoading(false);
    };

    window.addEventListener(AUTH_EXPIRED_EVENT, handleUnauthorized);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, handleUnauthorized);
  }, [queryClient]);

  const login = useCallback(async (username: string, password: string) => {
    try {
      const currentUser = await loginRequest(username, password);
      setUser(currentUser);
      return currentUser;
    } catch (error) {
      throw new Error(extractApiErrorMessage(error, '登录失败，请稍后重试'));
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await logoutRequest();
    } finally {
      setUser(null);
      queryClient.clear();
    }
  }, [queryClient]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      authenticated: Boolean(user),
      login,
      logout,
      refreshUser,
    }),
    [user, loading, login, logout, refreshUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}

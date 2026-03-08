import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { Result, Button } from 'antd';
import { useAuth, FullScreenLoading } from './AuthContext';

export const RequireAuth: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
  const { loading, authenticated } = useAuth();
  const location = useLocation();

  if (loading) {
    return <FullScreenLoading />;
  }

  if (!authenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return children ? <>{children}</> : <Outlet />;
};

export const RedirectAuthenticated: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
  const { loading, authenticated } = useAuth();

  if (loading) {
    return <FullScreenLoading />;
  }

  if (authenticated) {
    return <Navigate to="/" replace />;
  }

  return children ? <>{children}</> : <Outlet />;
};

export const RequireAdmin: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
  const { loading, user } = useAuth();

  if (loading) {
    return <FullScreenLoading />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (user.role !== 'admin') {
    return (
      <Result
        status="403"
        title="403"
        subTitle="您没有访问该页面的权限"
        extra={<Button type="primary" href="/">返回首页</Button>}
      />
    );
  }

  return children ? <>{children}</> : <Outlet />;
};

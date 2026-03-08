import React from 'react';
import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import AppLayout from './components/Layout/AppLayout';
import ErrorBoundary from './components/ErrorBoundary/ErrorBoundary';
import { AuthProvider } from './auth/AuthContext';
import { RedirectAuthenticated, RequireAdmin, RequireAuth } from './auth/RouteGuards';
import DefectAnalysisPage from './pages/DefectAnalysis';
import HistoryPage from './pages/History';
import IssueAnalysisPage from './pages/IssueAnalysis';
import LoginPage from './pages/Login';
import ProductionIssueFilesPage from './pages/ProductionIssueFiles';
import ProjectDetailPage from './pages/ProjectDetail';
import ProjectManagementPage from './pages/ProjectManagement';
import ProjectsPage from './pages/Projects';
import RequirementAnalysisHistoryPage from './pages/RequirementAnalysisHistory';
import RequirementAnalysisPage from './pages/RequirementAnalysis';
import RequirementAnalysisRulesPage from './pages/RequirementAnalysisRules';
import TestIssueFilesPage from './pages/TestIssueFiles';
import UploadPage from './pages/Upload';
import UserManagementPage from './pages/UserManagement';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

const ProtectedShell: React.FC = () => (
  <RequireAuth>
    <AppLayout>
      <Outlet />
    </AppLayout>
  </RequireAuth>
);

const App: React.FC = () => {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ConfigProvider locale={zhCN}>
          <BrowserRouter>
            <AuthProvider>
              <Routes>
                <Route
                  path="/login"
                  element={(
                    <RedirectAuthenticated>
                      <LoginPage />
                    </RedirectAuthenticated>
                  )}
                />
                <Route element={<ProtectedShell />}>
                  <Route path="/" element={<UploadPage />} />
                  <Route path="/issue-analysis" element={<IssueAnalysisPage />} />
                  <Route path="/defect-analysis" element={<DefectAnalysisPage />} />
                  <Route path="/requirement-analysis" element={<RequirementAnalysisPage />} />
                  <Route path="/requirement-analysis/history" element={<RequirementAnalysisHistoryPage />} />
                  <Route path="/requirement-analysis/rules" element={<RequirementAnalysisRulesPage />} />
                  <Route path="/project-management" element={<ProjectManagementPage />} />
                  <Route path="/production-issues" element={<ProductionIssueFilesPage />} />
                  <Route path="/test-issues" element={<TestIssueFilesPage />} />
                  <Route path="/projects" element={<ProjectsPage />} />
                  <Route path="/project/:id" element={<ProjectDetailPage />} />
                  <Route path="/history" element={<HistoryPage />} />
                  <Route
                    path="/users"
                    element={(
                      <RequireAdmin>
                        <UserManagementPage />
                      </RequireAdmin>
                    )}
                  />
                </Route>
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </AuthProvider>
          </BrowserRouter>
        </ConfigProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
};

export default App;

import React from 'react';
import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ConfigProvider } from 'antd';
import type { ThemeConfig } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import AppLayout from './components/Layout/AppLayout';
import ErrorBoundary from './components/ErrorBoundary/ErrorBoundary';
import { AuthProvider } from './auth/AuthContext';
import { RedirectAuthenticated, RequireAdmin, RequireAuth } from './auth/RouteGuards';
import AIAgentPage from './pages/AIAgent';
import ApiAutomationPage from './pages/ApiAutomation';
import DefectAnalysisPage from './pages/DefectAnalysis';
import ConfigRequirementDocumentsPage from './pages/ConfigRequirementDocuments';
import ConfigTestCasesPage from './pages/ConfigTestCases';
import HistoryPage from './pages/History';
import IssueAnalysisPage from './pages/IssueAnalysis';
import CaseQualityPage from './pages/CaseQuality';
import CaseQualityRecordDetailPage from './pages/CaseQualityRecordDetail';
import CaseQualityRecordsPage from './pages/CaseQualityRecords';
import LoginPage from './pages/Login';
import OperationLogsPage from './pages/OperationLogs';
import ProductionIssueFilesPage from './pages/ProductionIssueFiles';
import ProjectDetailPage from './pages/ProjectDetail';
import ProjectManagementPage from './pages/ProjectManagement';
import ProjectsPage from './pages/Projects';
import PromptTemplatesPage from './pages/PromptTemplates';
import PerformanceAnalysisPage from './pages/PerformanceAnalysis';
import RequirementAnalysisHistoryPage from './pages/RequirementAnalysisHistory';
import RequirementAnalysisPage from './pages/RequirementAnalysis';
import RequirementMappingsPage from './pages/RequirementMappings';
import TestIssueFilesPage from './pages/TestIssueFiles';
import UploadPage from './pages/Upload';
import UserManagementPage from './pages/UserManagement';

const DEFAULT_LANDING_ROUTE = '/functional-testing/case-quality';
const CASE_GENERATION_ROUTE = '/functional-testing/case-generation';
const TEST_CASES_ROUTE = '/functional-testing/test-cases';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

const appTheme: ThemeConfig = {
  token: {
    colorPrimary: '#2A6DF4',
    colorInfo: '#2A6DF4',
    colorSuccess: '#2F7FF7',
    colorWarning: '#5B8CFF',
    colorError: '#E24A4A',
    colorTextBase: '#1E293B',
    colorBgBase: '#EFF6FF',
    borderRadius: 20,
    fontFamily: '"PingFang SC", "Noto Sans SC", "Microsoft YaHei", sans-serif',
    controlHeight: 42,
  },
};

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
        <ConfigProvider locale={zhCN} theme={appTheme}>
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
                  <Route path="/" element={<Navigate to={DEFAULT_LANDING_ROUTE} replace />} />
                  <Route path={CASE_GENERATION_ROUTE} element={<UploadPage />} />
                  <Route path={TEST_CASES_ROUTE} element={<Navigate to={CASE_GENERATION_ROUTE} replace />} />
                  <Route path="/automation-testing/api" element={<ApiAutomationPage />} />
                  <Route path="/ai-tools/agents" element={<AIAgentPage />} />
                  <Route path="/functional-testing/case-quality" element={<CaseQualityPage />} />
                  <Route path="/functional-testing/records" element={<CaseQualityRecordsPage />} />
                  <Route path="/functional-testing/records/:id" element={<CaseQualityRecordDetailPage />} />
                  <Route
                    path="/performance-analysis"
                    element={(
                      <RequireAdmin>
                        <PerformanceAnalysisPage />
                      </RequireAdmin>
                    )}
                  />
                  <Route path="/issue-analysis" element={<IssueAnalysisPage />} />
                  <Route path="/defect-analysis" element={<DefectAnalysisPage />} />
                  <Route path="/requirement-analysis" element={<RequirementAnalysisPage />} />
                  <Route path="/requirement-analysis/history" element={<RequirementAnalysisHistoryPage />} />
                  <Route path="/project-management" element={<ProjectManagementPage />} />
                  <Route path="/production-issues" element={<ProductionIssueFilesPage />} />
                  <Route path="/test-issues" element={<TestIssueFilesPage />} />
                  <Route path="/config-management/requirement-documents" element={<ConfigRequirementDocumentsPage />} />
                  <Route path="/config-management/test-cases" element={<ConfigTestCasesPage />} />
                  <Route
                    path="/config-management/prompt-templates"
                    element={(
                      <RequireAdmin>
                        <PromptTemplatesPage />
                      </RequireAdmin>
                    )}
                  />
                  <Route path="/requirement-mappings" element={<RequirementMappingsPage />} />
                  <Route path="/projects" element={<ProjectsPage />} />
                  <Route path="/project/:id" element={<ProjectDetailPage />} />
                  <Route path="/history" element={<HistoryPage />} />
                  <Route
                    path="/operation-logs"
                    element={(
                      <RequireAdmin>
                        <OperationLogsPage />
                      </RequireAdmin>
                    )}
                  />
                  <Route
                    path="/users"
                    element={(
                      <RequireAdmin>
                        <UserManagementPage />
                      </RequireAdmin>
                    )}
                  />
                </Route>
                <Route path="*" element={<Navigate to={DEFAULT_LANDING_ROUTE} replace />} />
              </Routes>
            </AuthProvider>
          </BrowserRouter>
        </ConfigProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
};

export default App;

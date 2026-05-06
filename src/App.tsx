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
import CaseQualityPage from './pages/CaseQuality';
import CaseQualityRecordDetailPage from './pages/CaseQualityRecordDetail';
import CaseQualityRecordsPage from './pages/CaseQualityRecords';
import ConfigRequirementDocumentsPage from './pages/ConfigRequirementDocuments';
import ConfigTestCasesPage from './pages/ConfigTestCases';
import DatabaseConfigsPage from './pages/DatabaseConfigs';
import DefectAnalysisPage from './pages/DefectAnalysis';
import EndToEndTestingPage from './pages/EndToEndTesting';
import HistoryPage from './pages/History';
import IssueAnalysisPage from './pages/IssueAnalysis';
import KnowledgeBasePlaceholderPage from './pages/KnowledgeBasePlaceholder';
import KnowledgeSystemOverviewPage from './pages/KnowledgeSystemOverview';
import KnowledgeSystemOverviewEditorPage from './pages/KnowledgeSystemOverviewEditor';
import LoginPage from './pages/Login';
import OperationLogsPage from './pages/OperationLogs';
import PerformanceAnalysisPage from './pages/PerformanceAnalysis';
import ProductionIssueFilesPage from './pages/ProductionIssueFiles';
import ProjectDetailPage from './pages/ProjectDetail';
import ProjectManagementPage from './pages/ProjectManagement';
import ProjectsPage from './pages/Projects';
import PromptTemplatesPage from './pages/PromptTemplates';
import RegressionValidationPage from './pages/RegressionValidation';
import RequirementAnalysisHistoryPage from './pages/RequirementAnalysisHistory';
import RequirementAnalysisPage from './pages/RequirementAnalysis';
import RequirementMappingsPage from './pages/RequirementMappings';
import TestIssueFilesPage from './pages/TestIssueFiles';
import UploadPage from './pages/Upload';
import UserManagementPage from './pages/UserManagement';

const DEFAULT_LANDING_ROUTE = '/functional-testing/case-quality';
const CASE_GENERATION_ROUTE = '/functional-testing/case-generation';
const TEST_CASES_ROUTE = '/functional-testing/test-cases';
const KNOWLEDGE_SYSTEM_OVERVIEW_ROUTE = '/knowledge-base/system-overview';
const KNOWLEDGE_TEST_REQUIREMENTS_ROUTE = '/knowledge-base/test-requirements';
const KNOWLEDGE_TEST_CASES_ROUTE = '/knowledge-base/test-cases';
const KNOWLEDGE_BUSINESS_RULES_ROUTE = '/knowledge-base/business-rules';
const KNOWLEDGE_COMMON_CASE_TEMPLATES_ROUTE = '/knowledge-base/common-case-templates';

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
                  <Route path="/ai-tools/regression-validation" element={<RegressionValidationPage />} />
                  <Route path="/ai-tools/e2e-testing" element={<EndToEndTestingPage />} />
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
                  <Route path={KNOWLEDGE_SYSTEM_OVERVIEW_ROUTE} element={<KnowledgeSystemOverviewPage />} />
                  <Route path="/knowledge-base/system-overview/:overviewId" element={<KnowledgeSystemOverviewEditorPage />} />
                  <Route path={KNOWLEDGE_TEST_REQUIREMENTS_ROUTE} element={<ConfigRequirementDocumentsPage />} />
                  <Route path={KNOWLEDGE_TEST_CASES_ROUTE} element={<ConfigTestCasesPage />} />
                  <Route
                    path={KNOWLEDGE_BUSINESS_RULES_ROUTE}
                    element={(
                      <KnowledgeBasePlaceholderPage
                        title="业务规则"
                        description="当前用于占位业务规则页面，后续补充领域规则沉淀、检索与维护能力。"
                      />
                    )}
                  />
                  <Route
                    path={KNOWLEDGE_COMMON_CASE_TEMPLATES_ROUTE}
                    element={(
                      <KnowledgeBasePlaceholderPage
                        title="通用案例模板"
                        description="当前用于占位通用案例模板页面，后续补充模板沉淀、复用与维护能力。"
                      />
                    )}
                  />
                  <Route path="/project-management" element={<ProjectManagementPage />} />
                  <Route path="/production-issues" element={<ProductionIssueFilesPage />} />
                  <Route path="/test-issues" element={<TestIssueFilesPage />} />
                  <Route
                    path="/config-management/requirement-documents"
                    element={<Navigate to={KNOWLEDGE_TEST_REQUIREMENTS_ROUTE} replace />}
                  />
                  <Route
                    path="/config-management/test-cases"
                    element={<Navigate to={KNOWLEDGE_TEST_CASES_ROUTE} replace />}
                  />
                  <Route
                    path="/config-management/prompt-templates"
                    element={(
                      <RequireAdmin>
                        <PromptTemplatesPage />
                      </RequireAdmin>
                    )}
                  />
                  <Route path="/config-management/database-configs" element={<DatabaseConfigsPage />} />
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

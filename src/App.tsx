import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import AppLayout from './components/Layout/AppLayout';
import UploadPage from './pages/Upload';
import ProjectsPage from './pages/Projects';
import ProjectDetailPage from './pages/ProjectDetail';
import HistoryPage from './pages/History';
import IssueAnalysisPage from './pages/IssueAnalysis';
import DefectAnalysisPage from './pages/DefectAnalysis';
import ErrorBoundary from './components/ErrorBoundary/ErrorBoundary';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

const App: React.FC = () => {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ConfigProvider locale={zhCN}>
          <BrowserRouter>
            <AppLayout>
              <Routes>
                <Route path="/" element={<UploadPage />} />
                <Route path="/issue-analysis" element={<IssueAnalysisPage />} />
                <Route path="/defect-analysis" element={<DefectAnalysisPage />} />
                <Route path="/projects" element={<ProjectsPage />} />
                <Route path="/project/:id" element={<ProjectDetailPage />} />
                <Route path="/history" element={<HistoryPage />} />
              </Routes>
            </AppLayout>
          </BrowserRouter>
        </ConfigProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
};

export default App;

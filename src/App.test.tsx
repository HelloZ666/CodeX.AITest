import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from './App';

vi.mock('./auth/AuthContext', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('./auth/RouteGuards', () => ({
  RequireAuth: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  RedirectAuthenticated: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  RequireAdmin: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('./components/ErrorBoundary/ErrorBoundary', () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('./components/Layout/AppLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('./pages/ApiAutomation', () => ({ default: () => <div>接口自动化页</div> }));
vi.mock('./pages/CaseQuality', () => ({ default: () => <div>案例质检页</div> }));
vi.mock('./pages/CaseQualityRecordDetail', () => ({ default: () => <div>案例质检详情页</div> }));
vi.mock('./pages/CaseQualityRecords', () => ({ default: () => <div>案例质检记录页</div> }));
vi.mock('./pages/DefectAnalysis', () => ({ default: () => <div>测试问题分析页</div> }));
vi.mock('./pages/History', () => ({ default: () => <div>历史页</div> }));
vi.mock('./pages/IssueAnalysis', () => ({ default: () => <div>生产问题分析页</div> }));
vi.mock('./pages/Login', () => ({ default: () => <div>登录页</div> }));
vi.mock('./pages/ProductionIssueFiles', () => ({ default: () => <div>生产问题文件页</div> }));
vi.mock('./pages/ProjectDetail', () => ({ default: () => <div>项目详情页</div> }));
vi.mock('./pages/ProjectManagement', () => ({ default: () => <div>项目管理页</div> }));
vi.mock('./pages/Projects', () => ({ default: () => <div>项目列表页</div> }));
vi.mock('./pages/RequirementAnalysis', () => ({ default: () => <div>需求分析页</div> }));
vi.mock('./pages/RequirementAnalysisHistory', () => ({ default: () => <div>需求分析历史页</div> }));
vi.mock('./pages/RequirementMappings', () => ({ default: () => <div>需求映射页</div> }));
vi.mock('./pages/TestIssueFiles', () => ({ default: () => <div>测试问题文件页</div> }));
vi.mock('./pages/Upload', () => ({ default: () => <div>案例生成页</div> }));
vi.mock('./pages/UserManagement', () => ({ default: () => <div>用户管理页</div> }));

afterEach(() => {
  window.history.replaceState({}, '', '/');
});

describe('App routes', () => {
  it('redirects the root route to the case quality page', async () => {
    window.history.replaceState({}, '', '/');

    render(<App />);

    expect(await screen.findByText('案例质检页')).toBeInTheDocument();
  });

  it('keeps the case generation page on its own functional testing route', async () => {
    window.history.replaceState({}, '', '/functional-testing/case-generation');

    render(<App />);

    expect(await screen.findByText('案例生成页')).toBeInTheDocument();
  });
});

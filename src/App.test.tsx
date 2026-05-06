import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from './App';

vi.mock('./auth/AuthContext', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('./auth/RouteGuards', () => ({
  RequireAuth: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  RedirectAuthenticated: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  RequireAdmin: ({ children }: { children: React.ReactNode }) => <div data-testid="require-admin">{children}</div>,
}));

vi.mock('./components/ErrorBoundary/ErrorBoundary', () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('./components/Layout/AppLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('./pages/AIAgent', () => ({ default: () => <div>AI助手页</div> }));
vi.mock('./pages/ApiAutomation', () => ({ default: () => <div>接口自动化页</div> }));
vi.mock('./pages/CaseQuality', () => ({ default: () => <div>案例质检页</div> }));
vi.mock('./pages/CaseQualityRecordDetail', () => ({ default: () => <div>案例质检详情页</div> }));
vi.mock('./pages/CaseQualityRecords', () => ({ default: () => <div>案例质检记录页</div> }));
vi.mock('./pages/ConfigRequirementDocuments', () => ({ default: () => <div>测试需求页</div> }));
vi.mock('./pages/ConfigTestCases', () => ({ default: () => <div>测试案例页</div> }));
vi.mock('./pages/DatabaseConfigs', () => ({ default: () => <div>数据库配置页</div> }));
vi.mock('./pages/DefectAnalysis', () => ({ default: () => <div>测试问题分析页</div> }));
vi.mock('./pages/EndToEndTesting', () => ({ default: () => <div>端到端测试页</div> }));
vi.mock('./pages/History', () => ({ default: () => <div>历史页</div> }));
vi.mock('./pages/IssueAnalysis', () => ({ default: () => <div>生产问题分析页</div> }));
vi.mock('./pages/KnowledgeBasePlaceholder', () => ({ default: ({ title }: { title: string }) => <div>{title}页</div> }));
vi.mock('./pages/KnowledgeSystemOverview', () => ({ default: () => <div>系统功能全景图列表页</div> }));
vi.mock('./pages/KnowledgeSystemOverviewEditor', () => ({ default: () => <div>系统功能全景图编辑页</div> }));
vi.mock('./pages/Login', () => ({ default: () => <div>登录页</div> }));
vi.mock('./pages/OperationLogs', () => ({ default: () => <div>操作记录页</div> }));
vi.mock('./pages/PerformanceAnalysis', () => ({ default: () => <div>效能分析页</div> }));
vi.mock('./pages/ProductionIssueFiles', () => ({ default: () => <div>生产问题文件页</div> }));
vi.mock('./pages/ProjectDetail', () => ({ default: () => <div>项目详情页</div> }));
vi.mock('./pages/ProjectManagement', () => ({ default: () => <div>项目管理页</div> }));
vi.mock('./pages/Projects', () => ({ default: () => <div>项目列表页</div> }));
vi.mock('./pages/PromptTemplates', () => ({ default: () => <div>提示词管理页</div> }));
vi.mock('./pages/RegressionValidation', () => ({ default: () => <div>回归验证页</div> }));
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

  it('redirects the legacy test cases route to the case generation page', async () => {
    window.history.replaceState({}, '', '/functional-testing/test-cases');

    render(<App />);

    expect(await screen.findByText('案例生成页')).toBeInTheDocument();
  });

  it('routes operation logs to the admin page', async () => {
    window.history.replaceState({}, '', '/operation-logs');

    render(<App />);

    expect(await screen.findByText('操作记录页')).toBeInTheDocument();
  });

  it('routes ai agent page correctly', async () => {
    window.history.replaceState({}, '', '/ai-tools/agents');

    render(<App />);

    expect(await screen.findByText('AI助手页')).toBeInTheDocument();
  });

  it('routes prompt template page correctly', async () => {
    window.history.replaceState({}, '', '/config-management/prompt-templates');

    render(<App />);

    expect(await screen.findByText('提示词管理页')).toBeInTheDocument();
  });

  it('routes database config page correctly', async () => {
    window.history.replaceState({}, '', '/config-management/database-configs');

    render(<App />);

    expect(await screen.findByText('数据库配置页')).toBeInTheDocument();
  });

  it('routes regression validation page correctly', async () => {
    window.history.replaceState({}, '', '/ai-tools/regression-validation');

    render(<App />);

    expect(await screen.findByText('回归验证页')).toBeInTheDocument();
  });

  it('routes e2e testing page correctly', async () => {
    window.history.replaceState({}, '', '/ai-tools/e2e-testing');

    render(<App />);

    expect(await screen.findByText('端到端测试页')).toBeInTheDocument();
  });

  it('routes knowledge system overview list page correctly', async () => {
    window.history.replaceState({}, '', '/knowledge-base/system-overview');

    render(<App />);

    expect(await screen.findByText('系统功能全景图列表页')).toBeInTheDocument();
  });

  it('routes knowledge system overview editor page correctly', async () => {
    window.history.replaceState({}, '', '/knowledge-base/system-overview/9');

    render(<App />);

    expect(await screen.findByText('系统功能全景图编辑页')).toBeInTheDocument();
  });

  it('routes knowledge test requirements page correctly', async () => {
    window.history.replaceState({}, '', '/knowledge-base/test-requirements');

    render(<App />);

    expect(await screen.findByText('测试需求页')).toBeInTheDocument();
  });

  it('routes knowledge test cases page correctly', async () => {
    window.history.replaceState({}, '', '/knowledge-base/test-cases');

    render(<App />);

    expect(await screen.findByText('测试案例页')).toBeInTheDocument();
  });

  it('redirects legacy config requirement documents route to the knowledge test requirements page', async () => {
    window.history.replaceState({}, '', '/config-management/requirement-documents');

    render(<App />);

    expect(await screen.findByText('测试需求页')).toBeInTheDocument();
  });

  it('redirects legacy config test cases route to the knowledge test cases page', async () => {
    window.history.replaceState({}, '', '/config-management/test-cases');

    render(<App />);

    expect(await screen.findByText('测试案例页')).toBeInTheDocument();
  });

  it('protects prompt template page with admin guard', async () => {
    window.history.replaceState({}, '', '/config-management/prompt-templates');

    render(<App />);

    expect(await screen.findByTestId('require-admin')).toHaveTextContent('提示词管理页');
  });
});

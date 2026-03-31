import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { Mock } from 'vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import UploadPage from './Upload';

vi.mock('../utils/api', () => ({
  extractApiErrorMessage: vi.fn((error: Error, fallback: string) => error.message || fallback),
  generateFunctionalTestCases: vi.fn(),
  listPromptTemplates: vi.fn(),
}));

vi.mock('../utils/exportTestCases', () => ({
  exportFunctionalTestCasesCsv: vi.fn(),
}));

import { exportFunctionalTestCasesCsv } from '../utils/exportTestCases';
import { generateFunctionalTestCases, listPromptTemplates } from '../utils/api';

function renderWithProviders() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <UploadPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('UploadPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    (listPromptTemplates as Mock).mockResolvedValue([
      {
        id: 1,
        agent_key: 'requirement',
        name: '需求分析师',
        prompt: '请优先关注需求主流程、校验规则和界面提示。',
        created_at: '2026-03-31 00:00:00',
        updated_at: '2026-03-31 00:00:00',
      },
      {
        id: 2,
        agent_key: 'general',
        name: '通用助手',
        prompt: '通用提示词',
        created_at: '2026-03-31 00:00:00',
        updated_at: '2026-03-31 00:00:00',
      },
    ]);

    (generateFunctionalTestCases as Mock).mockResolvedValue({
      success: true,
      data: {
        file_name: 'requirement.docx',
        prompt_template_key: 'requirement',
        summary: '覆盖了资格校验主流程、异常拦截和界面提示等场景。',
        generation_mode: 'ai',
        provider: 'DeepSeek',
        ai_cost: { total_tokens: 180 },
        error: null,
        total: 2,
        cases: [
          {
            case_id: 'TC-001',
            description: '资格校验失败时禁止提交',
            steps: '1. 打开投保页面\n2. 输入不满足资格条件的数据\n3. 点击提交',
            expected_result: '系统阻止提交，并提示资格校验失败原因。',
            source: 'ai',
          },
          {
            case_id: 'TC-002',
            description: '资格校验失败时展示显著提示',
            steps: '1. 进入投保页面\n2. 触发资格校验失败\n3. 观察页面文案和弹窗',
            expected_result: '页面展示显著提示文案，并弹出引导说明。',
            source: 'ai',
          },
        ],
      },
    });
  });

  it('selects requirement prompt by default, uploads docx document, and exports generated cases', async () => {
    const { container } = renderWithProviders();

    expect(await screen.findByText('案例生成工作台')).toBeInTheDocument();
    expect(await screen.findByText('已选：requirement')).toBeInTheDocument();
    expect(screen.queryByText('默认推荐')).not.toBeInTheDocument();
    expect(screen.getAllByText('仅支持 .docx')).toHaveLength(1);
    expect(
      screen.queryByText('选择配置管理中的提示词，上传 `.docx` 需求文档，系统会自动生成结构化测试用例并支持导出。'),
    ).not.toBeInTheDocument();

    const fileInput = container.querySelector('input[type="file"]') ?? document.body.querySelector('input[type="file"]');
    expect(fileInput).not.toBeNull();

    const requirementFile = new File(['docx'], 'requirement.docx', {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });

    await act(async () => {
      fireEvent.change(fileInput as Element, { target: { files: [requirementFile] } });
    });

    expect(await screen.findByText('requirement.docx')).toBeInTheDocument();

    const generateButton = screen.getByRole('button', { name: '生成测试用例' });
    await waitFor(() => {
      expect(generateButton).toBeEnabled();
    });

    await act(async () => {
      fireEvent.click(generateButton);
    });

    await waitFor(() => {
      expect(generateFunctionalTestCases).toHaveBeenCalledWith('requirement', requirementFile);
    });

    expect(await screen.findByText('资格校验失败时禁止提交')).toBeInTheDocument();
    expect(screen.getByText('资格校验失败时展示显著提示')).toBeInTheDocument();
    expect(screen.getByText('生成摘要')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /导出用例/ }));
    });

    expect(exportFunctionalTestCasesCsv).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ case_id: 'TC-001' }),
      ]),
      'requirement-测试用例',
    );
  });
});

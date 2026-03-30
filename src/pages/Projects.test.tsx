import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { Mock } from 'vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ProjectsPage from './Projects';

vi.mock('../utils/api', () => ({
  listProjects: vi.fn(),
  getProject: vi.fn(),
  uploadProjectMapping: vi.fn(),
  createProjectMappingEntry: vi.fn(),
  updateProjectMappingEntry: vi.fn(),
  deleteProjectMappingEntry: vi.fn(),
  downloadProjectMappingTemplate: vi.fn(),
  extractApiErrorMessage: vi.fn((error: Error, fallback: string) => error.message || fallback),
}));

vi.mock('file-saver', () => ({
  saveAs: vi.fn(),
}));

import {
  createProjectMappingEntry,
  deleteProjectMappingEntry,
  downloadProjectMappingTemplate,
  getProject,
  listProjects,
  updateProjectMappingEntry,
} from '../utils/api';

(globalThis as Record<string, unknown>).ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

function renderWithProviders() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ProjectsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function waitForPageReady() {
  await screen.findByText('代码映射关系');
  return screen.findByRole('combobox');
}

async function selectProject(projectName: string) {
  const combobox = await waitForPageReady();
  fireEvent.mouseDown(combobox);
  fireEvent.click(await screen.findByText(projectName));
}

describe('ProjectsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    (listProjects as Mock).mockResolvedValue([
      {
        id: 1,
        name: '项目A',
        description: '核心项目',
        mapping_data: null,
        created_at: '2026-03-01T00:00:00Z',
        updated_at: '2026-03-01T00:00:00Z',
      },
    ]);

    (getProject as Mock).mockResolvedValue({
      id: 1,
      name: '项目A',
      description: '核心项目',
      mapping_data: null,
      created_at: '2026-03-01T00:00:00Z',
      updated_at: '2026-03-02T00:00:00Z',
      stats: {
        analysis_count: 0,
        avg_score: null,
        latest_analysis: null,
      },
    });
  });

  it('renders page title and disables project actions before selection', async () => {
    renderWithProviders();

    expect(await screen.findByText('代码映射关系')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /模板下载/ })).toBeEnabled();
    expect(screen.getByRole('button', { name: /上传映射/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /新增/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /项目详情/ })).toBeDisabled();
  });

  it('loads mapping detail with operation column after selecting project', async () => {
    (getProject as Mock).mockResolvedValue({
      id: 1,
      name: '项目A',
      description: '核心项目',
      mapping_data: [
        {
          package_name: 'com.example.user',
          class_name: 'UserService',
          method_name: 'createUser',
          description: '创建用户',
          test_point: '用户创建主流程，逐字段校验必填项、默认值回填与成功提示文案',
        },
      ],
      created_at: '2026-03-01T00:00:00Z',
      updated_at: '2026-03-02T00:00:00Z',
      stats: {
        analysis_count: 5,
        avg_score: 92.4,
        latest_analysis: '2026-03-02T08:00:00Z',
      },
    });

    renderWithProviders();
    await selectProject('项目A');

    expect(await screen.findByText('代码映射明细')).toBeInTheDocument();
    expect(screen.getAllByText('测试点').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: '编辑' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '删除' })).toBeInTheDocument();
    expect(document.querySelector('.glass-records-table.project-mappings-table')).not.toBeNull();
    expect(document.querySelector('.project-mappings-table__cell--clamped')).not.toBeNull();
  });

  it('supports manual add mapping for selected project', async () => {
    (createProjectMappingEntry as Mock).mockResolvedValue({
      id: 1,
      name: '项目A',
      description: '核心项目',
      mapping_data: [
        {
          package_name: 'com.example.order',
          class_name: 'OrderService',
          method_name: 'createOrder',
          description: '创建订单并校验库存',
          test_point: '下单成功与库存校验',
        },
      ],
      created_at: '2026-03-01T00:00:00Z',
      updated_at: '2026-03-02T00:00:00Z',
    });

    renderWithProviders();
    await selectProject('项目A');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /新增/ }));
    });

    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByPlaceholderText('例如：com.example.order'), {
      target: { value: 'com.example.order' },
    });
    fireEvent.change(within(dialog).getByPlaceholderText('例如：OrderService'), {
      target: { value: 'OrderService' },
    });
    fireEvent.change(within(dialog).getByPlaceholderText('例如：createOrder'), {
      target: { value: 'createOrder' },
    });
    fireEvent.change(within(dialog).getByPlaceholderText('例如：创建订单并校验库存'), {
      target: { value: '创建订单并校验库存' },
    });
    fireEvent.change(within(dialog).getByPlaceholderText('例如：库存不足、重复提交、异常回滚、边界值校验'), {
      target: { value: '下单成功与库存校验' },
    });

    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: /保\s*存/ }));
    });

    await waitFor(() => {
      expect(createProjectMappingEntry).toHaveBeenCalledWith(1, {
        package_name: 'com.example.order',
        class_name: 'OrderService',
        method_name: 'createOrder',
        description: '创建订单并校验库存',
        test_point: '下单成功与库存校验',
      });
    });
  }, 10000);

  it('supports editing mapping entry', async () => {
    (getProject as Mock).mockResolvedValue({
      id: 1,
      name: '项目A',
      description: '核心项目',
      mapping_data: [
        {
          package_name: 'com.example.user',
          class_name: 'UserService',
          method_name: 'createUser',
          description: '创建用户',
          test_point: '旧测试点',
        },
      ],
      created_at: '2026-03-01T00:00:00Z',
      updated_at: '2026-03-02T00:00:00Z',
      stats: {
        analysis_count: 5,
        avg_score: 92.4,
        latest_analysis: '2026-03-02T08:00:00Z',
      },
    });

    (updateProjectMappingEntry as Mock).mockResolvedValue({
      id: 1,
      name: '项目A',
      description: '核心项目',
      mapping_data: [
        {
          package_name: 'com.example.user',
          class_name: 'UserService',
          method_name: 'createUser',
          description: '创建用户并同步默认权限',
          test_point: '同步默认权限与数据校验',
        },
      ],
      created_at: '2026-03-01T00:00:00Z',
      updated_at: '2026-03-02T00:00:00Z',
    });

    renderWithProviders();
    await selectProject('项目A');

    fireEvent.click(await screen.findByRole('button', { name: '编辑' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByPlaceholderText('例如：创建订单并校验库存'), {
      target: { value: '创建用户并同步默认权限' },
    });
    fireEvent.change(within(dialog).getByPlaceholderText('例如：库存不足、重复提交、异常回滚、边界值校验'), {
      target: { value: '同步默认权限与数据校验' },
    });

    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: /保\s*存/ }));
    });

    await waitFor(() => {
      expect(updateProjectMappingEntry).toHaveBeenCalledWith(1, {
        original_key: {
          package_name: 'com.example.user',
          class_name: 'UserService',
          method_name: 'createUser',
        },
        entry: {
          package_name: 'com.example.user',
          class_name: 'UserService',
          method_name: 'createUser',
          description: '创建用户并同步默认权限',
          test_point: '同步默认权限与数据校验',
        },
      });
    });
  }, 15000);

  it('supports deleting mapping entry', async () => {
    (getProject as Mock).mockResolvedValue({
      id: 1,
      name: '项目A',
      description: '核心项目',
      mapping_data: [
        {
          package_name: 'com.example.user',
          class_name: 'UserService',
          method_name: 'createUser',
          description: '创建用户',
          test_point: '删除前测试点',
        },
      ],
      created_at: '2026-03-01T00:00:00Z',
      updated_at: '2026-03-02T00:00:00Z',
      stats: {
        analysis_count: 5,
        avg_score: 92.4,
        latest_analysis: '2026-03-02T08:00:00Z',
      },
    });

    (deleteProjectMappingEntry as Mock).mockResolvedValue({
      id: 1,
      name: '项目A',
      description: '核心项目',
      mapping_data: [],
      created_at: '2026-03-01T00:00:00Z',
      updated_at: '2026-03-02T00:00:00Z',
    });

    renderWithProviders();
    await selectProject('项目A');

    await act(async () => {
      fireEvent.click(await screen.findByRole('button', { name: '删除' }));
    });

    let confirmButton: Element | null = null;
    await waitFor(() => {
      confirmButton = document.body.querySelector('.ant-popconfirm-buttons .ant-btn-primary');
      expect(confirmButton).not.toBeNull();
    });

    await act(async () => {
      fireEvent.click(confirmButton as Element);
    });

    await waitFor(() => {
      expect(deleteProjectMappingEntry).toHaveBeenCalledWith(1, {
        package_name: 'com.example.user',
        class_name: 'UserService',
        method_name: 'createUser',
      });
    });
  }, 10000);

  it('triggers template download', async () => {
    (downloadProjectMappingTemplate as Mock).mockResolvedValue(new Blob(['template']));

    renderWithProviders();
    fireEvent.click(await screen.findByRole('button', { name: /模板下载/ }));

    await waitFor(() => {
      expect(downloadProjectMappingTemplate).toHaveBeenCalled();
    });
  });
});

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
  downloadProjectMappingTemplate: vi.fn(),
  extractApiErrorMessage: vi.fn((error: Error, fallback: string) => error.message || fallback),
}));

vi.mock('file-saver', () => ({
  saveAs: vi.fn(),
}));

import {
  createProjectMappingEntry,
  downloadProjectMappingTemplate,
  getProject,
  listProjects,
  uploadProjectMapping,
} from '../utils/api';
import { saveAs } from 'file-saver';

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

  it('loads mapping detail after selecting project', async () => {
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
        },
        {
          package_name: 'com.example.user',
          class_name: 'UserService',
          method_name: 'updateUser',
          description: '更新用户',
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
    expect(screen.getByText('已绑定映射')).toBeInTheDocument();
    expect(screen.getByText('映射条目 2')).toBeInTheDocument();
    expect(screen.getAllByText('UserService')).toHaveLength(2);
    expect(screen.getByText('createUser')).toBeInTheDocument();
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

    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: /保\s*存/ }));
    });

    await waitFor(() => {
      expect(createProjectMappingEntry).toHaveBeenCalledWith(1, {
        package_name: 'com.example.order',
        class_name: 'OrderService',
        method_name: 'createOrder',
        description: '创建订单并校验库存',
      });
    });
  });

  it('triggers template download', async () => {
    (downloadProjectMappingTemplate as Mock).mockResolvedValue(new Blob(['template']));

    renderWithProviders();

    fireEvent.click(await screen.findByRole('button', { name: /模板下载/ }));

    await waitFor(() => {
      expect(downloadProjectMappingTemplate).toHaveBeenCalled();
      expect(saveAs).toHaveBeenCalledWith(expect.any(Blob), '代码映射关系模板.xlsx');
    });
  });

  it('uploads mapping file for selected project', async () => {
    (uploadProjectMapping as Mock).mockResolvedValue({
      id: 1,
      name: '项目A',
      description: '核心项目',
      mapping_data: [
        {
          package_name: 'com.example.user',
          class_name: 'UserService',
          method_name: 'createUser',
          description: '创建用户',
        },
      ],
      created_at: '2026-03-01T00:00:00Z',
      updated_at: '2026-03-02T00:00:00Z',
    });

    renderWithProviders();
    await selectProject('项目A');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /上传映射|替换映射/ }));
    });

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/上传代码映射文件/)).toBeInTheDocument();

    const input = dialog.querySelector('input[type="file"]') as HTMLInputElement | null;
    expect(input).not.toBeNull();

    const file = new File(['mapping'], 'mapping.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });

    await act(async () => {
      fireEvent.change(input as HTMLInputElement, { target: { files: [file] } });
    });

    expect(await within(dialog).findByText('当前文件：mapping.xlsx')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: /上传并/ }));
    });

    await waitFor(() => {
      expect(uploadProjectMapping).toHaveBeenCalledWith(1, expect.any(File));
    });
  }, 15000);
});

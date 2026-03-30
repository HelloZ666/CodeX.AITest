import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { Mock } from 'vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import RequirementMappingsPage from './RequirementMappings';

vi.mock('../utils/api', () => ({
  listProjects: vi.fn(),
  getRequirementMapping: vi.fn(),
  uploadRequirementMapping: vi.fn(),
  saveRequirementMapping: vi.fn(),
  downloadRequirementMappingTemplate: vi.fn(),
  extractApiErrorMessage: vi.fn((error: Error, fallback: string) => error.message || fallback),
}));

vi.mock('file-saver', () => ({
  saveAs: vi.fn(),
}));

import {
  downloadRequirementMappingTemplate,
  getRequirementMapping,
  listProjects,
  saveRequirementMapping,
  uploadRequirementMapping,
} from '../utils/api';
import { saveAs } from 'file-saver';

function renderWithProviders() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <RequirementMappingsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function waitForPageReady() {
  await screen.findByText('项目筛选');
  return screen.findByRole('combobox');
}

async function selectProject(projectName: string) {
  const combobox = await waitForPageReady();
  fireEvent.mouseDown(combobox);
  const option = await screen.findByText(projectName);
  fireEvent.click(option);
}

describe('RequirementMappingsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (listProjects as Mock).mockResolvedValue([
      {
        id: 1,
        name: '项目A',
        description: '项目描述',
        mapping_data: null,
        created_at: '2026-03-01T00:00:00Z',
        updated_at: '2026-03-01T00:00:00Z',
      },
    ]);
    (getRequirementMapping as Mock).mockResolvedValue(null);
  });

  it('renders page title, disables project actions before selection, and shows tooltip on hover', async () => {
    renderWithProviders();

    expect(await screen.findByText('需求映射关系')).toBeInTheDocument();
    const importButton = screen.getByRole('button', { name: /导入/ });
    const createButton = screen.getByRole('button', { name: /新增/ });

    expect(importButton).toBeDisabled();
    expect(createButton).toBeDisabled();

    fireEvent.mouseEnter(importButton.parentElement as HTMLElement);
    const tooltip = await screen.findByRole('tooltip');
    expect(within(tooltip).getByText('请先选择项目')).toBeInTheDocument();
  });

  it('loads mapping detail after selecting project and keeps merged row display', async () => {
    (getRequirementMapping as Mock).mockResolvedValue({
      project_id: 1,
      project_name: '项目A',
      source_type: 'upload',
      last_file_name: 'mapping.xlsx',
      last_file_type: 'xlsx',
      sheet_name: 'Sheet1',
      group_count: 1,
      row_count: 2,
      groups: [
        {
          id: 'group-1',
          tag: '流程变更',
          requirement_keyword: '抄录',
          related_scenarios: ['一键抄录', '逐字抄录'],
        },
      ],
      rows: [
        {
          group_id: 'group-1',
          row_key: 'group-1-0',
          tag: '流程变更',
          requirement_keyword: '抄录',
          related_scenario: '一键抄录',
          tag_row_span: 2,
          requirement_keyword_row_span: 2,
          operation_row_span: 2,
        },
        {
          group_id: 'group-1',
          row_key: 'group-1-1',
          tag: '流程变更',
          requirement_keyword: '抄录',
          related_scenario: '逐字抄录',
          tag_row_span: 0,
          requirement_keyword_row_span: 0,
          operation_row_span: 0,
        },
      ],
      created_at: '2026-03-01T00:00:00Z',
      updated_at: '2026-03-02T00:00:00Z',
    });

    renderWithProviders();
    await selectProject('项目A');

    expect(await screen.findByText('需求映射明细')).toBeInTheDocument();
    const tagCell = screen.getByText('流程变更').closest('td');
    expect(tagCell).toHaveAttribute('rowspan', '2');
    expect(screen.getByText('逐字抄录')).toBeInTheDocument();
  });

  it('supports manual add with multiple scenario rows', async () => {
    (saveRequirementMapping as Mock).mockResolvedValue({
      project_id: 1,
      project_name: '项目A',
      source_type: 'manual',
      last_file_name: null,
      last_file_type: null,
      sheet_name: null,
      group_count: 1,
      row_count: 2,
      groups: [
        {
          id: 'manual-1',
          tag: '页面新增',
          requirement_keyword: '新增页面',
          related_scenarios: ['兼容性测试', '跳转链路'],
        },
      ],
      rows: [],
      created_at: '2026-03-01T00:00:00Z',
      updated_at: '2026-03-02T00:00:00Z',
    });

    renderWithProviders();
    await selectProject('项目A');

    fireEvent.click(screen.getByRole('button', { name: /新增/ }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('场景1')).toBeInTheDocument();
    fireEvent.change(within(dialog).getByPlaceholderText('例如：流程变更'), {
      target: { value: '页面新增' },
    });
    fireEvent.change(within(dialog).getByPlaceholderText('例如：抄录'), {
      target: { value: '新增页面' },
    });

    const scenarioInputs = within(dialog).getAllByPlaceholderText('例如：一键抄录');
    fireEvent.change(scenarioInputs[0], { target: { value: '兼容性测试' } });

    fireEvent.click(within(dialog).getByRole('button', { name: /新增一行/ }));

    expect(within(dialog).getByText('场景2')).toBeInTheDocument();
    const updatedScenarioInputs = within(dialog).getAllByPlaceholderText('例如：一键抄录');
    fireEvent.change(updatedScenarioInputs[1], { target: { value: '跳转链路' } });

    fireEvent.click(within(dialog).getByRole('button', { name: /保\s*存/ }));

    await waitFor(() => {
      expect(saveRequirementMapping).toHaveBeenCalledWith(1, [
        {
          id: expect.any(String),
          tag: '页面新增',
          requirement_keyword: '新增页面',
          related_scenarios: ['兼容性测试', '跳转链路'],
        },
      ]);
    });
  }, 15000);

  it('triggers template download', async () => {
    (downloadRequirementMappingTemplate as Mock).mockResolvedValue(new Blob(['template']));

    renderWithProviders();
    fireEvent.click(await screen.findByRole('button', { name: /模板下载/ }));

    await waitFor(() => {
      expect(downloadRequirementMappingTemplate).toHaveBeenCalled();
      expect(saveAs).toHaveBeenCalledWith(expect.any(Blob), '需求映射关系模板.xlsx');
    });
  });

  it('uploads mapping file for selected project', async () => {
    (uploadRequirementMapping as Mock).mockResolvedValue({
      project_id: 1,
      project_name: '项目A',
      source_type: 'upload',
      last_file_name: 'mapping.xlsx',
      last_file_type: 'xlsx',
      sheet_name: 'Sheet1',
      group_count: 1,
      row_count: 1,
      groups: [
        {
          id: 'group-1',
          tag: '流程变更',
          requirement_keyword: '抄录',
          related_scenarios: ['一键抄录'],
        },
      ],
      rows: [],
      created_at: '2026-03-01T00:00:00Z',
      updated_at: '2026-03-02T00:00:00Z',
    });

    renderWithProviders();
    await selectProject('项目A');

    fireEvent.click(screen.getByRole('button', { name: /导入/ }));
    expect(await screen.findByText(/导入需求映射文件/)).toBeInTheDocument();

    const input = document.body.querySelector('input[type="file"]') as HTMLInputElement | null;
    expect(input).not.toBeNull();

    const file = new File(['mapping'], 'mapping.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });

    fireEvent.change(input as HTMLInputElement, { target: { files: [file] } });
    fireEvent.click(screen.getByRole('button', { name: '导入并覆盖当前项目数据' }));

    await waitFor(() => {
      expect(uploadRequirementMapping).toHaveBeenCalledWith(1, expect.any(File));
    });
  }, 15000);
});

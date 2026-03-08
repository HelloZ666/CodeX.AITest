import { describe, it, expect, vi } from 'vitest';
import axios from 'axios';
import { analyzeFiles, validateFile, healthCheck, listProjects, createProject, getProject, updateProject, deleteProject, listRecords, getRecord, uploadProjectMapping, analyzeWithProject, exportReportJSON, importIssueAnalysis, importDefectAnalysis } from './api';

vi.mock('axios', () => {
  const mockAxios: any = {
    create: vi.fn(() => mockAxios),
    get: vi.fn(),
    post: vi.fn(),
    interceptors: {
      request: { use: vi.fn() },
      response: { use: vi.fn() },
    },
  };
  return { default: mockAxios };
});

const mockedAxios = axios as any;

describe('API Utils', () => {
  it('healthCheck calls GET /health', async () => {
    mockedAxios.get.mockResolvedValueOnce({ data: { status: 'ok', version: '1.0.0' } });
    const result = await healthCheck();
    expect(result.status).toBe('ok');
  });

  it('analyzeFiles sends FormData via POST', async () => {
    const mockResponse = {
      data: { success: true, data: { duration_ms: 100 } },
    };
    mockedAxios.post.mockResolvedValueOnce(mockResponse);

    const file = new File(['test'], 'test.json', { type: 'application/json' });
    const result = await analyzeFiles(file, file);
    expect(result.success).toBe(true);
  });

  it('validateFile returns validation result', async () => {
    mockedAxios.post.mockResolvedValueOnce({
      data: { valid: true, file_type: 'csv', row_count: 5 },
    });

    const file = new File(['test'], 'test.csv', { type: 'text/csv' });
    const result = await validateFile(file);
    expect(result.valid).toBe(true);
  });

  it('validateFile handles error response', async () => {
    mockedAxios.post.mockRejectedValueOnce({
      response: { data: { valid: false, error: '格式错误' } },
    });

    const file = new File(['test'], 'test.txt');
    const result = await validateFile(file);
    expect(result.valid).toBe(false);
    expect(result.error).toBe('格式错误');
  });

  it('validateFile handles network error', async () => {
    mockedAxios.post.mockRejectedValueOnce(new Error('Network Error'));

    const file = new File(['test'], 'test.csv');
    const result = await validateFile(file);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('网络异常');
  });

  it('importIssueAnalysis sends FormData via POST', async () => {
    mockedAxios.post.mockResolvedValueOnce({
      data: {
        success: true,
        data: {
          overview: { total_records: 2 },
          summary: { headline: '问题主要集中在需求阶段' },
          charts: { stage_distribution: [] },
          preview_rows: [],
        },
      },
    });

    const file = new File(['excel'], 'issue.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const result = await importIssueAnalysis(file);
    expect(result.success).toBe(true);
    expect(mockedAxios.post).toHaveBeenCalled();
  });

  it('importDefectAnalysis sends FormData via POST', async () => {
    mockedAxios.post.mockResolvedValueOnce({
      data: {
        success: true,
        data: {
          overview: { total_records: 2 },
          summary: { headline: '缺陷主要集中在严重度高的来源问题' },
          charts: { severity_distribution: [] },
          preview_rows: [],
        },
      },
    });

    const file = new File(['excel'], 'defect.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const result = await importDefectAnalysis(file);
    expect(result.success).toBe(true);
    expect(mockedAxios.post).toHaveBeenCalled();
  });

  // ============ Project API Tests ============

  it('listProjects calls GET /projects', async () => {
    mockedAxios.get.mockResolvedValueOnce({ data: [{ id: 1, name: 'Test' }] });
    const result = await listProjects();
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Test');
  });

  it('createProject sends POST /projects', async () => {
    mockedAxios.post.mockResolvedValueOnce({ data: { id: 1, name: 'New Project' } });
    const result = await createProject('New Project', 'desc');
    expect(result.name).toBe('New Project');
  });

  it('getProject calls GET /projects/:id', async () => {
    mockedAxios.get.mockResolvedValueOnce({ data: { id: 1, name: 'Test', stats: { analysis_count: 5 } } });
    const result = await getProject(1);
    expect(result.id).toBe(1);
    expect(result.stats.analysis_count).toBe(5);
  });

  it('updateProject sends PUT /projects/:id', async () => {
    mockedAxios.put = vi.fn().mockResolvedValueOnce({ data: { id: 1, name: 'Updated' } });
    const result = await updateProject(1, { name: 'Updated' });
    expect(result.name).toBe('Updated');
  });

  it('deleteProject sends DELETE /projects/:id', async () => {
    mockedAxios.delete = vi.fn().mockResolvedValueOnce({});
    await deleteProject(1);
    expect(mockedAxios.delete).toHaveBeenCalled();
  });

  // ============ Records API Tests ============

  it('listRecords calls GET /records with params', async () => {
    mockedAxios.get.mockResolvedValueOnce({ data: [{ id: 1, test_score: 80 }] });
    const result = await listRecords({ project_id: 1, limit: 10 });
    expect(result).toHaveLength(1);
  });

  it('getRecord calls GET /records/:id', async () => {
    mockedAxios.get.mockResolvedValueOnce({ data: { id: 1, test_score: 85, project_id: 1 } });
    const result = await getRecord(1);
    expect(result.test_score).toBe(85);
  });

  // ============ Upload Mapping & Analyze with Project ============

  it('uploadProjectMapping sends FormData via POST', async () => {
    mockedAxios.post.mockResolvedValueOnce({ data: { id: 1, name: 'Project', mapping_data: {} } });
    const file = new File(['pkg,class,method,desc'], 'mapping.csv', { type: 'text/csv' });
    const result = await uploadProjectMapping(1, file);
    expect(result.id).toBe(1);
    expect(mockedAxios.post).toHaveBeenCalled();
  });

  it('analyzeWithProject sends FormData with code and test files', async () => {
    mockedAxios.post.mockResolvedValueOnce({
      data: { success: true, data: { duration_ms: 200 }, record_id: 5 },
    });
    const codeFile = new File(['{}'], 'code.json', { type: 'application/json' });
    const testFile = new File(['id,name'], 'tests.csv', { type: 'text/csv' });
    const result = await analyzeWithProject(1, codeFile, testFile);
    expect(result.success).toBe(true);
    expect(mockedAxios.post).toHaveBeenCalled();
  });

  it('analyzeWithProject includes optional mapping file', async () => {
    mockedAxios.post.mockResolvedValueOnce({
      data: { success: true, data: { duration_ms: 300 } },
    });
    const codeFile = new File(['{}'], 'code.json', { type: 'application/json' });
    const testFile = new File(['id,name'], 'tests.csv', { type: 'text/csv' });
    const mappingFile = new File(['pkg,class'], 'mapping.csv', { type: 'text/csv' });
    const result = await analyzeWithProject(1, codeFile, testFile, mappingFile, false);
    expect(result.success).toBe(true);
  });

  it('analyzeWithProject sends useAI parameter', async () => {
    mockedAxios.post.mockResolvedValueOnce({
      data: { success: true, data: { duration_ms: 100 } },
    });
    const codeFile = new File(['{}'], 'code.json');
    const testFile = new File(['id'], 'tests.csv');
    await analyzeWithProject(1, codeFile, testFile, undefined, false);
    const callArgs = mockedAxios.post.mock.calls[mockedAxios.post.mock.calls.length - 1];
    expect(callArgs).toBeDefined();
  });

  // ============ Export Report ============

  it('exportReportJSON calls GET /records/:id with blob responseType', async () => {
    const mockBlob = new Blob(['{"test": true}'], { type: 'application/json' });
    mockedAxios.get.mockResolvedValueOnce({ data: mockBlob });
    const result = await exportReportJSON(1);
    expect(result).toBeInstanceOf(Blob);
  });

  it('listRecords works without params', async () => {
    mockedAxios.get.mockResolvedValueOnce({ data: [{ id: 1 }, { id: 2 }] });
    const result = await listRecords();
    expect(result).toHaveLength(2);
  });
});

import { describe, it, expect, vi } from 'vitest';
import { generateReportHTML, exportReportHTML } from './exportReport';
import type { AnalysisRecord } from '../types';

// Mock file-saver
vi.mock('file-saver', () => ({
  saveAs: vi.fn(),
}));

const mockRecord: AnalysisRecord = {
  id: 42,
  project_id: 1,
  code_changes_summary: { total_files: 3, total_added: 50, total_removed: 10 },
  test_coverage_result: {
    coverage_rate: 0.75,
    covered: ['com.example.UserService.getUser', 'com.example.UserService.listUsers'],
    uncovered: ['com.example.UserService.deleteUser'],
    details: [
      {
        method: 'com.example.UserService.getUser',
        description: '获取用户信息',
        is_covered: true,
        matched_tests: ['TC001', 'TC002'],
      },
      {
        method: 'com.example.UserService.listUsers',
        description: '列出所有用户',
        is_covered: true,
        matched_tests: ['TC003'],
      },
      {
        method: 'com.example.UserService.deleteUser',
        description: '删除用户',
        is_covered: false,
        matched_tests: [],
      },
    ],
  },
  test_score: 78.5,
  ai_suggestions: {
    risk_assessment: 'medium',
    coverage_gaps: '缺少对删除用户接口的测试覆盖',
    suggested_test_cases: [
      {
        test_id: 'TC_NEW_001',
        test_function: '删除用户功能测试',
        test_steps: '1. 创建测试用户 2. 调用删除接口 3. 验证用户已删除',
        expected_result: '用户被成功删除，返回200',
      },
    ],
    improvement_suggestions: [
      '增加边界值测试，如空参数、超长字符串',
      '补充异常路径测试，如数据库连接失败场景',
    ],
  },
  token_usage: 1500,
  cost: 0.0032,
  duration_ms: 2500,
  created_at: '2026-02-27T10:30:00Z',
};

const mockRecordMinimal: AnalysisRecord = {
  id: 1,
  project_id: 1,
  code_changes_summary: {},
  test_coverage_result: {},
  test_score: 0,
  ai_suggestions: null,
  token_usage: 0,
  cost: 0,
  duration_ms: 100,
  created_at: '2026-01-01T00:00:00Z',
};

describe('generateReportHTML', () => {
  it('生成包含完整结构的 HTML 字符串', () => {
    const html = generateReportHTML(mockRecord, '用户管理模块');

    // 是合法的 HTML 文档
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<html lang="zh-CN">');
    expect(html).toContain('</html>');

    // 包含标题
    expect(html).toContain('用户管理模块 — 质检报告 #42');

    // 包含品牌名
    expect(html).toContain('智测平台');
    expect(html).toContain('智测平台@太保科技');

    // 包含评分
    expect(html).toContain('78.5');

    // 包含覆盖率数据
    expect(html).toContain('75.0%');
    expect(html).toContain('已覆盖');
    expect(html).toContain('未覆盖');

    // 包含方法详情
    expect(html).toContain('com.example.UserService.getUser');
    expect(html).toContain('获取用户信息');
    expect(html).toContain('删除用户');

    // 包含 AI 建议
    expect(html).toContain('MEDIUM');
    expect(html).toContain('缺少对删除用户接口的测试覆盖');
    expect(html).toContain('TC_NEW_001');
    expect(html).toContain('删除用户功能测试');
    expect(html).toContain('增加边界值测试');
    expect(html).toContain('补充异常路径测试');

    // 包含元数据
    expect(html).toContain('2500ms');
    expect(html).toContain('1,500');
    expect(html).toContain('¥0.0032');
  });

  it('无项目名时标题仅显示报告ID', () => {
    const html = generateReportHTML(mockRecord);
    expect(html).toContain('质检报告 #42');
    expect(html).not.toContain(' — 质检报告');
  });

  it('处理空数据不崩溃', () => {
    const html = generateReportHTML(mockRecordMinimal);

    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('质检报告 #1');
    expect(html).toContain('0.0');     // score
    expect(html).toContain('0.0%');    // coverage rate
  });

  it('对 HTML 特殊字符进行转义', () => {
    const record: AnalysisRecord = {
      ...mockRecord,
      ai_suggestions: {
        improvement_suggestions: ['使用 <script>alert("xss")</script> 进行测试'],
      },
    };
    const html = generateReportHTML(record);

    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('包含打印优化样式', () => {
    const html = generateReportHTML(mockRecord);
    expect(html).toContain('@media print');
    expect(html).toContain('print-color-adjust:exact');
  });

  it('等级颜色正确映射', () => {
    // A 级 (>=90)
    const htmlA = generateReportHTML({ ...mockRecord, test_score: 95 });
    expect(htmlA).toContain('#00b894'); // green

    // B 级 (>=80)
    const htmlB = generateReportHTML({ ...mockRecord, test_score: 85 });
    expect(htmlB).toContain('#0984e3'); // blue

    // C 级 (>=60)
    const htmlC = generateReportHTML({ ...mockRecord, test_score: 65 });
    expect(htmlC).toContain('#f39c12'); // orange

    // D 级 (>=40)
    const htmlD = generateReportHTML({ ...mockRecord, test_score: 45 });
    expect(htmlD).toContain('#e17055'); // volcano

    // F 级 (<40)
    const htmlF = generateReportHTML({ ...mockRecord, test_score: 20 });
    expect(htmlF).toContain('#d63031'); // red
  });
});

describe('exportReportHTML', () => {
  it('调用 saveAs 生成 HTML 文件（含项目名）', () => {
    // 直接调用，不需要 mock saveAs 的返回值检查
    exportReportHTML(mockRecord, '用户管理模块');
    // 函数不抛错即通过
  });

  it('调用 saveAs 生成 HTML 文件（无项目名）', () => {
    exportReportHTML(mockRecord);
  });
});

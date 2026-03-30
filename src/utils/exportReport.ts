import type { AnalysisRecord } from '../types';
import { saveAs } from 'file-saver';

/* ------------------------------------------------------------------ */
/*  Helper: 从 AnalysisRecord 安全提取覆盖率数据                       */
/* ------------------------------------------------------------------ */
interface CoverageRow {
  method: string;
  description: string;
  is_covered: boolean;
  matched_tests: string[];
}

function extractCoverage(record: AnalysisRecord) {
  const cov = (record.test_coverage_result ?? {}) as Record<string, unknown>;
  const details = (cov.details ?? []) as CoverageRow[];
  const covered = (cov.covered ?? []) as string[];
  const uncovered = (cov.uncovered ?? []) as string[];
  const rate = typeof cov.coverage_rate === 'number' ? cov.coverage_rate : 0;
  return { details, covered, uncovered, rate };
}

/* ------------------------------------------------------------------ */
/*  Helper: 评分等级                                                   */
/* ------------------------------------------------------------------ */
function getGrade(score: number): { letter: string; color: string } {
  if (score >= 90) return { letter: 'A', color: '#00b894' };
  if (score >= 80) return { letter: 'B', color: '#0984e3' };
  if (score >= 60) return { letter: 'C', color: '#f39c12' };
  if (score >= 40) return { letter: 'D', color: '#e17055' };
  return { letter: 'F', color: '#d63031' };
}

/* ------------------------------------------------------------------ */
/*  生成 HTML 报告字符串                                               */
/* ------------------------------------------------------------------ */
export function generateReportHTML(record: AnalysisRecord, projectName?: string): string {
  const { details, covered, uncovered, rate } = extractCoverage(record);
  const score = record.test_score ?? 0;
  const grade = getGrade(score);
  const createdAt = new Date(record.created_at).toLocaleString('zh-CN');
  const title = projectName ? `${projectName} — 质检报告 #${record.id}` : `质检报告 #${record.id}`;

  // AI 建议
  const ai = (record.ai_suggestions ?? {}) as Record<string, unknown>;
  const riskAssessment = (ai.risk_assessment ?? '') as string;
  const coverageGaps = (ai.coverage_gaps ?? '') as string;
  const suggestedCases = (ai.suggested_test_cases ?? []) as Array<Record<string, string>>;
  const improvements = (ai.improvement_suggestions ?? []) as string[];

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${title}</title>
<style>
  /* ---- Reset & Base ---- */
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  body{
    font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;
    background:linear-gradient(135deg,#e8eaf6 0%,#f3e5f5 50%,#e1f5fe 100%);
    color:#2c3e50;
    line-height:1.6;
    min-height:100vh;
    padding:32px 16px;
    -webkit-print-color-adjust:exact;
    print-color-adjust:exact;
  }

  /* ---- Container ---- */
  .container{max-width:900px;margin:0 auto}

  /* ---- Header ---- */
  .report-header{
    background:linear-gradient(135deg,#1a1a2e 0%,#16213e 50%,#0f3460 100%);
    color:#fff;
    padding:40px 48px;
    border-radius:20px;
    margin-bottom:32px;
    box-shadow:0 12px 40px rgba(15,52,96,.25);
    position:relative;
    overflow:hidden;
  }
  .report-header::after{
    content:'';position:absolute;top:-60%;right:-15%;width:300px;height:300px;
    background:radial-gradient(circle,rgba(79,172,254,.15) 0%,transparent 70%);
    border-radius:50%;
  }
  .report-header h1{font-size:28px;font-weight:800;margin-bottom:4px;position:relative;z-index:1}
  .report-header .subtitle{opacity:.7;font-size:14px;position:relative;z-index:1}
  .report-header .meta{
    display:flex;gap:24px;margin-top:20px;font-size:13px;opacity:.8;
    flex-wrap:wrap;position:relative;z-index:1;
  }
  .report-header .meta span{display:flex;align-items:center;gap:4px}

  /* ---- Glass Card ---- */
  .card{
    background:rgba(255,255,255,.75);
    backdrop-filter:blur(20px);
    border:1px solid rgba(255,255,255,.4);
    border-radius:16px;
    box-shadow:0 8px 32px rgba(31,38,135,.08);
    padding:28px 32px;
    margin-bottom:24px;
  }
  .card h2{
    font-size:18px;font-weight:700;color:#1a1a2e;
    margin-bottom:20px;padding-bottom:12px;
    border-bottom:2px solid rgba(102,126,234,.15);
    display:flex;align-items:center;gap:8px;
  }
  .card h2 .icon{font-size:20px}

  /* ---- Score Ring ---- */
  .score-section{display:flex;align-items:center;gap:48px;flex-wrap:wrap}
  .score-ring{
    width:140px;height:140px;border-radius:50%;
    background:conic-gradient(${grade.color} 0deg,${grade.color} calc(3.6deg * ${score}),#eee calc(3.6deg * ${score}));
    display:flex;align-items:center;justify-content:center;
    box-shadow:0 10px 30px -10px ${grade.color};
    flex-shrink:0;
  }
  .score-ring-inner{
    width:120px;height:120px;border-radius:50%;background:#fff;
    display:flex;flex-direction:column;align-items:center;justify-content:center;
  }
  .score-ring-inner .grade{font-size:48px;font-weight:800;color:${grade.color};line-height:1}
  .score-ring-inner .label{font-size:13px;color:#999;margin-top:2px}
  .score-meta .total{font-size:40px;font-weight:700;color:#2c3e50}
  .score-meta .total small{font-size:16px;color:#999;font-weight:400}
  .score-meta .summary{
    margin-top:8px;display:inline-block;
    background:${grade.color}18;color:${grade.color};
    padding:4px 14px;border-radius:6px;font-weight:600;font-size:13px;
  }

  /* ---- Stats Bar ---- */
  .stats-bar{display:flex;gap:16px;flex-wrap:wrap;margin-bottom:24px}
  .stat-item{
    flex:1;min-width:120px;text-align:center;
    background:rgba(255,255,255,.5);padding:16px;border-radius:12px;
  }
  .stat-item .value{font-size:28px;font-weight:700;color:#4a3f8a}
  .stat-item .label{font-size:12px;color:#888;margin-top:4px}

  /* ---- Tables ---- */
  table{width:100%;border-collapse:collapse;font-size:14px}
  th{
    text-align:left;padding:10px 14px;font-weight:700;color:#1a1a2e;
    background:rgba(255,255,255,.55);border-bottom:2px solid rgba(0,0,0,.06);
  }
  td{padding:10px 14px;border-bottom:1px solid rgba(0,0,0,.04)}
  tr:hover td{background:rgba(102,126,234,.03)}
  .tag{
    display:inline-block;padding:2px 10px;border-radius:6px;font-weight:600;font-size:12px;
  }
  .tag-green{background:rgba(56,239,125,.15);color:#00b894}
  .tag-red{background:rgba(235,51,73,.15);color:#d63031}
  .tag-orange{background:rgba(242,153,74,.15);color:#f2994a}

  /* ---- Risk Badge ---- */
  .risk-badge{
    display:inline-block;padding:6px 18px;border-radius:8px;
    font-weight:700;font-size:14px;text-transform:uppercase;
  }
  .risk-high{background:rgba(235,51,73,.12);color:#d63031}
  .risk-medium{background:rgba(242,153,74,.12);color:#f2994a}
  .risk-low{background:rgba(56,239,125,.12);color:#00b894}

  /* ---- AI Section ---- */
  .ai-card{
    border-left:4px solid transparent;
    border-image:linear-gradient(to bottom,#667eea,#764ba2) 1;
  }
  .suggestion-list{list-style:none;padding:0}
  .suggestion-list li{
    padding:10px 16px;margin-bottom:8px;
    background:rgba(255,255,255,.5);border-radius:10px;
    font-size:14px;line-height:1.6;
    position:relative;padding-left:28px;
  }
  .suggestion-list li::before{
    content:'💡';position:absolute;left:8px;top:10px;
  }

  /* ---- Footer ---- */
  .report-footer{
    text-align:center;color:#999;font-size:12px;
    padding:24px 0;margin-top:16px;
    border-top:1px solid rgba(0,0,0,.05);
  }

  /* ---- Print ---- */
  @media print{
    body{background:#fff;padding:0}
    .container{max-width:100%}
    .card{break-inside:avoid;box-shadow:none;border:1px solid #eee}
    .report-header{box-shadow:none}
  }
</style>
</head>
<body>
<div class="container">

  <!-- Header -->
  <div class="report-header">
    <h1>${escapeHtml(title)}</h1>
    <div class="subtitle">智测平台 — 自动化质检分析报告</div>
    <div class="meta">
      <span>📅 ${escapeHtml(createdAt)}</span>
      <span>⏱ ${record.duration_ms ?? 0}ms</span>
      <span>🔤 Token: ${(record.token_usage ?? 0).toLocaleString()}</span>
    </div>
  </div>

  <!-- Score -->
  <div class="card">
    <h2><span class="icon">🏆</span> 质量评分</h2>
    <div class="score-section">
      <div class="score-ring">
        <div class="score-ring-inner">
          <span class="grade">${grade.letter}</span>
          <span class="label">等级</span>
        </div>
      </div>
      <div class="score-meta">
        <div class="total">${score.toFixed(1)} <small>/ 100</small></div>
      </div>
    </div>
  </div>

  <!-- Coverage Stats -->
  <div class="card">
    <h2><span class="icon">🎯</span> 测试覆盖率</h2>
    <div class="stats-bar">
      <div class="stat-item">
        <div class="value">${(rate * 100).toFixed(1)}%</div>
        <div class="label">覆盖率</div>
      </div>
      <div class="stat-item">
        <div class="value" style="color:#00b894">${covered.length}</div>
        <div class="label">已覆盖</div>
      </div>
      <div class="stat-item">
        <div class="value" style="color:#d63031">${uncovered.length}</div>
        <div class="label">未覆盖</div>
      </div>
      <div class="stat-item">
        <div class="value">${covered.length + uncovered.length}</div>
        <div class="label">总方法数</div>
      </div>
    </div>

    ${details.length > 0 ? `
    <table>
      <thead>
        <tr><th>方法</th><th>功能描述</th><th>覆盖状态</th><th>匹配用例</th></tr>
      </thead>
      <tbody>
        ${details.map(d => `
        <tr>
          <td><code>${escapeHtml(d.method)}</code></td>
          <td>${escapeHtml(d.description)}</td>
          <td>${d.is_covered
            ? '<span class="tag tag-green">已覆盖</span>'
            : '<span class="tag tag-red">未覆盖</span>'}</td>
          <td>${d.matched_tests.length > 0 ? d.matched_tests.map(t => escapeHtml(t)).join(', ') : '—'}</td>
        </tr>`).join('')}
      </tbody>
    </table>` : ''}
  </div>

  ${(riskAssessment || coverageGaps || suggestedCases.length > 0 || improvements.length > 0) ? `
  <!-- AI Analysis -->
  <div class="card ai-card">
    <h2><span class="icon">✨</span> AI 智能建议</h2>

    ${riskAssessment ? `
    <div style="margin-bottom:20px">
      <strong style="margin-right:12px">风险评估：</strong>
      <span class="risk-badge risk-${riskAssessment.toLowerCase()}">${escapeHtml(riskAssessment.toUpperCase())}</span>
    </div>` : ''}

    ${coverageGaps ? `
    <div style="margin-bottom:20px;background:rgba(33,147,176,.06);padding:16px 20px;border-radius:12px">
      <strong style="color:#2193b0">📋 覆盖缺口分析</strong>
      <p style="margin-top:8px">${escapeHtml(coverageGaps)}</p>
    </div>` : ''}

    ${suggestedCases.length > 0 ? `
    <div style="margin-bottom:20px">
      <strong>📝 建议补充用例</strong>
      <table style="margin-top:12px">
        <thead><tr><th>用例ID</th><th>测试功能</th><th>测试步骤</th><th>预期结果</th></tr></thead>
        <tbody>
          ${suggestedCases.map(c => `
          <tr>
            <td>${escapeHtml(c.test_id ?? '')}</td>
            <td>${escapeHtml(c.test_function ?? '')}</td>
            <td>${escapeHtml(c.test_steps ?? '')}</td>
            <td>${escapeHtml(c.expected_result ?? '')}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>` : ''}

    ${improvements.length > 0 ? `
    <div>
      <strong>💡 改进建议</strong>
      <ul class="suggestion-list" style="margin-top:12px">
        ${improvements.map(s => `<li>${escapeHtml(s)}</li>`).join('')}
      </ul>
    </div>` : ''}
  </div>` : ''}

  <!-- Footer -->
  <div class="report-footer">
    智测平台@太保科技 · 报告生成于 ${escapeHtml(new Date().toLocaleString('zh-CN'))}
  </div>

</div>
</body>
</html>`;
}

/* ------------------------------------------------------------------ */
/*  导出为 HTML 文件                                                   */
/* ------------------------------------------------------------------ */
export function exportReportHTML(record: AnalysisRecord, projectName?: string): void {
  const html = generateReportHTML(record, projectName);
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const fileName = projectName
    ? `${projectName}-质检报告-${record.id}.html`
    : `质检报告-${record.id}.html`;
  saveAs(blob, fileName);
}

/* ------------------------------------------------------------------ */
/*  Utility: HTML escape                                               */
/* ------------------------------------------------------------------ */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

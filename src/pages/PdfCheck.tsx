import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Checkbox,
  DatePicker,
  Descriptions,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Spin,
  Table,
  Tag,
  Typography,
  Upload,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  EditOutlined,
  FileSearchOutlined,
  FullscreenExitOutlined,
  FullscreenOutlined,
  PlusOutlined,
  ReloadOutlined,
  ScanOutlined,
  UploadOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs, { type Dayjs } from 'dayjs';
import { PdfSnapshotPreview } from '../components/PdfPreview/PdfSnapshotPreview';
import { GlassStepCard, GlowActionButton } from '../components/Workbench/GlassWorkbench';
import type {
  PdfCheckDiffItem,
  PdfCheckRecordDetail,
  PdfCheckRecordSummary,
  PdfCheckResult,
  PdfCheckSide,
  PdfTemplate,
  PdfTemplateDetail,
  PdfCheckVariableRegion,
  PdfCheckVariableRules,
} from '../types';
import {
  applyPdfCheckOcrCorrections,
  createPdfCheckRecord,
  extractApiErrorMessage,
  getPdfCheckRecord,
  getPdfTemplate,
  listPdfCheckRecords,
  listPdfTemplates,
  listProjects,
  updatePdfCheckManualResult,
} from '../utils/api';

const { Text } = Typography;

interface PdfCheckFormValues {
  project_id?: SelectRawValue;
  test_version?: string;
  template_id?: SelectRawValue;
}

interface ManualResultFormValues {
  final_result: PdfCheckResult;
  note?: string;
}

interface PdfCheckSubmitValues {
  project_id: number;
  test_version: string;
  template_id: number;
  pdf_file: File;
  variable_rules: PdfCheckVariableRules;
}

type SelectRawValue = number | string | { value?: number | string | null } | null | undefined;

function coerceSelectId(value: SelectRawValue): number | undefined {
  const rawValue = typeof value === 'object' && value !== null ? value.value : value;
  if (typeof rawValue === 'number' && Number.isInteger(rawValue)) {
    return rawValue;
  }
  if (typeof rawValue === 'string' && /^\d+$/.test(rawValue.trim())) {
    return Number(rawValue.trim());
  }
  return undefined;
}

const SIDE_OPTIONS: Array<{ value: PdfCheckSide; label: string }> = [
  { value: 'template', label: '模板PDF' },
  { value: 'candidate', label: '核对PDF' },
];

const DEFAULT_VARIABLE_KEYWORDS = [
  '保单号',
  '投保单号',
  '保险单号',
  '姓名',
  '性别',
  '出生日期',
  '证件号码',
  '身份证号',
  '手机',
  '电话',
  '邮箱',
  '职业',
  '保费',
  '保额',
  '银行卡',
];

const DEFAULT_VARIABLE_RULES: PdfCheckVariableRules = {
  enabled: true,
  use_builtin: true,
  keywords: DEFAULT_VARIABLE_KEYWORDS,
  regexes: [
    '\\d{8,}',
    '\\d{4}[-/.年]\\d{1,2}[-/.月]\\d{1,2}日?',
    '\\d{15}|\\d{17}[\\dXx]',
    '1[3-9]\\d{9}',
  ],
  regions: [],
};

const PDF_DETAIL_STALE_TIME_MS = 10 * 60_000;
const PDF_DETAIL_CACHE_TIME_MS = 30 * 60_000;
const TEST_VERSION_DATE_FORMAT = 'YYYYMMDD';

function getCurrentTestVersion(): string {
  return dayjs().format(TEST_VERSION_DATE_FORMAT);
}

function parseTestVersionDate(value?: string | null): Dayjs | null {
  const match = /^(\d{4})(\d{2})(\d{2})$/.exec((value ?? '').trim());
  if (!match) {
    return null;
  }
  const date = dayjs(`${match[1]}-${match[2]}-${match[3]}`);
  return date.isValid() && date.format(TEST_VERSION_DATE_FORMAT) === value ? date : null;
}

function normalizeTestVersionValue(value: unknown): string {
  if (typeof value === 'string') {
    return value.trim();
  }
  if (value && typeof value === 'object') {
    const formatter = (value as { format?: (template: string) => string }).format;
    if (typeof formatter === 'function') {
      return formatter.call(value, TEST_VERSION_DATE_FORMAT);
    }
  }
  return '';
}

function createDefaultVariableRules(): PdfCheckVariableRules {
  return {
    ...DEFAULT_VARIABLE_RULES,
    keywords: [...DEFAULT_VARIABLE_RULES.keywords],
    regexes: [...DEFAULT_VARIABLE_RULES.regexes],
    regions: [],
  };
}

function splitLines(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function regionName(index: number): string {
  return `变量区域${index + 1}`;
}

function formatDateTime(value?: string | null): string {
  if (!value) {
    return '--';
  }
  const normalized = value.includes('T') ? value : value.replace(' ', 'T');
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN', { hour12: false });
}

function formatFileSize(fileSize: number): string {
  if (fileSize < 1024) {
    return `${fileSize} B`;
  }
  if (fileSize < 1024 * 1024) {
    return `${(fileSize / 1024).toFixed(1)} KB`;
  }
  return `${(fileSize / (1024 * 1024)).toFixed(2)} MB`;
}

function resultTag(result: PdfCheckResult) {
  return result === 'passed' ? (
    <Tag className="pdf-check-result-tag pdf-check-result-tag--passed" icon={<CheckCircleOutlined />}>通过</Tag>
  ) : (
    <Tag className="pdf-check-result-tag pdf-check-result-tag--failed" icon={<CloseCircleOutlined />}>失败</Tag>
  );
}

function resultSourceTag(source: string) {
  return source === 'manual' ? <Tag color="warning">人工修改</Tag> : <Tag>系统判定</Tag>;
}

function operatorName(record: PdfCheckRecordSummary): string {
  return record.operator_display_name || record.operator_username || '--';
}

function diffTypeLabel(item: PdfCheckDiffItem): string {
  if (item.type === 'page_count') {
    return '页数差异';
  }
  if (item.type === 'unextractable_page') {
    return '不可提取';
  }
  if (item.type === 'missing_in_candidate') {
    return '核对PDF缺失';
  }
  if (item.type === 'extra_in_candidate') {
    return '核对PDF新增';
  }
  return '文字变更';
}

function compactText(value?: string, maxLength = 90): string {
  const normalized = (value ?? '').replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) {
    return normalized || '--';
  }
  return `${normalized.slice(0, maxLength)}...`;
}

function getSnapshot(record: PdfCheckRecordDetail, side: PdfCheckSide) {
  return side === 'template' ? record.template_snapshot : record.candidate_snapshot;
}

function getPageText(record: PdfCheckRecordDetail, side: PdfCheckSide, pageNumber: number): string {
  return getSnapshot(record, side).pages.find((page) => page.page_number === pageNumber)?.text ?? '';
}

function templateLabel(template: PdfTemplate): string {
  return `${template.name}（${template.page_count}页）`;
}

interface DragRegion {
  page_number: number;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
}

function getRegionStyle(region: PdfCheckVariableRegion): React.CSSProperties {
  return {
    left: `${region.x}%`,
    top: `${region.y}%`,
    width: `${region.width}%`,
    height: `${region.height}%`,
  };
}

function getDragStyle(drag: DragRegion): React.CSSProperties {
  const x = Math.min(drag.startX, drag.currentX);
  const y = Math.min(drag.startY, drag.currentY);
  return {
    left: `${x}%`,
    top: `${y}%`,
    width: `${Math.abs(drag.currentX - drag.startX)}%`,
    height: `${Math.abs(drag.currentY - drag.startY)}%`,
  };
}

function getPointerPercent(event: React.MouseEvent<HTMLDivElement>): { x: number; y: number } {
  const rect = event.currentTarget.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / Math.max(rect.width, 1)) * 100;
  const y = ((event.clientY - rect.top) / Math.max(rect.height, 1)) * 100;
  return {
    x: Math.max(0, Math.min(100, x)),
    y: Math.max(0, Math.min(100, y)),
  };
}

function VariableRuleTemplatePreview({
  template,
  regions,
  disabled,
  onAddRegion,
  onRemoveRegion,
}: {
  template?: PdfTemplateDetail;
  regions: PdfCheckVariableRegion[];
  disabled: boolean;
  onAddRegion: (region: PdfCheckVariableRegion) => void;
  onRemoveRegion: (regionId: string) => void;
}) {
  const [drag, setDrag] = useState<DragRegion | null>(null);
  const pages = template?.extraction?.pages ?? [];

  const startDrag = (event: React.MouseEvent<HTMLDivElement>, pageNumber: number) => {
    if (disabled) {
      return;
    }
    const point = getPointerPercent(event);
    setDrag({ page_number: pageNumber, startX: point.x, startY: point.y, currentX: point.x, currentY: point.y });
  };

  const moveDrag = (event: React.MouseEvent<HTMLDivElement>, pageNumber: number) => {
    if (!drag || drag.page_number !== pageNumber) {
      return;
    }
    const point = getPointerPercent(event);
    setDrag({ ...drag, currentX: point.x, currentY: point.y });
  };

  const finishDrag = (event: React.MouseEvent<HTMLDivElement>, pageNumber: number) => {
    if (!drag || drag.page_number !== pageNumber) {
      return;
    }
    const point = getPointerPercent(event);
    const x = Math.min(drag.startX, point.x);
    const y = Math.min(drag.startY, point.y);
    const width = Math.abs(point.x - drag.startX);
    const height = Math.abs(point.y - drag.startY);
    setDrag(null);
    if (width < 1.5 || height < 1.5) {
      return;
    }
    onAddRegion({
      id: `region-${Date.now()}`,
      name: regionName(regions.length),
      page_number: pageNumber,
      x: Number(x.toFixed(2)),
      y: Number(y.toFixed(2)),
      width: Number(width.toFixed(2)),
      height: Number(height.toFixed(2)),
    });
  };

  if (!template) {
    return (
      <div className="pdf-variable-preview-empty">
        <Empty description="选择模板后可预览并框选变量区域" />
      </div>
    );
  }

  return (
    <div className="pdf-variable-preview">
      <div className="pdf-variable-preview__tip">在模板预览上按住拖拽，框选客户资料、保单号、日期等变量区域。</div>
      <div className="pdf-variable-preview__pages">
        {pages.map((page) => (
          <div key={page.page_number} className="pdf-variable-preview__page">
            <div className="pdf-variable-preview__page-title">第 {page.page_number} 页</div>
            <div
              className={`pdf-variable-preview__canvas${disabled ? ' pdf-variable-preview__canvas--disabled' : ''}`}
              onMouseDown={(event) => startDrag(event, page.page_number)}
              onMouseMove={(event) => moveDrag(event, page.page_number)}
              onMouseUp={(event) => finishDrag(event, page.page_number)}
              onMouseLeave={() => setDrag(null)}
            >
              {page.image_data_url ? <img src={page.image_data_url} alt={`PDF 第 ${page.page_number} 页`} /> : null}
              {regions
                .filter((region) => !region.page_number || region.page_number === page.page_number)
                .map((region) => (
                  <button
                    key={region.id}
                    type="button"
                    className="pdf-variable-region"
                    style={getRegionStyle(region)}
                    onMouseDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                      event.stopPropagation();
                      onRemoveRegion(region.id);
                    }}
                    title={`${region.name}，点击删除`}
                  >
                    {region.name}
                  </button>
                ))}
              {drag?.page_number === page.page_number ? (
                <span className="pdf-variable-region pdf-variable-region--draft" style={getDragStyle(drag)} />
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const PdfCheckPage: React.FC = () => {
  const [form] = Form.useForm<PdfCheckFormValues>();
  const [manualForm] = Form.useForm<ManualResultFormValues>();
  const queryClient = useQueryClient();
  const [candidateFile, setCandidateFile] = useState<File | null>(null);
  const [selectedRecordId, setSelectedRecordId] = useState<number | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [ocrOpen, setOcrOpen] = useState(false);
  const [ocrSide, setOcrSide] = useState<PdfCheckSide>('candidate');
  const [ocrPageNumber, setOcrPageNumber] = useState(1);
  const [ocrText, setOcrText] = useState('');
  const [visibleStep, setVisibleStep] = useState(0);
  const [detailFullscreen, setDetailFullscreen] = useState(false);
  const [variableRules, setVariableRules] = useState<PdfCheckVariableRules>(() => createDefaultVariableRules());
  const initialFormValues = useMemo(() => ({ test_version: getCurrentTestVersion() }), []);

  const watchedProjectValue = Form.useWatch('project_id', { form, preserve: true }) as SelectRawValue;
  const watchedTemplateValue = Form.useWatch('template_id', { form, preserve: true }) as SelectRawValue;
  const selectedProjectId = coerceSelectId(watchedProjectValue);
  const selectedTemplateId = coerceSelectId(watchedTemplateValue);
  const testVersion = normalizeTestVersionValue(Form.useWatch('test_version', { form, preserve: true }));

  const projectsQuery = useQuery({
    queryKey: ['projects'],
    queryFn: listProjects,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (selectedProjectId === undefined && (projectsQuery.data ?? []).length > 0) {
      form.setFieldValue('project_id', projectsQuery.data?.[0]?.id);
    }
  }, [form, projectsQuery.data, selectedProjectId]);

  const templatesQuery = useQuery({
    queryKey: ['pdf-templates', selectedProjectId, 'check'],
    queryFn: () => listPdfTemplates({ project_id: selectedProjectId, limit: 100 }),
    enabled: selectedProjectId !== undefined,
  });

  const recordsQuery = useQuery({
    queryKey: ['pdf-check-records', selectedProjectId],
    queryFn: () => listPdfCheckRecords({ project_id: selectedProjectId, limit: 100 }),
    enabled: selectedProjectId !== undefined,
  });

  const detailQuery = useQuery({
    queryKey: ['pdf-check-record', selectedRecordId],
    queryFn: () => getPdfCheckRecord(selectedRecordId as number),
    enabled: selectedRecordId !== null,
    staleTime: PDF_DETAIL_STALE_TIME_MS,
    gcTime: PDF_DETAIL_CACHE_TIME_MS,
    refetchOnWindowFocus: false,
  });

  const templatePreviewQuery = useQuery({
    queryKey: ['pdf-template-preview', selectedTemplateId, 'variable-rules'],
    queryFn: () => getPdfTemplate(selectedTemplateId as number),
    enabled: selectedTemplateId !== undefined && visibleStep === 3,
  });

  const projectOptions = useMemo(
    () => (projectsQuery.data ?? []).map((project) => ({ value: project.id, label: project.name })),
    [projectsQuery.data],
  );

  const templateOptions = useMemo(
    () => (templatesQuery.data ?? []).map((template) => ({ value: template.id, label: templateLabel(template) })),
    [templatesQuery.data],
  );

  const updateRecordCaches = (record: PdfCheckRecordDetail) => {
    queryClient.setQueryData(['pdf-check-record', record.id], record);
    void queryClient.invalidateQueries({ queryKey: ['pdf-check-records'] });
  };

  const createMutation = useMutation({
    mutationFn: (values: PdfCheckSubmitValues) => createPdfCheckRecord({
      project_id: values.project_id,
      test_version: values.test_version,
      template_id: values.template_id,
      pdf_file: values.pdf_file,
      variable_rules: values.variable_rules,
    }),
    onSuccess: (record) => {
      updateRecordCaches(record);
      setSelectedRecordId(record.id);
      message.success(record.final_result === 'passed' ? 'AI文件核对通过' : 'AI文件核对失败');
    },
    onError: (error) => message.error(extractApiErrorMessage(error, 'AI文件核对失败')),
  });

  const manualMutation = useMutation({
    mutationFn: ({ recordId, values }: { recordId: number; values: ManualResultFormValues }) =>
      updatePdfCheckManualResult(recordId, values),
    onSuccess: (record) => {
      updateRecordCaches(record);
      setManualOpen(false);
      message.success('人工结果已保存');
    },
    onError: (error) => message.error(extractApiErrorMessage(error, '保存人工结果失败')),
  });

  const ocrMutation = useMutation({
    mutationFn: ({ recordId, side, pageNumber, text }: {
      recordId: number;
      side: PdfCheckSide;
      pageNumber: number;
      text: string;
    }) => applyPdfCheckOcrCorrections(recordId, [{ side, page_number: pageNumber, text }]),
    onSuccess: (record) => {
      updateRecordCaches(record);
      setOcrOpen(false);
      message.success('OCR文本已修正并重新比对');
    },
    onError: (error) => message.error(extractApiErrorMessage(error, 'OCR文本修正失败')),
  });

  const selectedRecord = detailQuery.data ?? null;
  const unlockedStep = selectedRecord
    ? 5
    : candidateFile
      ? 5
      : selectedTemplateId
        ? 4
        : testVersion
          ? 2
          : selectedProjectId
            ? 1
            : 0;

  useEffect(() => {
    if (visibleStep > unlockedStep) {
      setVisibleStep(unlockedStep);
    }
  }, [unlockedStep, visibleStep]);

  const runCheck = async () => {
    const values = form.getFieldsValue(true) as PdfCheckFormValues;
    const projectId = coerceSelectId(values.project_id);
    const templateId = coerceSelectId(values.template_id);
    const testVersionValue = normalizeTestVersionValue(values.test_version);
    if (projectId === undefined) {
      message.warning('请选择项目');
      setVisibleStep(0);
      return;
    }
    if (!testVersionValue) {
      message.warning('请填写测试版本');
      setVisibleStep(1);
      return;
    }
    if (templateId === undefined) {
      message.warning('请选择PDF模板');
      setVisibleStep(2);
      return;
    }
    if (!candidateFile) {
      message.warning('请上传待核对PDF文件');
      setVisibleStep(4);
      return;
    }
    createMutation.mutate({
      project_id: projectId,
      test_version: testVersionValue,
      template_id: templateId,
      pdf_file: candidateFile,
      variable_rules: variableRules,
    });
  };

  const openManualModal = () => {
    if (!selectedRecord) {
      return;
    }
    manualForm.setFieldsValue({ final_result: selectedRecord.final_result, note: '' });
    setManualOpen(true);
  };

  const loadOcrText = (record: PdfCheckRecordDetail, side: PdfCheckSide, pageNumber: number) => {
    setOcrSide(side);
    setOcrPageNumber(pageNumber);
    setOcrText(getPageText(record, side, pageNumber));
  };

  const openOcrModal = () => {
    if (!selectedRecord) {
      return;
    }
    const firstPage = selectedRecord.candidate_snapshot.pages[0]?.page_number ?? 1;
    loadOcrText(selectedRecord, 'candidate', firstPage);
    setOcrOpen(true);
  };

  const closeDetailModal = () => {
    setSelectedRecordId(null);
    setDetailFullscreen(false);
  };

  const recordColumns: ColumnsType<PdfCheckRecordSummary> = [
    {
      title: '测试版本',
      dataIndex: 'test_version',
      key: 'test_version',
      width: 150,
      render: (value: string) => <Text strong>{value}</Text>,
    },
    {
      title: '最终结果',
      dataIndex: 'final_result',
      key: 'final_result',
      width: 110,
      render: resultTag,
    },
    {
      title: '来源',
      dataIndex: 'result_source',
      key: 'result_source',
      width: 110,
      render: resultSourceTag,
    },
    {
      title: '差异数',
      key: 'diff_count',
      width: 150,
      render: (_, record) => (
        <Space size={4}>
          <Tag color={record.diff_count > 0 ? 'error' : 'success'}>失败 {record.diff_count}</Tag>
          <Tag color="processing">变量 {record.ignored_diff_count ?? 0}</Tag>
        </Space>
      ),
    },
    {
      title: 'OCR校对',
      key: 'ocr',
      width: 130,
      render: (_, record) => (
        <Space size={4}>
          {record.ocr_used ? <Tag color="processing">已使用</Tag> : <Tag>未使用</Tag>}
          {!record.ocr_available ? <Tag color="warning">需修正</Tag> : null}
        </Space>
      ),
    },
    {
      key: 'operator',
      title: '操作人',
      width: 140,
      ellipsis: true,
      render: (_, record) => operatorName(record),
    },
    {
      dataIndex: 'template_name',
      title: '模板',
      key: 'template_name',
      width: 180,
      ellipsis: true,
    },
    {
      title: '核对PDF',
      dataIndex: 'candidate_file_name',
      key: 'candidate_file_name',
      width: 240,
      ellipsis: true,
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 190,
      render: formatDateTime,
    },
    {
      title: '操作',
      key: 'actions',
      width: 104,
      fixed: 'right',
      render: (_, record) => (
        <Button
          size="small"
          icon={<FileSearchOutlined />}
          onClick={() => setSelectedRecordId(record.id)}
        >
          预览
        </Button>
      ),
    },
  ];

  const diffColumns: ColumnsType<PdfCheckDiffItem> = [
    {
      title: '类型',
      key: 'type',
      width: 130,
      render: (_, item) => <Tag color={item.type === 'changed' ? 'warning' : 'default'}>{diffTypeLabel(item)}</Tag>,
    },
    {
      title: '页码',
      dataIndex: 'page_number',
      key: 'page_number',
      width: 90,
      render: (value: number | null | undefined) => value ?? '--',
    },
    {
      title: '模板文本',
      dataIndex: 'template_text',
      key: 'template_text',
      render: (value: string) => compactText(value),
    },
    {
      title: '核对文本',
      dataIndex: 'candidate_text',
      key: 'candidate_text',
      render: (value: string) => compactText(value),
    },
  ];

  const currentOcrSnapshot = selectedRecord ? getSnapshot(selectedRecord, ocrSide) : null;
  const ocrPageOptions = currentOcrSnapshot?.pages.map((page) => ({
    value: page.page_number,
    label: `第 ${page.page_number} 页`,
  })) ?? [];
  const progressSteps = [
    { title: '选择项目', description: selectedProjectId ? '项目已选定' : '选择核对所属项目' },
    { title: '填写版本', description: testVersion ? testVersion : '选择测试日期' },
    { title: '选择模板', description: selectedTemplateId ? '模板已选定' : '选择同项目PDF模板' },
    { title: '变量规则', description: variableRules.enabled ? `已启用，${variableRules.regions.length} 个区域` : '未启用变量忽略' },
    { title: '上传PDF', description: candidateFile ? candidateFile.name : '上传待核对PDF' },
    { title: '查看结果', description: selectedRecord ? `失败 ${selectedRecord.diff_count} / 变量 ${selectedRecord.ignored_diff_count ?? 0}` : '生成系统判定' },
  ];
  const stepState = (index: number) => {
    if (visibleStep === index) {
      return 'active';
    }
    if (unlockedStep > index) {
      return 'complete';
    }
    return 'idle';
  };

  return (
    <div className="glass-workbench-page case-generation-page pdf-check-page">
      <section className="glass-workbench-hero case-generation-hero pdf-check-hero">
        <div className="glass-workbench-hero__content">
          <div className="glass-workbench-hero__eyebrow">
            <Tag color="blue">AI辅助工具</Tag>
            <span>AI文件核对</span>
          </div>
          <h1 className="glass-workbench-hero__title">AI文件核对工作台</h1>
          <p className="glass-workbench-hero__description">
            选择项目模板并上传待核对PDF，系统保留源文件页面样式进行文字级差异高亮。
          </p>
        </div>
        <div className="glass-workbench-hero__actions">
          <Tag color="processing">{recordsQuery.data?.length ?? 0} 条记录</Tag>
          <Tag>{templatesQuery.data?.length ?? 0} 个可用模板</Tag>
        </div>
      </section>

      <section className="case-generation-console pdf-check-console" aria-label="AI文件核对流程">
        <aside className="case-generation-progress pdf-check-progress" aria-label="AI文件核对完整进度侧边栏">
          <div className="case-generation-progress__header">
            <span>进度</span>
            <strong>{Math.min(visibleStep + 1, progressSteps.length)}/{progressSteps.length}</strong>
          </div>
          <div className="case-generation-progress__meter" aria-hidden="true">
            <span style={{ width: `${((visibleStep + 1) / progressSteps.length) * 100}%` }} />
          </div>
          <ol className="case-generation-progress__list">
            {progressSteps.map((step, index) => {
              const status = visibleStep === index ? 'active' : unlockedStep > index ? 'complete' : 'waiting';
              return (
                <li
                  key={step.title}
                  className="case-generation-progress__item"
                  data-status={status}
                  data-current={visibleStep === index}
                >
                  <button
                    type="button"
                    className="case-generation-progress__button"
                    disabled={index > unlockedStep}
                    onClick={() => setVisibleStep(index)}
                  >
                    <span className="case-generation-progress__badge">{index + 1}</span>
                    <span className="case-generation-progress__copy">
                      <strong>{step.title}</strong>
                      <span>{step.description}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </aside>

        <Form form={form} layout="vertical" initialValues={initialFormValues} className="case-generation-flow pdf-check-flow">
          {visibleStep === 0 ? (
            <GlassStepCard
            step={1}
            title="选择项目"
            description="模板和核对记录都按项目隔离"
            state={stepState(0)}
            statusNode={selectedProjectId ? <Tag color="blue">已选择</Tag> : <Tag>待选择</Tag>}
          >
            <Form.Item name="project_id" label="项目" rules={[{ required: true, message: '请选择项目' }]}>
              <Select
                showSearch
                options={projectOptions}
                loading={projectsQuery.isLoading}
                placeholder="选择项目"
                onChange={(value) => {
                  form.setFieldsValue({ project_id: coerceSelectId(value as SelectRawValue), template_id: undefined });
                  setCandidateFile(null);
                  setSelectedRecordId(null);
                  setVariableRules(createDefaultVariableRules());
                }}
              />
            </Form.Item>
            <Button type="primary" disabled={!selectedProjectId} onClick={() => setVisibleStep(1)}>
              下一步
            </Button>
            </GlassStepCard>
          ) : null}

          {visibleStep === 1 ? (
            <GlassStepCard
            step={2}
            title="填写测试版本"
            description="用于记录本次AI文件核对的版本上下文"
            state={stepState(1)}
            statusNode={testVersion ? <Tag color="blue">已填写</Tag> : <Tag>待填写</Tag>}
          >
            <Form.Item
              name="test_version"
              label="测试版本"
              rules={[{ required: true, message: '请填写测试版本' }]}
              getValueProps={(value?: string) => ({ value: parseTestVersionDate(value) })}
              normalize={(value: Dayjs | null) => (value ? value.format(TEST_VERSION_DATE_FORMAT) : '')}
            >
              <DatePicker
                allowClear={false}
                inputReadOnly
                format={TEST_VERSION_DATE_FORMAT}
                placeholder="选择测试日期"
                style={{ width: '100%' }}
              />
            </Form.Item>
            <Space>
              <Button onClick={() => setVisibleStep(0)}>上一步</Button>
              <Button
                type="primary"
                onClick={() => void form.validateFields(['test_version']).then(() => setVisibleStep(2))}
              >
                下一步
              </Button>
            </Space>
            </GlassStepCard>
          ) : null}

          {visibleStep === 2 ? (
            <GlassStepCard
            step={3}
            title="选择对比模板"
            description="只展示当前项目可用的PDF模板"
            state={stepState(2)}
            statusNode={selectedTemplateId ? <Tag color="blue">已选择</Tag> : <Tag>待选择</Tag>}
          >
            <Form.Item name="template_id" label="对比模板" rules={[{ required: true, message: '请选择PDF模板' }]}>
              <Select
                showSearch
                options={templateOptions}
                loading={templatesQuery.isFetching}
                placeholder={selectedProjectId ? '选择PDF模板' : '请先选择项目'}
                disabled={selectedProjectId === undefined}
                onChange={(value) => {
                  form.setFieldValue('template_id', coerceSelectId(value as SelectRawValue));
                  setVariableRules(createDefaultVariableRules());
                }}
              />
            </Form.Item>
            <Space>
              <Button onClick={() => setVisibleStep(1)}>上一步</Button>
              <Button
                type="primary"
                onClick={() => void form.validateFields(['template_id']).then(() => setVisibleStep(3))}
              >
                下一步
              </Button>
            </Space>
            </GlassStepCard>
          ) : null}

          {visibleStep === 3 ? (
            <GlassStepCard
            step={4}
            title="设置变量规则"
            description="保单号、日期、客户基本资料等变量差异可不计入失败"
            state={stepState(3)}
            statusNode={variableRules.enabled ? <Tag color="blue">已启用</Tag> : <Tag>未启用</Tag>}
          >
            <div className="pdf-variable-rule-grid">
              <div className="pdf-variable-rule-config">
                <Space direction="vertical" size={14} style={{ width: '100%' }}>
                  <Checkbox
                    checked={variableRules.enabled}
                    onChange={(event) => setVariableRules({ ...variableRules, enabled: event.target.checked })}
                  >
                    启用变量差异忽略
                  </Checkbox>
                  <Checkbox
                    checked={variableRules.use_builtin}
                    disabled={!variableRules.enabled}
                    onChange={(event) => setVariableRules({ ...variableRules, use_builtin: event.target.checked })}
                  >
                    使用内置寿险变量识别
                  </Checkbox>
                  <div>
                    <Text strong>字段关键字</Text>
                    <Input.TextArea
                      rows={5}
                      disabled={!variableRules.enabled}
                      value={variableRules.keywords.join('\n')}
                      onChange={(event) => setVariableRules({ ...variableRules, keywords: splitLines(event.target.value) })}
                    />
                  </div>
                  <div>
                    <Text strong>自定义正则</Text>
                    <Input.TextArea
                      rows={4}
                      disabled={!variableRules.enabled}
                      value={variableRules.regexes.join('\n')}
                      onChange={(event) => setVariableRules({ ...variableRules, regexes: splitLines(event.target.value) })}
                    />
                  </div>
                  <div className="pdf-variable-region-list">
                    <Space align="center" style={{ width: '100%', justifyContent: 'space-between' }}>
                      <Text strong>变量区域</Text>
                      <Button
                        size="small"
                        icon={<PlusOutlined />}
                        disabled={!variableRules.enabled}
                        onClick={() => setVariableRules({
                          ...variableRules,
                          regions: [
                            ...variableRules.regions,
                            {
                              id: `region-${Date.now()}`,
                              name: regionName(variableRules.regions.length),
                              page_number: 1,
                              x: 8,
                              y: 8,
                              width: 84,
                              height: 18,
                            },
                          ],
                        })}
                      >
                        添加区域
                      </Button>
                    </Space>
                    {variableRules.regions.length === 0 ? (
                      <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="可在右侧模板预览拖拽框选" />
                    ) : (
                      <Space direction="vertical" size={8} style={{ width: '100%' }}>
                        {variableRules.regions.map((region, index) => (
                          <div key={region.id} className="pdf-variable-region-row">
                            <Input
                              size="small"
                              value={region.name}
                              disabled={!variableRules.enabled}
                              onChange={(event) => {
                                const regions = variableRules.regions.map((item) =>
                                  item.id === region.id ? { ...item, name: event.target.value } : item,
                                );
                                setVariableRules({ ...variableRules, regions });
                              }}
                            />
                            <InputNumber
                              size="small"
                              min={1}
                              value={region.page_number ?? 1}
                              disabled={!variableRules.enabled}
                              addonBefore="页"
                              onChange={(value) => {
                                const regions = variableRules.regions.map((item) =>
                                  item.id === region.id ? { ...item, page_number: Number(value) || 1 } : item,
                                );
                                setVariableRules({ ...variableRules, regions });
                              }}
                            />
                            <Text type="secondary">{index + 1}</Text>
                            <Button
                              size="small"
                              danger
                              onClick={() => setVariableRules({
                                ...variableRules,
                                regions: variableRules.regions.filter((item) => item.id !== region.id),
                              })}
                            >
                              删除
                            </Button>
                          </div>
                        ))}
                      </Space>
                    )}
                  </div>
                </Space>
              </div>
              <VariableRuleTemplatePreview
                template={templatePreviewQuery.data}
                regions={variableRules.regions}
                disabled={!variableRules.enabled}
                onAddRegion={(region) => setVariableRules({
                  ...variableRules,
                  regions: [...variableRules.regions, region],
                })}
                onRemoveRegion={(regionId) => setVariableRules({
                  ...variableRules,
                  regions: variableRules.regions.filter((region) => region.id !== regionId),
                })}
              />
            </div>
            <Space>
              <Button onClick={() => setVisibleStep(2)}>上一步</Button>
              <Button type="primary" onClick={() => setVisibleStep(4)}>
                下一步
              </Button>
            </Space>
            </GlassStepCard>
          ) : null}

          {visibleStep === 4 ? (
            <GlassStepCard
            step={5}
            title="上传待核对PDF"
            description="上传后直接执行文字级比对"
            state={stepState(4)}
            statusNode={candidateFile ? <Tag color="blue">已上传</Tag> : <Tag>待上传</Tag>}
          >
            <Upload.Dragger
              accept=".pdf,application/pdf"
              maxCount={1}
              showUploadList={false}
              beforeUpload={(file) => {
                setCandidateFile(file);
                return Upload.LIST_IGNORE;
              }}
            >
              <p className="ant-upload-drag-icon">
                <UploadOutlined />
              </p>
              <p className="ant-upload-text">{candidateFile ? candidateFile.name : '点击或拖拽待核对PDF文件到这里'}</p>
              {candidateFile ? (
                <p className="ant-upload-hint">{formatFileSize(candidateFile.size)}</p>
              ) : null}
            </Upload.Dragger>
            <Space>
              <Button onClick={() => setVisibleStep(3)}>上一步</Button>
              <Button type="primary" disabled={!candidateFile} onClick={() => setVisibleStep(5)}>
                下一步
              </Button>
            </Space>
            </GlassStepCard>
          ) : null}

          {visibleStep === 5 ? (
            <GlassStepCard
            step={6}
            title="生成核对结果"
            description="系统判定完成后可进入源样式预览并人工改判"
            state={stepState(5)}
            statusNode={selectedRecord ? resultTag(selectedRecord.final_result) : <Tag>待核对</Tag>}
          >
            <Space wrap>
              <Button onClick={() => setVisibleStep(4)}>上一步</Button>
              <GlowActionButton
                type="primary"
                icon={<ScanOutlined />}
                loading={createMutation.isPending}
                onClick={() => void runCheck()}
              >
                开始核对
              </GlowActionButton>
              <Button
                icon={<ReloadOutlined />}
                disabled={selectedProjectId === undefined}
                onClick={() => void recordsQuery.refetch()}
              >
                刷新记录
              </Button>
            </Space>
            </GlassStepCard>
          ) : null}
        </Form>
      </section>

      <section className="glass-report-detail case-generation-records pdf-check-records">
        <div className="case-generation-result__header">
          <div>
            <Text type="secondary">历史留存</Text>
            <h2>核对记录</h2>
          </div>
          <Button
            icon={<ReloadOutlined />}
            disabled={selectedProjectId === undefined}
            onClick={() => void recordsQuery.refetch()}
          >
            刷新
          </Button>
        </div>
        {recordsQuery.isLoading ? (
          <Spin size="large" style={{ display: 'block', margin: '120px auto' }} />
        ) : selectedProjectId === undefined ? (
          <div style={{ padding: 48 }}>
            <Empty description="请选择项目后查看AI文件核对记录" />
          </div>
        ) : (recordsQuery.data ?? []).length === 0 ? (
          <div style={{ padding: 48 }}>
            <Empty description="当前项目暂无AI文件核对记录" />
          </div>
        ) : (
          <Table
            rowKey="id"
            columns={recordColumns}
            dataSource={recordsQuery.data}
            pagination={{ pageSize: 10, showSizeChanger: false }}
            scroll={{ x: 1540 }}
            className="glass-records-table pdf-check-records-table"
            rowClassName="glass-table-row"
          />
        )}
      </section>

      <Modal
        title={selectedRecord ? `AI文件核对详情 #${selectedRecord.id}` : 'AI文件核对详情'}
        open={selectedRecordId !== null}
        onCancel={closeDetailModal}
        width={detailFullscreen ? 'calc(100vw - 32px)' : 1220}
        footer={selectedRecord ? (
          <Space>
            <Button
              icon={detailFullscreen ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
              onClick={() => setDetailFullscreen((value) => !value)}
            >
              {detailFullscreen ? '退出全屏' : '全屏预览'}
            </Button>
            <Button icon={<EditOutlined />} onClick={openManualModal}>
              人工改判
            </Button>
            <Button icon={<WarningOutlined />} onClick={openOcrModal}>
              修正OCR文本
            </Button>
          </Space>
        ) : null}
        className={`pdf-check-detail-modal${detailFullscreen ? ' pdf-check-detail-modal--fullscreen' : ''}`}
      >
        {detailQuery.isLoading ? (
          <Spin size="large" style={{ display: 'block', margin: '120px auto' }} />
        ) : selectedRecord ? (
          <Space direction="vertical" size={16} style={{ width: '100%' }} className="pdf-check-detail-content">
            <Space wrap>
              <Text strong>系统判定</Text>
              {resultTag(selectedRecord.system_result)}
              <Text strong>最终结果</Text>
              {resultTag(selectedRecord.final_result)}
              {resultSourceTag(selectedRecord.result_source)}
              <Tag color={selectedRecord.diff_count > 0 ? 'error' : 'success'}>失败差异 {selectedRecord.diff_count}</Tag>
              <Tag color="processing">变量差异 {selectedRecord.ignored_diff_count ?? 0}</Tag>
              {selectedRecord.ocr_used ? <Tag color="processing">使用OCR</Tag> : null}
            </Space>

            {selectedRecord.extraction_warning ? (
              <Alert
                type="warning"
                showIcon
                message="文本提取提示"
                description={selectedRecord.extraction_warning}
              />
            ) : null}

            <Descriptions bordered size="small" column={3}>
              <Descriptions.Item label="项目">{selectedRecord.project_name || selectedRecord.project_id}</Descriptions.Item>
              <Descriptions.Item label="测试版本">{selectedRecord.test_version}</Descriptions.Item>
              <Descriptions.Item label="模板">{selectedRecord.template_name}</Descriptions.Item>
              <Descriptions.Item label="模板文件">{selectedRecord.template_file_name}</Descriptions.Item>
              <Descriptions.Item label="核对文件">{selectedRecord.candidate_file_name}</Descriptions.Item>
              <Descriptions.Item label="创建时间">{formatDateTime(selectedRecord.created_at)}</Descriptions.Item>
            </Descriptions>

            <Table
              rowKey="id"
              size="small"
              style={{ display: 'none' }}
              columns={diffColumns}
              dataSource={selectedRecord.diff_items}
              pagination={{ pageSize: 5, showSizeChanger: false }}
              locale={{ emptyText: <Empty description="未发现差异" /> }}
            />

            <div className="pdf-check-preview-scroll">
              <div className="pdf-check-preview-grid">
                <PdfSnapshotPreview snapshot={selectedRecord.template_snapshot} title="模板PDF" />
                <PdfSnapshotPreview snapshot={selectedRecord.candidate_snapshot} title="核对PDF" />
              </div>
            </div>
          </Space>
        ) : (
          <Empty description="未找到AI文件核对记录" />
        )}
      </Modal>

      <Modal
        title="人工修改核对结果"
        open={manualOpen}
        onCancel={() => setManualOpen(false)}
        okText="保存"
        confirmLoading={manualMutation.isPending}
        onOk={() => void manualForm.validateFields().then((values) => {
          if (selectedRecordId !== null) {
            manualMutation.mutate({ recordId: selectedRecordId, values });
          }
        })}
      >
        <Form form={manualForm} layout="vertical">
          <Form.Item name="final_result" label="最终结果" rules={[{ required: true, message: '请选择最终结果' }]}>
            <Select
              options={[
                { value: 'passed', label: '通过' },
                { value: 'failed', label: '失败' },
              ]}
            />
          </Form.Item>
          <Form.Item name="note" label="修改说明">
            <Input.TextArea rows={4} maxLength={1000} showCount />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="修正OCR文本"
        open={ocrOpen}
        onCancel={() => setOcrOpen(false)}
        okText="重新比对"
        width={760}
        confirmLoading={ocrMutation.isPending}
        onOk={() => {
          if (selectedRecordId !== null) {
            ocrMutation.mutate({
              recordId: selectedRecordId,
              side: ocrSide,
              pageNumber: ocrPageNumber,
              text: ocrText,
            });
          }
        }}
      >
        {selectedRecord ? (
          <Space direction="vertical" size={14} style={{ width: '100%' }}>
            <Space wrap>
              <Select
                value={ocrSide}
                options={SIDE_OPTIONS}
                style={{ width: 180 }}
                onChange={(nextSide) => {
                  const nextPage = getSnapshot(selectedRecord, nextSide).pages[0]?.page_number ?? 1;
                  loadOcrText(selectedRecord, nextSide, nextPage);
                }}
              />
              <Select
                value={ocrPageNumber}
                options={ocrPageOptions}
                style={{ width: 140 }}
                onChange={(nextPage) => loadOcrText(selectedRecord, ocrSide, nextPage)}
              />
            </Space>
            <Input.TextArea
              value={ocrText}
              rows={14}
              onChange={(event) => setOcrText(event.target.value)}
            />
          </Space>
        ) : (
          <Empty description="未找到可修正的记录" />
        )}
      </Modal>
    </div>
  );
};

export default PdfCheckPage;

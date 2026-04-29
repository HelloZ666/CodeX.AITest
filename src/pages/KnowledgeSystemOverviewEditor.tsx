import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Dropdown,
  Empty,
  Select,
  Space,
  Spin,
  Switch,
  Tag,
  Typography,
  message,
} from 'antd';
import type { MenuProps } from 'antd';
import {
  ArrowLeftOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  DeleteOutlined,
  DownloadOutlined,
  DownOutlined,
  FlagOutlined,
  FullscreenExitOutlined,
  FullscreenOutlined,
  NodeExpandOutlined,
  PlusOutlined,
  RedoOutlined,
  SaveOutlined,
  StarOutlined,
  UndoOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import DashboardHero from '../components/Layout/DashboardHero';
import { useAppLayout } from '../components/Layout/AppLayout';
import KnowledgeMindMapCanvas, {
  type KnowledgeMindMapContextMenuEvent,
  type KnowledgeMindMapInstance,
  type KnowledgeMindMapRenderNode,
} from '../components/KnowledgeBase/KnowledgeMindMapCanvas';
import type { KnowledgeSystemOverviewDetail, KnowledgeSystemOverviewMindMapData } from '../types';
import {
  extractApiErrorMessage,
  getKnowledgeSystemOverview,
  updateKnowledgeSystemOverview,
} from '../utils/api';
import {
  applyKnowledgeOverviewExpectedResultValidationStyles,
  buildKnowledgeOverviewLeafTagList,
  createDefaultKnowledgeSystemOverviewData,
  filterKnowledgeOverviewVisibleTags,
  hasKnowledgeOverviewExpectedResultTag,
  KNOWLEDGE_OVERVIEW_CASE_LEVEL_OPTIONS,
  normalizeKnowledgeSystemOverviewData,
  parseKnowledgeSystemOverviewImport,
  type KnowledgeOverviewCaseLevel,
  type KnowledgeOverviewCasePolarity,
  type KnowledgeOverviewValidationResult,
  validateKnowledgeOverviewBranchTags,
} from '../utils/knowledgeSystemOverview';

const { Paragraph, Text } = Typography;
const DEFAULT_OVERVIEW_TITLE = '系统功能全景图';
const CONTEXT_MENU_PADDING = 12;
const CONTEXT_MENU_WIDTH = 220;
const CONTEXT_MENU_HEIGHT = 420;
const MIND_MAP_FIT_PADDING = 72;
const DEFAULT_AUTO_SAVE_INTERVAL_MS = 30_000;
const AUTO_SAVE_INTERVAL_OPTIONS: { value: number; label: string }[] = [
  { value: 15_000, label: '15秒' },
  { value: 30_000, label: '30秒' },
  { value: 60_000, label: '1分钟' },
  { value: 120_000, label: '2分钟' },
];
function buildVisibleLeafTagData(
  tagValue: unknown,
  nodeText: string,
  options?: Parameters<typeof buildKnowledgeOverviewLeafTagList>[2],
) {
  return {
    tag: filterKnowledgeOverviewVisibleTags(
      buildKnowledgeOverviewLeafTagList(tagValue, nodeText, options),
    ),
  };
}

const DEFAULT_LEAF_TAG_DATA = buildVisibleLeafTagData([], '');

type PendingImportMeta = {
  sourceFormat: 'xmind' | 'markdown';
  sourceFileName: string;
};

type SaveTrigger = 'manual' | 'auto';
type KnowledgeOverviewExportType = 'md' | 'pdf' | 'xmind' | 'png';

const KNOWLEDGE_OVERVIEW_EXPORT_OPTIONS: Array<{
  key: KnowledgeOverviewExportType;
  label: string;
}> = [
  { key: 'md', label: 'Markdown（.md）' },
  { key: 'pdf', label: 'PDF' },
  { key: 'xmind', label: 'XMind' },
  { key: 'png', label: '图片（PNG）' },
];

function omitMindMapViewState(
  data: KnowledgeSystemOverviewMindMapData | null | undefined,
): KnowledgeSystemOverviewMindMapData | null {
  if (!data) {
    return null;
  }
  const { view: _view, ...rest } = data;
  return JSON.parse(JSON.stringify(rest)) as KnowledgeSystemOverviewMindMapData;
}

function getSourceTagLabel(sourceFormat?: string | null): string {
  if (sourceFormat === 'xmind') {
    return '当前来源：XMind 导入';
  }
  if (sourceFormat === 'markdown') {
    return '当前来源：Markdown 导入';
  }
  return '当前来源：手工维护';
}

function getActiveMindMapNodes(instance: KnowledgeMindMapInstance | null): KnowledgeMindMapRenderNode[] {
  const activeNodeList = instance?.renderer?.activeNodeList;
  return Array.isArray(activeNodeList) ? activeNodeList : [];
}

function getMindMapNodeData(node: KnowledgeMindMapRenderNode): Record<string, unknown> {
  if (typeof node.getData === 'function') {
    const data = node.getData();
    if (data && typeof data === 'object') {
      return data as Record<string, unknown>;
    }
  }
  return node.nodeData?.data ?? {};
}

function getMindMapNodeText(node: KnowledgeMindMapRenderNode): string {
  const data = getMindMapNodeData(node);
  return typeof data.text === 'string' ? data.text : String(data.text ?? '');
}

function getMindMapNodeTags(node: KnowledgeMindMapRenderNode): unknown {
  return getMindMapNodeData(node).tag;
}

function isMindMapLeafNode(node: KnowledgeMindMapRenderNode): boolean {
  return !node.isRoot && (!Array.isArray(node.children) || node.children.length === 0);
}

function getLastChildNode(node: KnowledgeMindMapRenderNode): KnowledgeMindMapRenderNode | null {
  if (!Array.isArray(node.children) || node.children.length <= 0) {
    return null;
  }
  return node.children[node.children.length - 1] ?? null;
}

function nodeHasExpectedResultTag(node: KnowledgeMindMapRenderNode): boolean {
  return hasKnowledgeOverviewExpectedResultTag(getMindMapNodeTags(node));
}

function isKnowledgeOverviewExportType(value: string): value is KnowledgeOverviewExportType {
  return KNOWLEDGE_OVERVIEW_EXPORT_OPTIONS.some((option) => option.key === value);
}

function getKnowledgeOverviewExportLabel(type: KnowledgeOverviewExportType): string {
  return KNOWLEDGE_OVERVIEW_EXPORT_OPTIONS.find((option) => option.key === type)?.label ?? '大纲文件';
}

function getSafeOverviewExportName(title: string): string {
  const safeTitle = title.replace(/[\\/:*?"<>|]/g, '_').trim();
  return safeTitle || DEFAULT_OVERVIEW_TITLE;
}

function buildValidationWarningMessage(validationResult: KnowledgeOverviewValidationResult): string {
  const issues: string[] = [];
  if (!validationResult.hasNegativeBranch) {
    issues.push('至少需要一条包含“反向”标签的分支');
  }
  if (validationResult.missingExpectedResultLeafCount > 0) {
    const previewNodes = validationResult.missingExpectedResultLeafTexts.slice(0, 3).join('、');
    const extraCount = validationResult.missingExpectedResultLeafCount > 3
      ? `等 ${validationResult.missingExpectedResultLeafCount} 个`
      : `${validationResult.missingExpectedResultLeafCount} 个`;
    issues.push(`${extraCount}末级节点缺少“预期结果”标签${previewNodes ? `：${previewNodes}` : ''}`);
  }
  const missingStyleTip = validationResult.missingExpectedResultLeafCount > 0
    ? '，缺少预期结果的节点已标红'
    : '';
  return `已保存，但大纲校验未通过：${issues.join('；')}${missingStyleTip}`;
}

const KnowledgeSystemOverviewEditorPage: React.FC = () => {
  const { overviewId } = useParams<{ overviewId: string }>();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { setPageFullscreenActive } = useAppLayout();
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const workspaceShellRef = useRef<HTMLDivElement | null>(null);
  const contextMenuRef = useRef<HTMLDivElement | null>(null);
  const initializedOverviewIdRef = useRef<string | null>(null);
  const [mindMapInstance, setMindMapInstance] = useState<KnowledgeMindMapInstance | null>(null);
  const [draftData, setDraftData] = useState<KnowledgeSystemOverviewMindMapData | null>(null);
  const [selectedNodeCount, setSelectedNodeCount] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(true);
  const [autoSaveIntervalMs, setAutoSaveIntervalMs] = useState(DEFAULT_AUTO_SAVE_INTERVAL_MS);
  const [contextMenuState, setContextMenuState] = useState<{ x: number; y: number } | null>(null);
  const [pendingImportMeta, setPendingImportMeta] = useState<PendingImportMeta | null>(null);
  const [exportingType, setExportingType] = useState<KnowledgeOverviewExportType | null>(null);

  const overviewQuery = useQuery({
    queryKey: ['knowledge-system-overview', overviewId],
    queryFn: () => getKnowledgeSystemOverview(Number(overviewId)),
    enabled: Boolean(overviewId),
  });

  useEffect(() => {
    if (!overviewQuery.data) {
      return;
    }
    const nextOverviewId = String(overviewQuery.data.id ?? overviewId ?? '');
    if (initializedOverviewIdRef.current === nextOverviewId) {
      return;
    }
    initializedOverviewIdRef.current = nextOverviewId;
    setDraftData(omitMindMapViewState(overviewQuery.data.mind_map_data));
    setPendingImportMeta(null);
  }, [overviewId, overviewQuery.data]);

  const saveMutation = useMutation({
    mutationFn: ({
      payload,
      sourceMeta,
    }: {
      payload: KnowledgeSystemOverviewMindMapData;
      sourceMeta: PendingImportMeta | null;
      trigger: SaveTrigger;
      validationResult: KnowledgeOverviewValidationResult;
    }) => updateKnowledgeSystemOverview(
      Number(overviewId),
      {
        mind_map_data: omitMindMapViewState(payload) ?? payload,
        ...(sourceMeta ? {
          source_format: sourceMeta.sourceFormat,
          source_file_name: sourceMeta.sourceFileName,
        } : {}),
      },
    ),
    onSuccess: async (nextDetail, variables) => {
      if (variables.trigger === 'manual') {
        if (variables.validationResult.isValid) {
          message.success('系统功能全景图已保存');
        } else {
          message.warning(buildValidationWarningMessage(variables.validationResult));
        }
      }
      const savedData = omitMindMapViewState(variables.payload) ?? variables.payload;
      setDraftData(savedData);
      setPendingImportMeta(null);
      queryClient.setQueryData<KnowledgeSystemOverviewDetail>(
        ['knowledge-system-overview', overviewId],
        (current) => ({
          ...(current ?? nextDetail),
          ...nextDetail,
          mind_map_data: savedData,
          ...(variables.sourceMeta ? {
            source_format: variables.sourceMeta.sourceFormat,
            source_file_name: variables.sourceMeta.sourceFileName,
          } : {}),
        }),
      );
      await queryClient.invalidateQueries({ queryKey: ['knowledge-system-overviews'] });
    },
    onError: (error) => {
      message.error(extractApiErrorMessage(error, '系统功能全景图保存失败'));
    },
  });

  const importMutation = useMutation({
    mutationFn: async (file: File) => {
      const title = overviewQuery.data?.title || DEFAULT_OVERVIEW_TITLE;
      return parseKnowledgeSystemOverviewImport(
        file,
        title,
        draftData ?? omitMindMapViewState(overviewQuery.data?.mind_map_data),
      );
    },
    onSuccess: (result) => {
      setDraftData(omitMindMapViewState(result.data));
      setPendingImportMeta({
        sourceFormat: result.sourceFormat,
        sourceFileName: result.sourceFileName,
      });
      message.success('导入内容已加载到画布，点击保存后正式落库');
    },
    onError: (error) => {
      message.error(extractApiErrorMessage(error, '导入文件失败'));
    },
    onSettled: () => {
      if (importInputRef.current) {
        importInputRef.current.value = '';
      }
    },
  });

  const detail = overviewQuery.data;
  const detailTitle = detail?.title || DEFAULT_OVERVIEW_TITLE;
  const persistedMindMapData = useMemo(
    () => omitMindMapViewState(detail?.mind_map_data),
    [detail?.mind_map_data],
  );
  const effectiveData = draftData
    ?? persistedMindMapData
    ?? createDefaultKnowledgeSystemOverviewData(detailTitle);
  const isDirty = useMemo(() => (
    detail ? JSON.stringify(effectiveData) !== JSON.stringify(persistedMindMapData) : false
  ), [detail, effectiveData, persistedMindMapData]);

  const getLatestMindMapPayload = (): KnowledgeSystemOverviewMindMapData | null => {
    if (!mindMapInstance) {
      return effectiveData;
    }

    try {
      const snapshot = normalizeKnowledgeSystemOverviewData(
        mindMapInstance.getData(true),
        detailTitle,
        effectiveData,
      );
      return omitMindMapViewState(snapshot) ?? snapshot;
    } catch {
      return effectiveData;
    }
  };

  const closeContextMenu = () => {
    setContextMenuState(null);
  };

  const syncMindMapViewport = () => {
    if (!mindMapInstance) {
      return;
    }

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        try {
          mindMapInstance.resize();
        } catch {
          // Ignore resize errors raised while the fullscreen transition is settling.
        }

        try {
          mindMapInstance.view.fit(undefined, true, MIND_MAP_FIT_PADDING);
        } catch {
          // Ignore fit errors raised while the SVG tree is still being measured.
        }
      });
    });
  };

  const runMindMapCommand = (command: string, requireSelection: boolean = true) => {
    if (!mindMapInstance) {
      return;
    }
    if (requireSelection && selectedNodeCount <= 0) {
      message.warning('请先点击一个节点后再执行该操作');
      return;
    }
    const activeNodes = getActiveMindMapNodes(mindMapInstance);

    if (
      command === 'INSERT_CHILD_NODE'
      && activeNodes.length > 0
      && activeNodes.some(nodeHasExpectedResultTag)
    ) {
      message.warning('预期结果节点是末级节点，不能继续添加子节点');
      return;
    }

    if (command === 'INSERT_CHILD_NODE') {
      if (activeNodes.length <= 0) {
        mindMapInstance.execCommand(command, true, [], DEFAULT_LEAF_TAG_DATA);
        return;
      }

      activeNodes.forEach((node) => {
        const currentTags = getMindMapNodeTags(node);
        const currentTagList = Array.isArray(currentTags) ? currentTags : [];
        const childTagData = buildVisibleLeafTagData(currentTags, getMindMapNodeText(node), {
          expected: false,
        });
        if (currentTagList.length > 0) {
          mindMapInstance.execCommand('SET_NODE_TAG', node, []);
        }
        mindMapInstance.execCommand(command, true, [node], childTagData);
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            const childNode = getLastChildNode(node)
              ?? getActiveMindMapNodes(mindMapInstance).find((activeNode) => activeNode.parent === node);
            if (childNode) {
              mindMapInstance.execCommand('SET_NODE_TAG', childNode, childTagData.tag);
            }
          });
        });
      });
      return;
    }

    if (command === 'INSERT_NODE') {
      mindMapInstance.execCommand(command, true, [], DEFAULT_LEAF_TAG_DATA);
      return;
    }

    mindMapInstance.execCommand(command);
  };

  const applyMindMapTag = (tag: KnowledgeOverviewCasePolarity | 'expected') => {
    if (!mindMapInstance) {
      return;
    }
    const activeNodes = getActiveMindMapNodes(mindMapInstance);
    if (activeNodes.length <= 0) {
      message.warning('请先点击一个末级节点后再标记用例类型或预期结果');
      return;
    }
    if (activeNodes.some((node) => !isMindMapLeafNode(node))) {
      message.warning('只有末级节点可以标记用例类型或预期结果');
      return;
    }

    activeNodes.forEach((node) => {
      const shouldMarkExpected = tag === 'expected'
        ? !nodeHasExpectedResultTag(node)
        : nodeHasExpectedResultTag(node);
      const nextTags = buildKnowledgeOverviewLeafTagList(
        getMindMapNodeTags(node),
        getMindMapNodeText(node),
        {
          ...(tag === 'positive' || tag === 'negative' ? { polarity: tag } : {}),
          expected: shouldMarkExpected,
        },
      );
      mindMapInstance.execCommand('SET_NODE_TAG', node, filterKnowledgeOverviewVisibleTags(nextTags));
    });
    closeContextMenu();
  };

  const applyMindMapLevel = (level: KnowledgeOverviewCaseLevel) => {
    if (!mindMapInstance) {
      return;
    }
    const activeNodes = getActiveMindMapNodes(mindMapInstance);
    if (activeNodes.length <= 0) {
      message.warning('请先点击一个末级节点后再标记用例等级');
      return;
    }
    if (activeNodes.some((node) => !isMindMapLeafNode(node))) {
      message.warning('只有末级节点可以标记用例等级');
      return;
    }

    activeNodes.forEach((node) => {
      const nextTags = buildKnowledgeOverviewLeafTagList(
        getMindMapNodeTags(node),
        getMindMapNodeText(node),
        {
          level,
          expected: nodeHasExpectedResultTag(node),
        },
      );
      mindMapInstance.execCommand('SET_NODE_TAG', node, filterKnowledgeOverviewVisibleTags(nextTags));
    });
    closeContextMenu();
  };

  const saveMindMap = (trigger: SaveTrigger) => {
    const latestPayload = getLatestMindMapPayload();
    if (!latestPayload) {
      return;
    }
    const validationResult = validateKnowledgeOverviewBranchTags(latestPayload);
    const payloadWithValidationStyles = applyKnowledgeOverviewExpectedResultValidationStyles(latestPayload);
    closeContextMenu();
    setDraftData(payloadWithValidationStyles);
    saveMutation.mutate({
      payload: payloadWithValidationStyles,
      sourceMeta: pendingImportMeta,
      trigger,
      validationResult,
    });
  };

  const handleSave = () => {
    saveMindMap('manual');
  };

  const exportMindMap = async (type: KnowledgeOverviewExportType) => {
    if (!mindMapInstance) {
      message.warning('画布尚未加载完成，请稍后再下载');
      return;
    }
    if (typeof mindMapInstance.export !== 'function') {
      message.error('当前画布暂不支持大纲下载');
      return;
    }

    closeContextMenu();
    setExportingType(type);
    try {
      const result = await mindMapInstance.export(type, true, getSafeOverviewExportName(detailTitle));
      if (result == null) {
        throw new Error('导出插件未返回文件内容');
      }
      message.success(`${getKnowledgeOverviewExportLabel(type)}已下载`);
    } catch (error) {
      message.error(extractApiErrorMessage(error, '大纲下载失败'));
    } finally {
      setExportingType(null);
    }
  };

  const handleToggleFullscreen = () => {
    closeContextMenu();
    setIsFullscreen((current) => !current);
  };

  const handleNodeActionMenuClick: MenuProps['onClick'] = ({ key }) => {
    if (key === 'child') {
      runMindMapCommand('INSERT_CHILD_NODE');
      return;
    }
    if (key === 'sibling') {
      runMindMapCommand('INSERT_NODE');
      return;
    }
    if (key === 'delete') {
      runMindMapCommand('REMOVE_CURRENT_NODE');
    }
  };

  const handleTagMenuClick: MenuProps['onClick'] = ({ key }) => {
    if (key === 'positive' || key === 'negative' || key === 'expected') {
      applyMindMapTag(key);
    }
  };

  const handleCaseLevelMenuClick: MenuProps['onClick'] = ({ key }) => {
    if (key === 'core' || key === 'important' || key === 'normal') {
      applyMindMapLevel(key);
    }
  };

  const handleHistoryMenuClick: MenuProps['onClick'] = ({ key }) => {
    if (key === 'undo') {
      mindMapInstance?.execCommand('BACK');
      return;
    }
    if (key === 'redo') {
      mindMapInstance?.execCommand('FORWARD');
    }
  };

  const handleViewMenuClick: MenuProps['onClick'] = ({ key }) => {
    if (key === 'fullscreen') {
      handleToggleFullscreen();
    }
  };

  const handleExportMenuClick: MenuProps['onClick'] = ({ key }) => {
    const exportType = String(key);
    if (isKnowledgeOverviewExportType(exportType)) {
      void exportMindMap(exportType);
    }
  };

  const handleNodeContextMenu = (event: KnowledgeMindMapContextMenuEvent) => {
    event.preventDefault?.();
    event.stopPropagation?.();

    const maxX = Math.max(CONTEXT_MENU_PADDING, window.innerWidth - CONTEXT_MENU_WIDTH - CONTEXT_MENU_PADDING);
    const maxY = Math.max(CONTEXT_MENU_PADDING, window.innerHeight - CONTEXT_MENU_HEIGHT - CONTEXT_MENU_PADDING);

    setSelectedNodeCount((current) => (current > 0 ? current : 1));
    setContextMenuState({
      x: Math.min(Math.max(event.clientX, CONTEXT_MENU_PADDING), maxX),
      y: Math.min(Math.max(event.clientY, CONTEXT_MENU_PADDING), maxY),
    });
  };

  const handleCanvasContextMenu = () => {
    closeContextMenu();
  };

  const handleImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    importMutation.mutate(file);
  };

  useEffect(() => {
    if (!isFullscreen) {
      return undefined;
    }

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isFullscreen]);

  useEffect(() => {
    setPageFullscreenActive(isFullscreen);

    return () => {
      setPageFullscreenActive(false);
    };
  }, [isFullscreen, setPageFullscreenActive]);

  useEffect(() => {
    if (!mindMapInstance) {
      return undefined;
    }

    closeContextMenu();
    const frameId = requestAnimationFrame(() => {
      syncMindMapViewport();
    });

    return () => {
      cancelAnimationFrame(frameId);
    };
  }, [isFullscreen, mindMapInstance]);

  useEffect(() => {
    if (!autoSaveEnabled) {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      if (!detail || !isDirty || saveMutation.isPending) {
        return;
      }
      saveMindMap('auto');
    }, autoSaveIntervalMs);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [autoSaveEnabled, autoSaveIntervalMs, detail, isDirty, saveMutation.isPending, mindMapInstance, draftData, pendingImportMeta]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isFullscreen && !contextMenuState) {
        event.preventDefault();
        setIsFullscreen(false);
        return;
      }

      const isSaveShortcut = (event.ctrlKey || event.metaKey)
        && event.key.toLowerCase() === 's';
      if (!isSaveShortcut) {
        return;
      }

      event.preventDefault();
      if (!detail || !isDirty || saveMutation.isPending) {
        return;
      }
      handleSave();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [contextMenuState, detail, isDirty, isFullscreen, saveMutation.isPending, mindMapInstance, draftData, pendingImportMeta]);

  useEffect(() => {
    if (!contextMenuState) {
      return undefined;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (contextMenuRef.current?.contains(event.target as Node)) {
        return;
      }
      closeContextMenu();
    };

    const handleResize = () => {
      closeContextMenu();
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeContextMenu();
      }
    };

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('resize', handleResize);
    window.addEventListener('scroll', handleResize, true);
    window.addEventListener('keydown', handleEscape);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('scroll', handleResize, true);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [contextMenuState]);

  if (overviewQuery.isLoading) {
    return <Spin size="large" style={{ display: 'block', margin: '120px auto' }} />;
  }

  if (!detail) {
    return (
      <Card variant="borderless">
        <Empty description="未找到对应的系统功能全景图" />
      </Card>
    );
  }

  return (
    <div className="knowledge-overview-editor">
      <DashboardHero
        eyebrow="知识库管理"
        title={detail.title}
        description={(
          <span>
            所属项目：<strong>{detail.project_name}</strong>
            {' '}· 创建人：{detail.creator_name || '--'}
          </span>
        )}
        chips={[
          { label: getSourceTagLabel(detail.source_format), tone: 'accent' },
          { label: isDirty ? '当前有未保存修改' : '当前内容已保存', tone: isDirty ? 'gold' : 'neutral' },
        ]}
      />

      <Alert
        type="info"
        showIcon
        className="knowledge-overview-editor__alert"
        title="画布支持双击节点编辑、右键节点快捷操作、下载大纲以及 Ctrl+S / Cmd+S 保存；保存时会校验反向分支和末级预期结果标签，校验不通过仍会保存并标红缺少预期结果的节点。"
      />

      <div
        ref={workspaceShellRef}
        className={`knowledge-overview-editor__workspace-shell${isFullscreen ? ' knowledge-overview-editor__workspace-shell--fullscreen' : ''}`}
      >
        <Card variant="borderless" className="knowledge-overview-editor__workspace">
          <div className="knowledge-overview-editor__toolbar">
            <Space wrap className="knowledge-overview-editor__toolbar-actions">
              <Button
                icon={<ArrowLeftOutlined />}
                onClick={() => navigate('/knowledge-base/system-overview')}
              >
                返回列表
              </Button>
              <Button
                icon={<UploadOutlined />}
                onClick={() => importInputRef.current?.click()}
                loading={importMutation.isPending}
              >
                导入文件
              </Button>
              <Dropdown
                menu={{
                  items: KNOWLEDGE_OVERVIEW_EXPORT_OPTIONS.map(({ key, label }) => ({
                    key,
                    icon: <DownloadOutlined />,
                    label,
                  })),
                  onClick: handleExportMenuClick,
                }}
                trigger={['click']}
              >
                <Button
                  icon={<DownloadOutlined />}
                  loading={exportingType !== null}
                  disabled={!mindMapInstance}
                >
                  下载大纲 <DownOutlined />
                </Button>
              </Dropdown>
              <Button
                type="primary"
                icon={<SaveOutlined />}
                onClick={handleSave}
                loading={saveMutation.isPending}
                disabled={!isDirty}
              >
                保存大纲
              </Button>
              <Dropdown
                menu={{
                  items: [
                    { key: 'child', icon: <PlusOutlined />, label: '子节点' },
                    { key: 'sibling', icon: <NodeExpandOutlined />, label: '同级节点' },
                    { key: 'delete', icon: <DeleteOutlined />, label: '删除节点', danger: true },
                  ],
                  onClick: handleNodeActionMenuClick,
                }}
                trigger={['click']}
              >
                <Button icon={<NodeExpandOutlined />}>
                  节点操作 <DownOutlined />
                </Button>
              </Dropdown>
              <Dropdown
                menu={{
                  items: [
                    { key: 'positive', icon: <CheckCircleOutlined />, label: '正向' },
                    { key: 'negative', icon: <CloseCircleOutlined />, label: '反向' },
                    { key: 'expected', icon: <FlagOutlined />, label: '预期结果' },
                  ],
                  onClick: handleTagMenuClick,
                }}
                trigger={['click']}
              >
                <Button icon={<FlagOutlined />}>
                  用例类型 <DownOutlined />
                </Button>
              </Dropdown>
              <Dropdown
                menu={{
                  items: KNOWLEDGE_OVERVIEW_CASE_LEVEL_OPTIONS.map(({ value, label }) => ({
                    key: value,
                    icon: <StarOutlined />,
                    label,
                  })),
                  onClick: handleCaseLevelMenuClick,
                }}
                trigger={['click']}
              >
                <Button icon={<StarOutlined />}>
                  用例等级 <DownOutlined />
                </Button>
              </Dropdown>
              <Dropdown
                menu={{
                  items: [
                    { key: 'undo', icon: <UndoOutlined />, label: '撤销', disabled: !mindMapInstance },
                    { key: 'redo', icon: <RedoOutlined />, label: '重做', disabled: !mindMapInstance },
                  ],
                  onClick: handleHistoryMenuClick,
                }}
                trigger={['click']}
              >
                <Button icon={<UndoOutlined />}>
                  历史操作 <DownOutlined />
                </Button>
              </Dropdown>
              <Dropdown
                menu={{
                  items: [
                    {
                      key: 'fullscreen',
                      icon: isFullscreen ? <FullscreenExitOutlined /> : <FullscreenOutlined />,
                      label: isFullscreen ? '退出页面全屏' : '页面全屏',
                    },
                  ],
                  onClick: handleViewMenuClick,
                }}
                trigger={['click']}
              >
                <Button icon={isFullscreen ? <FullscreenExitOutlined /> : <FullscreenOutlined />}>
                  视图 <DownOutlined />
                </Button>
              </Dropdown>
              <span className="knowledge-overview-editor__autosave-control">
                <span className="knowledge-overview-editor__autosave-toggle">
                  <Text type="secondary">自动保存</Text>
                  <Switch
                    aria-label="自动保存"
                    checked={autoSaveEnabled}
                    checkedChildren="开"
                    unCheckedChildren="关"
                    onChange={setAutoSaveEnabled}
                  />
                </span>
                <Select
                  aria-label="自动保存间隔"
                  size="small"
                  value={autoSaveIntervalMs}
                  options={AUTO_SAVE_INTERVAL_OPTIONS}
                  onChange={setAutoSaveIntervalMs}
                  className="knowledge-overview-editor__autosave-select"
                />
              </span>
            </Space>
            <Space size={12}>
              <Tag color={selectedNodeCount > 0 ? 'blue' : 'default'}>
                {selectedNodeCount > 0 ? `已选中 ${selectedNodeCount} 个节点` : '未选中节点'}
              </Tag>
              <Text type="secondary">创建于 {new Date(detail.created_at).toLocaleString('zh-CN')}</Text>
            </Space>
          </div>

          <Paragraph className="knowledge-overview-editor__description">
            {detail.description || '当前未填写额外说明，可直接在画布中维护系统功能全景图。'}
          </Paragraph>

          <div className="knowledge-overview-editor__canvas-shell">
            <KnowledgeMindMapCanvas
              value={effectiveData}
              fallbackTitle={detailTitle}
              onChange={(nextValue) => {
                const nextDraftData = omitMindMapViewState(nextValue);
                setDraftData((current) => (
                  JSON.stringify(current) === JSON.stringify(nextDraftData) ? current : nextDraftData
                ));
              }}
              onReady={setMindMapInstance}
              onSelectionChange={setSelectedNodeCount}
              onNodeContextMenu={handleNodeContextMenu}
              onCanvasContextMenu={handleCanvasContextMenu}
            />
          </div>
        </Card>
      </div>

      {contextMenuState ? (
        <div
          ref={contextMenuRef}
          role="menu"
          className="knowledge-overview-editor__context-menu"
          style={{ left: `${contextMenuState.x}px`, top: `${contextMenuState.y}px` }}
        >
          <button
            type="button"
            className="knowledge-overview-editor__context-menu-item"
            onClick={() => {
              closeContextMenu();
              runMindMapCommand('INSERT_CHILD_NODE', false);
            }}
          >
            添加子节点
          </button>
          <button
            type="button"
            className="knowledge-overview-editor__context-menu-item"
            onClick={() => {
              closeContextMenu();
              runMindMapCommand('INSERT_NODE', false);
            }}
          >
            添加同级节点
          </button>
          <button
            type="button"
            className="knowledge-overview-editor__context-menu-item"
            onClick={() => {
              closeContextMenu();
              runMindMapCommand('REMOVE_CURRENT_NODE', false);
            }}
          >
            删除节点
          </button>
          <button
            type="button"
            className="knowledge-overview-editor__context-menu-item"
            onClick={() => applyMindMapTag('positive')}
          >
            标记正向
          </button>
          <button
            type="button"
            className="knowledge-overview-editor__context-menu-item"
            onClick={() => applyMindMapTag('negative')}
          >
            标记反向
          </button>
          <button
            type="button"
            className="knowledge-overview-editor__context-menu-item"
            onClick={() => applyMindMapTag('expected')}
          >
            切换预期结果
          </button>
          <button
            type="button"
            className="knowledge-overview-editor__context-menu-item"
            onClick={() => {
              closeContextMenu();
              mindMapInstance?.execCommand('BACK');
            }}
          >
            撤销
          </button>
          <button
            type="button"
            className="knowledge-overview-editor__context-menu-item"
            onClick={() => {
              closeContextMenu();
              mindMapInstance?.execCommand('FORWARD');
            }}
          >
            重做
          </button>
        </div>
      ) : null}

      <input
        ref={importInputRef}
        type="file"
        accept=".xmind,.md,.markdown,text/markdown"
        className="knowledge-overview-import-input"
        onChange={(event) => void handleImportFile(event)}
      />
    </div>
  );
};

export default KnowledgeSystemOverviewEditorPage;

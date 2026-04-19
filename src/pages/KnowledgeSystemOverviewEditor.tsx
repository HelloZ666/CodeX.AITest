import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Empty,
  Space,
  Spin,
  Tag,
  Typography,
  message,
} from 'antd';
import {
  ArrowLeftOutlined,
  DeleteOutlined,
  FullscreenExitOutlined,
  FullscreenOutlined,
  NodeExpandOutlined,
  PlusOutlined,
  RedoOutlined,
  SaveOutlined,
  UndoOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import DashboardHero from '../components/Layout/DashboardHero';
import KnowledgeMindMapCanvas, {
  type KnowledgeMindMapContextMenuEvent,
  type KnowledgeMindMapInstance,
} from '../components/KnowledgeBase/KnowledgeMindMapCanvas';
import type { KnowledgeSystemOverviewMindMapData } from '../types';
import {
  extractApiErrorMessage,
  getKnowledgeSystemOverview,
  updateKnowledgeSystemOverview,
} from '../utils/api';
import {
  createDefaultKnowledgeSystemOverviewData,
  normalizeKnowledgeSystemOverviewData,
  parseKnowledgeSystemOverviewImport,
} from '../utils/knowledgeSystemOverview';

const { Paragraph, Text } = Typography;
const DEFAULT_OVERVIEW_TITLE = '系统功能全景图';
const CONTEXT_MENU_PADDING = 12;
const CONTEXT_MENU_WIDTH = 220;
const CONTEXT_MENU_HEIGHT = 296;
const MIND_MAP_FIT_PADDING = 72;

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

const KnowledgeSystemOverviewEditorPage: React.FC = () => {
  const { overviewId } = useParams<{ overviewId: string }>();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const workspaceShellRef = useRef<HTMLDivElement | null>(null);
  const contextMenuRef = useRef<HTMLDivElement | null>(null);
  const [mindMapInstance, setMindMapInstance] = useState<KnowledgeMindMapInstance | null>(null);
  const [draftData, setDraftData] = useState<KnowledgeSystemOverviewMindMapData | null>(null);
  const [selectedNodeCount, setSelectedNodeCount] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [contextMenuState, setContextMenuState] = useState<{ x: number; y: number } | null>(null);
  const [pendingImportMeta, setPendingImportMeta] = useState<{
    sourceFormat: 'xmind' | 'markdown';
    sourceFileName: string;
  } | null>(null);

  const overviewQuery = useQuery({
    queryKey: ['knowledge-system-overview', overviewId],
    queryFn: () => getKnowledgeSystemOverview(Number(overviewId)),
    enabled: Boolean(overviewId),
  });

  useEffect(() => {
    if (!overviewQuery.data) {
      return;
    }
    setDraftData(omitMindMapViewState(overviewQuery.data.mind_map_data));
  }, [overviewQuery.data]);

  const saveMutation = useMutation({
    mutationFn: (payload: KnowledgeSystemOverviewMindMapData) => updateKnowledgeSystemOverview(
      Number(overviewId),
      {
        mind_map_data: omitMindMapViewState(payload) ?? payload,
        ...(pendingImportMeta ? {
          source_format: pendingImportMeta.sourceFormat,
          source_file_name: pendingImportMeta.sourceFileName,
        } : {}),
      },
    ),
    onSuccess: async (nextDetail) => {
      message.success('系统功能全景图已保存');
      setDraftData(omitMindMapViewState(nextDetail.mind_map_data));
      setPendingImportMeta(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['knowledge-system-overview', overviewId] }),
        queryClient.invalidateQueries({ queryKey: ['knowledge-system-overviews'] }),
      ]);
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
    mindMapInstance.execCommand(command);
  };

  const handleSave = () => {
    const latestPayload = getLatestMindMapPayload();
    if (!latestPayload) {
      return;
    }
    closeContextMenu();
    setDraftData(latestPayload);
    saveMutation.mutate(latestPayload);
  };

  const handleToggleFullscreen = () => {
    closeContextMenu();
    setIsFullscreen((current) => !current);
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
        actions={(
          <Space wrap>
            <Button
              size="large"
              icon={<ArrowLeftOutlined />}
              onClick={() => navigate('/knowledge-base/system-overview')}
            >
              返回列表
            </Button>
            <Button
              size="large"
              icon={<UploadOutlined />}
              onClick={() => importInputRef.current?.click()}
              loading={importMutation.isPending}
            >
              导入文件
            </Button>
            <Button
              type="primary"
              size="large"
              icon={<SaveOutlined />}
              onClick={handleSave}
              loading={saveMutation.isPending}
              disabled={!isDirty}
            >
              保存大纲
            </Button>
          </Space>
        )}
      />

      <Alert
        type="info"
        showIcon
        className="knowledge-overview-editor__alert"
        title="画布支持双击节点编辑、右键节点快捷操作，以及 Ctrl+S / Cmd+S 保存；先点击节点后也可使用顶部按钮新增子节点、同级节点、删除、撤销与重做。"
      />

      <div
        ref={workspaceShellRef}
        className={`knowledge-overview-editor__workspace-shell${isFullscreen ? ' knowledge-overview-editor__workspace-shell--fullscreen' : ''}`}
      >
        <Card variant="borderless" className="knowledge-overview-editor__workspace">
          <div className="knowledge-overview-editor__toolbar">
            <Space wrap>
              <Button icon={<PlusOutlined />} onClick={() => runMindMapCommand('INSERT_CHILD_NODE')}>
                子节点
              </Button>
              <Button icon={<NodeExpandOutlined />} onClick={() => runMindMapCommand('INSERT_NODE')}>
                同级节点
              </Button>
              <Button danger icon={<DeleteOutlined />} onClick={() => runMindMapCommand('REMOVE_CURRENT_NODE')}>
                删除节点
              </Button>
              <Button
                icon={<UndoOutlined />}
                onClick={() => mindMapInstance?.execCommand('BACK')}
                disabled={!mindMapInstance}
              >
                撤销
              </Button>
              <Button
                icon={<RedoOutlined />}
                onClick={() => mindMapInstance?.execCommand('FORWARD')}
                disabled={!mindMapInstance}
              >
                重做
              </Button>
              <Button
                icon={isFullscreen ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
                onClick={handleToggleFullscreen}
              >
                {isFullscreen ? '退出页面全屏' : '页面全屏'}
              </Button>
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
              onChange={(nextValue) => setDraftData(omitMindMapViewState(nextValue))}
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

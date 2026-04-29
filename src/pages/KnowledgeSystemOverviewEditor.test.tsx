import { useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { Mock } from 'vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import KnowledgeSystemOverviewEditorPage from './KnowledgeSystemOverviewEditor';

vi.mock('../utils/api', () => ({
  extractApiErrorMessage: vi.fn((error: Error, fallback: string) => error.message || fallback),
  getKnowledgeSystemOverview: vi.fn(),
  updateKnowledgeSystemOverview: vi.fn(),
}));

let latestCanvasValue: Record<string, unknown> | null = null;
let instanceData: Record<string, unknown> = {
  layout: 'logicalStructure',
  root: { data: { text: 'Payment Overview', expand: true }, children: [] },
};
const execCommandMock = vi.fn();
const exportMock = vi.fn();
const fitMock = vi.fn();
const resizeMock = vi.fn();

interface MockMindMapNode {
  isRoot?: boolean;
  children?: MockMindMapNode[];
  parent?: MockMindMapNode | null;
  nodeData: {
    data: Record<string, unknown>;
    children?: MockMindMapNode[];
  };
  getData: (key?: string) => unknown;
}

let activeNodeList: MockMindMapNode[] = [];

class ResizeObserverMock {
  observe() {}

  unobserve() {}

  disconnect() {}
}

function createMockMindMapNode(
  text: string,
  tag: unknown[] = [],
  children: MockMindMapNode[] = [],
): MockMindMapNode {
  const node: MockMindMapNode = {
    children,
    parent: null,
    nodeData: {
      data: { text, tag },
      children,
    },
    getData: (key?: string) => {
      const data = node.nodeData.data;
      return key ? data[key] : data;
    },
  };
  children.forEach((child) => {
    child.parent = node;
  });
  return node;
}

function setActiveNode(node: MockMindMapNode | null) {
  activeNodeList = node ? [node] : [];
}

vi.mock('../components/KnowledgeBase/KnowledgeMindMapCanvas', () => ({
  default: ({
    value,
    onChange,
    onReady,
    onNodeContextMenu,
    onCanvasContextMenu,
    onSelectionChange,
  }: {
    value: Record<string, unknown>;
    onChange: (data: Record<string, unknown>) => void;
    onReady?: (instance: {
      execCommand: (command: string, ...args: unknown[]) => void;
      export: (type: string, isDownload?: boolean, name?: string) => Promise<unknown>;
      getData: () => Record<string, unknown>;
      resize: () => void;
      renderer: { activeNodeList: MockMindMapNode[] };
      view: { fit: (...args: unknown[]) => void };
    } | null) => void;
    onNodeContextMenu?: (event: { clientX: number; clientY: number }) => void;
    onCanvasContextMenu?: (event: { clientX: number; clientY: number }) => void;
    onSelectionChange?: (count: number) => void;
  }) => {
    latestCanvasValue = value;

    useEffect(() => {
      onReady?.({
        execCommand: execCommandMock,
        export: exportMock,
        getData: vi.fn(() => instanceData),
        resize: resizeMock,
        renderer: {
          get activeNodeList() {
            return activeNodeList;
          },
        },
        view: { fit: fitMock },
      });
      return () => onReady?.(null);
    }, [onReady]);

    return (
      <div>
        <button
          type="button"
          onClick={() => onChange({
            layout: 'logicalStructure',
            root: {
              data: { text: 'Edited Overview', expand: true },
              children: [{ data: { text: 'Node A', expand: true }, children: [] }],
            },
          })}
        >
          Mock Edit
        </button>
        <button
          type="button"
          onClick={() => {
            instanceData = {
              layout: 'logicalStructure',
              view: {
                transform: { scaleX: 1, scaleY: 1 },
                state: { scale: 1, x: 0, y: 0, sx: 0, sy: 0 },
              },
              root: {
                data: { text: 'Latest Overview', expand: true },
                children: [{ data: { text: 'Node B', expand: true }, children: [] }],
              },
            };
          }}
        >
          Update Instance Snapshot
        </button>
        <button
          type="button"
          onClick={() => {
            if (activeNodeList.length <= 0) {
              setActiveNode(createMockMindMapNode('Context Node'));
            }
            onSelectionChange?.(1);
            onNodeContextMenu?.({ clientX: 260, clientY: 180 });
          }}
        >
          Open Node Context Menu
        </button>
        <button
          type="button"
          onClick={() => onCanvasContextMenu?.({ clientX: 32, clientY: 48 })}
        >
          Open Canvas Context Menu
        </button>
        <div>Mind Map Canvas</div>
      </div>
    );
  },
}));

import {
  getKnowledgeSystemOverview,
  updateKnowledgeSystemOverview,
} from '../utils/api';

function renderWithProviders() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/knowledge-base/system-overview/3']}>
        <Routes>
          <Route path="/knowledge-base/system-overview/:overviewId" element={<KnowledgeSystemOverviewEditorPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('KnowledgeSystemOverviewEditorPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    latestCanvasValue = null;
    activeNodeList = [];
    instanceData = {
      layout: 'logicalStructure',
      root: {
        data: { text: 'Payment Overview', expand: true },
        children: [{ data: { text: 'Persisted Node', expand: true }, children: [] }],
      },
    };
    (getKnowledgeSystemOverview as Mock).mockResolvedValue({
      id: 3,
      project_id: 21,
      project_name: 'Payment Center',
      title: 'Payment Overview',
      outline_category: '功能视图',
      description: 'Overview description',
      creator_name: 'Admin',
      creator_username: 'admin',
      creator_display_name: 'Admin',
      source_format: 'manual',
      source_file_name: null,
      created_at: '2026-04-19T10:00:00Z',
      updated_at: '2026-04-19T10:00:00Z',
      mind_map_data: instanceData,
    });
    (updateKnowledgeSystemOverview as Mock).mockResolvedValue({
      mind_map_data: instanceData,
    });
    exportMock.mockResolvedValue('data:application/octet-stream;base64,AA==');
    execCommandMock.mockImplementation((command: string, ...args: unknown[]) => {
      if (command === 'SET_NODE_TAG') {
        const node = args[0] as MockMindMapNode | undefined;
        const tag = args[1] as unknown[];
        if (node?.nodeData?.data) {
          node.nodeData.data.tag = tag;
        }
        return;
      }

      if (command === 'INSERT_CHILD_NODE') {
        const appointNodes = Array.isArray(args[1]) ? args[1] as MockMindMapNode[] : [];
        const appointData = args[2] as { tag?: unknown[] } | undefined;
        appointNodes.forEach((node) => {
          const childNode = createMockMindMapNode('New Node', appointData?.tag ?? []);
          childNode.parent = node;
          node.children = [...(node.children ?? []), childNode];
          node.nodeData.children = node.children;
          activeNodeList = [childNode];
        });
      }
    });
    vi.stubGlobal('requestAnimationFrame', ((callback: FrameRequestCallback) => {
      return window.setTimeout(() => callback(0), 0);
    }) as typeof requestAnimationFrame);
    vi.stubGlobal('cancelAnimationFrame', ((handle: number) => {
      window.clearTimeout(handle);
    }) as typeof cancelAnimationFrame);
    vi.stubGlobal('ResizeObserver', ResizeObserverMock);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('uses persisted data as the initial canvas value and does not mark the page dirty', async () => {
    renderWithProviders();

    expect(await screen.findByText('Payment Overview')).toBeInTheDocument();
    expect(screen.getByText('Mind Map Canvas')).toBeInTheDocument();

    await waitFor(() => {
      expect(latestCanvasValue).toEqual(expect.objectContaining({
        root: expect.objectContaining({
          children: [
            expect.objectContaining({
              data: expect.objectContaining({ text: 'Persisted Node' }),
            }),
          ],
        }),
      }));
    });

    expect(screen.getByRole('button', { name: /保存大纲/ })).toBeDisabled();
    expect(screen.getByText('当前内容已保存')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '适应画布' })).not.toBeInTheDocument();
  });

  it('saves the latest canvas snapshot from the instance', async () => {
    renderWithProviders();

    expect(await screen.findByText('Payment Overview')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Mock Edit'));
    fireEvent.click(screen.getByText('Update Instance Snapshot'));
    fireEvent.click(screen.getByRole('button', { name: /保存大纲/ }));

    await waitFor(() => {
      expect(updateKnowledgeSystemOverview).toHaveBeenCalledWith(3, {
        mind_map_data: expect.objectContaining({
          root: expect.objectContaining({
            data: expect.objectContaining({ text: 'Latest Overview' }),
          }),
        }),
      });
      expect((updateKnowledgeSystemOverview as Mock).mock.calls[0][1].mind_map_data.view).toBeUndefined();
    });
  });

  it('saves invalid outlines and marks final nodes without expected result tags red', async () => {
    instanceData = {
      layout: 'logicalStructure',
      root: {
        data: { text: 'Payment Overview', expand: true },
        children: [{ data: { text: '支付失败', tag: ['反向'] }, children: [] }],
      },
    };
    renderWithProviders();

    expect(await screen.findByText('Payment Overview')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Mock Edit'));
    fireEvent.click(screen.getByRole('button', { name: /保存大纲/ }));

    await waitFor(() => {
      expect(updateKnowledgeSystemOverview).toHaveBeenCalledWith(3, {
        mind_map_data: expect.objectContaining({
          root: expect.objectContaining({
            children: [
              expect.objectContaining({
                data: expect.objectContaining({
                  _knowledgeOverviewExpectedResultMissing: true,
                  fillColor: '#fee2e2',
                  borderColor: '#dc2626',
                  borderWidth: 2,
                  color: '#991b1b',
                }),
              }),
            ],
          }),
        }),
      });
    });
  });

  it('downloads the outline as the selected export format', async () => {
    renderWithProviders();

    expect(await screen.findByText('Payment Overview')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /下载大纲/ }));
    fireEvent.click(await screen.findByRole('menuitem', { name: /Markdown/ }));

    await waitFor(() => {
      expect(exportMock).toHaveBeenCalledWith('md', true, 'Payment Overview');
    });
  });

  it('saves the outline when Ctrl+S is pressed', async () => {
    renderWithProviders();

    expect(await screen.findByText('Payment Overview')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Mock Edit'));
    fireEvent.keyDown(window, { key: 's', ctrlKey: true });

    await waitFor(() => {
      expect(updateKnowledgeSystemOverview).toHaveBeenCalledWith(3, {
        mind_map_data: expect.objectContaining({
          root: expect.objectContaining({
            data: expect.objectContaining({ text: 'Payment Overview' }),
          }),
        }),
      });
    });
  });

  it('auto-saves dirty outline every 30 seconds when enabled', async () => {
    renderWithProviders();

    expect(await screen.findByText('Payment Overview')).toBeInTheDocument();
    expect(screen.getByText('30秒')).toBeInTheDocument();
    const autoSaveSwitch = screen.getByRole('switch', { name: /自动保存/ });
    expect(autoSaveSwitch).toBeChecked();

    fireEvent.click(screen.getByText('Mock Edit'));
    fireEvent.click(screen.getByText('Update Instance Snapshot'));
    fireEvent.click(autoSaveSwitch);

    vi.useFakeTimers();
    fireEvent.click(autoSaveSwitch);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });

    expect(updateKnowledgeSystemOverview).toHaveBeenCalledWith(3, {
      mind_map_data: expect.objectContaining({
        root: expect.objectContaining({
          data: expect.objectContaining({ text: 'Latest Overview' }),
        }),
      }),
    });
  });

  it('uses the selected auto-save interval', async () => {
    renderWithProviders();

    expect(await screen.findByText('Payment Overview')).toBeInTheDocument();
    const autoSaveSwitch = screen.getByRole('switch', { name: /自动保存/ });
    expect(autoSaveSwitch).toBeChecked();

    fireEvent.click(screen.getByText('Mock Edit'));
    fireEvent.click(screen.getByText('Update Instance Snapshot'));
    fireEvent.mouseDown(screen.getByRole('combobox', { name: /自动保存间隔/ }));
    fireEvent.click(await screen.findByText('1分钟'));
    fireEvent.click(autoSaveSwitch);

    vi.useFakeTimers();
    fireEvent.click(autoSaveSwitch);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(updateKnowledgeSystemOverview).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(updateKnowledgeSystemOverview).toHaveBeenCalledTimes(1);
  });

  it('shows a node context menu and dispatches node commands', async () => {
    renderWithProviders();

    expect(await screen.findByText('Payment Overview')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Open Node Context Menu'));

    expect(screen.getByRole('button', { name: '添加子节点' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '适应画布' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '添加子节点' }));

    expect(execCommandMock).toHaveBeenCalledWith('INSERT_CHILD_NODE', true, expect.any(Array), { tag: ['P2'] });
  });

  it('moves selected leaf tags to the new child node when inserting a child', async () => {
    const leafNode = createMockMindMapNode('投保关系', ['正向', '一般', 'P2', '自定义标签']);
    setActiveNode(leafNode);
    renderWithProviders();

    expect(await screen.findByText('Payment Overview')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Open Node Context Menu'));
    fireEvent.click(screen.getByRole('button', { name: '添加子节点' }));

    expect(execCommandMock).toHaveBeenCalledWith('SET_NODE_TAG', leafNode, []);
    expect(execCommandMock).toHaveBeenCalledWith(
      'INSERT_CHILD_NODE',
      true,
      [leafNode],
      { tag: ['P2', '自定义标签'] },
    );
    await waitFor(() => {
      const childNode = leafNode.children?.[0];
      expect(childNode).toBeDefined();
      expect(execCommandMock).toHaveBeenCalledWith(
        'SET_NODE_TAG',
        childNode,
        ['P2', '自定义标签'],
      );
    });
  });

  it('sets mutually exclusive positive and negative tags on a selected leaf node', async () => {
    const leafNode = createMockMindMapNode('退款', ['正向', '自定义标签']);
    setActiveNode(leafNode);
    renderWithProviders();

    expect(await screen.findByText('Payment Overview')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Open Node Context Menu'));
    fireEvent.click(screen.getByRole('button', { name: '标记反向' }));

    expect(execCommandMock).toHaveBeenCalledWith(
      'SET_NODE_TAG',
      leafNode,
      ['反向', 'P3', '自定义标签'],
    );
  });

  it('sets case level and recalculates priority on a selected leaf node', async () => {
    const leafNode = createMockMindMapNode('支付', ['正向']);
    setActiveNode(leafNode);
    renderWithProviders();

    expect(await screen.findByText('Payment Overview')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /用例等级/ }));
    fireEvent.click(await screen.findByRole('menuitem', { name: /核心/ }));

    expect(execCommandMock).toHaveBeenCalledWith(
      'SET_NODE_TAG',
      leafNode,
      ['核心', 'P0'],
    );
  });

  it('adds expected result tags with an auto-generated case description', async () => {
    const leafNode = createMockMindMapNode('支付', ['正向']);
    setActiveNode(leafNode);
    renderWithProviders();

    expect(await screen.findByText('Payment Overview')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /用例类型/ }));
    fireEvent.click(await screen.findByRole('menuitem', { name: /预期结果/ }));

    expect(execCommandMock).toHaveBeenCalledWith(
      'SET_NODE_TAG',
      leafNode,
      ['P2', '预期结果', '用例描述：验证支付功能'],
    );
  });

  it('allows expected result tags when the selected leaf has siblings', async () => {
    const leafNode = createMockMindMapNode('支付');
    const siblingNode = createMockMindMapNode('取消支付');
    createMockMindMapNode('支付流程', [], [leafNode, siblingNode]);
    setActiveNode(leafNode);
    renderWithProviders();

    expect(await screen.findByText('Payment Overview')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /用例类型/ }));
    fireEvent.click(await screen.findByRole('menuitem', { name: /预期结果/ }));

    expect(execCommandMock).toHaveBeenCalledWith(
      'SET_NODE_TAG',
      leafNode,
      ['P2', '预期结果', '用例描述：验证支付功能'],
    );
  });

  it('allows inserting a sibling beside an expected result node', async () => {
    const expectedNode = createMockMindMapNode('支付成功', ['预期结果']);
    createMockMindMapNode('支付流程', [], [expectedNode]);
    setActiveNode(expectedNode);
    renderWithProviders();

    expect(await screen.findByText('Payment Overview')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Open Node Context Menu'));
    fireEvent.click(screen.getByRole('button', { name: '添加同级节点' }));

    expect(execCommandMock).toHaveBeenCalledWith(
      'INSERT_NODE',
      true,
      [],
      { tag: ['P2'] },
    );
  });

  it('toggles page fullscreen mode and resizes the mind map', async () => {
    const { container } = renderWithProviders();

    expect(await screen.findByText('Payment Overview')).toBeInTheDocument();
    const workspaceShell = container.querySelector('.knowledge-overview-editor__workspace-shell');
    expect(workspaceShell).not.toHaveClass('knowledge-overview-editor__workspace-shell--fullscreen');

    resizeMock.mockClear();
    fitMock.mockClear();

    fireEvent.click(screen.getByRole('button', { name: /视图/ }));
    fireEvent.click(await screen.findByRole('menuitem', { name: /页面全屏/ }));

    await waitFor(() => {
      expect(workspaceShell).toHaveClass('knowledge-overview-editor__workspace-shell--fullscreen');
      expect(resizeMock).toHaveBeenCalled();
      expect(fitMock).toHaveBeenCalledWith(undefined, true, 72);
      expect(screen.getByRole('button', { name: /视图/ })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /视图/ }));
    fireEvent.click(await screen.findByRole('menuitem', { name: /退出页面全屏/ }));

    await waitFor(() => {
      expect(workspaceShell).not.toHaveClass('knowledge-overview-editor__workspace-shell--fullscreen');
      expect(screen.getByRole('button', { name: /视图/ })).toBeInTheDocument();
    });
  });
});

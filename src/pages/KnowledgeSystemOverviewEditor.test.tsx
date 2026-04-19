import { useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
const fitMock = vi.fn();
const resizeMock = vi.fn();

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
      execCommand: (command: string) => void;
      getData: () => Record<string, unknown>;
      resize: () => void;
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
        getData: vi.fn(() => instanceData),
        resize: resizeMock,
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
    vi.stubGlobal('requestAnimationFrame', ((callback: FrameRequestCallback) => {
      return window.setTimeout(() => callback(0), 0);
    }) as typeof requestAnimationFrame);
    vi.stubGlobal('cancelAnimationFrame', ((handle: number) => {
      window.clearTimeout(handle);
    }) as typeof cancelAnimationFrame);
  });

  afterEach(() => {
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

  it('shows a node context menu and dispatches node commands', async () => {
    renderWithProviders();

    expect(await screen.findByText('Payment Overview')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Open Node Context Menu'));

    expect(screen.getByRole('button', { name: '添加子节点' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '适应画布' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '添加子节点' }));

    expect(execCommandMock).toHaveBeenCalledWith('INSERT_CHILD_NODE');
  });

  it('toggles page fullscreen mode and resizes the mind map', async () => {
    const { container } = renderWithProviders();

    expect(await screen.findByText('Payment Overview')).toBeInTheDocument();
    const workspaceShell = container.querySelector('.knowledge-overview-editor__workspace-shell');
    expect(workspaceShell).not.toHaveClass('knowledge-overview-editor__workspace-shell--fullscreen');

    resizeMock.mockClear();
    fitMock.mockClear();

    fireEvent.click(screen.getByRole('button', { name: /页面全屏/ }));

    await waitFor(() => {
      expect(workspaceShell).toHaveClass('knowledge-overview-editor__workspace-shell--fullscreen');
      expect(resizeMock).toHaveBeenCalled();
      expect(fitMock).toHaveBeenCalledWith(undefined, true, 72);
      expect(screen.getByRole('button', { name: /退出页面全屏/ })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /退出页面全屏/ }));

    await waitFor(() => {
      expect(workspaceShell).not.toHaveClass('knowledge-overview-editor__workspace-shell--fullscreen');
      expect(screen.getByRole('button', { name: /页面全屏/ })).toBeInTheDocument();
    });
  });
});

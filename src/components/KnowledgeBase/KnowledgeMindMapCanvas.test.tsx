import { act, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { KnowledgeSystemOverviewMindMapData } from '../../types';
import KnowledgeMindMapCanvas from './KnowledgeMindMapCanvas';

const eventHandlers = new Map<string, (...args: unknown[]) => void>();
const setFullDataMock = vi.fn();
const getDataMock = vi.fn();
const onMock = vi.fn((event: string, handler: (...args: unknown[]) => void) => {
  eventHandlers.set(event, handler);
});
const destroyMock = vi.fn();
const execCommandMock = vi.fn();
const exportMock = vi.fn();
const resizeMock = vi.fn();
const fitMock = vi.fn();
const enlargeMock = vi.fn();
const narrowMock = vi.fn();
const MindMapCtorMock = vi.fn(function MockMindMap(this: Record<string, unknown>) {
  this.setFullData = setFullDataMock;
  this.getData = getDataMock;
  this.execCommand = execCommandMock;
  this.export = exportMock;
  this.on = onMock;
  this.resize = resizeMock;
  this.destroy = destroyMock;
  this.view = {
    fit: fitMock,
    enlarge: enlargeMock,
    narrow: narrowMock,
  };
});
const usePluginMock = vi.fn(() => MindMapCtorMock);
Object.assign(MindMapCtorMock, {
  usePlugin: usePluginMock,
});

vi.mock('simple-mind-map', () => ({
  default: MindMapCtorMock,
}));

vi.mock('simple-mind-map/src/plugins/Export', () => ({
  default: vi.fn(),
}));

vi.mock('simple-mind-map/src/plugins/ExportPDF', () => ({
  default: vi.fn(),
}));

vi.mock('simple-mind-map/src/plugins/ExportXMind', () => ({
  default: vi.fn(),
}));

describe('KnowledgeMindMapCanvas', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    eventHandlers.clear();
    getDataMock.mockReturnValue({
      data: { text: 'Payment Overview', expand: true },
      children: [
        {
          data: { text: 'Payment Flow', expand: true },
          children: [],
        },
      ],
    });
    vi.stubGlobal('requestAnimationFrame', ((callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    }) as typeof requestAnimationFrame);
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('normalizes root snapshots from simple-mind-map before emitting changes', async () => {
    const onChange = vi.fn();
    const initialValue: KnowledgeSystemOverviewMindMapData = {
      layout: 'logicalStructure',
      theme: {
        template: 'default',
        config: {},
      },
      root: {
        data: { text: 'Payment Overview', expand: true },
        children: [],
      },
    };

    await act(async () => {
      render(
        <KnowledgeMindMapCanvas
          value={initialValue}
          fallbackTitle="Payment Overview"
          onChange={onChange}
        />,
      );
    });

    await waitFor(() => {
      const initOptions = MindMapCtorMock.mock.calls.at(0)?.at(0) as Record<string, unknown> | undefined;
      expect(MindMapCtorMock).toHaveBeenCalledWith(expect.objectContaining({
        fit: false,
        isDisableDrag: false,
        disableMouseWheelZoom: false,
        isLimitMindMapInCanvas: false,
        mouseScaleCenterUseMousePosition: true,
        mousedownEventPreventDefault: true,
        mousewheelAction: 'move',
        useLeftKeySelectionRightKeyDrag: false,
      }));
      expect(usePluginMock).toHaveBeenCalledTimes(3);
      expect(initOptions?.customInnerElsAppendTo).toBeUndefined();
      expect(resizeMock).toHaveBeenCalledTimes(1);
      expect(fitMock).toHaveBeenCalledWith(undefined, true, 72);
    });

    await act(async () => {
      eventHandlers.get('data_change')?.();
    });

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
        layout: 'logicalStructure',
        root: expect.objectContaining({
          data: expect.objectContaining({ text: 'Payment Overview' }),
          children: [
            expect.objectContaining({
              data: expect.objectContaining({ text: 'Payment Flow' }),
            }),
          ],
        }),
      }));
    });
  });

  it('hides default positive and normal tags when applying data to the canvas', async () => {
    const initialValue: KnowledgeSystemOverviewMindMapData = {
      layout: 'logicalStructure',
      theme: {
        template: 'default',
        config: {},
      },
      root: {
        data: { text: 'Payment Overview', expand: true },
        children: [
          {
            data: { text: 'Payment Flow', tag: ['正向', '一般', 'P2', '自定义标签'] },
            children: [],
          },
        ],
      },
    };

    await act(async () => {
      render(
        <KnowledgeMindMapCanvas
          value={initialValue}
          fallbackTitle="Payment Overview"
          onChange={vi.fn()}
        />,
      );
    });

    await waitFor(() => {
      const initOptions = MindMapCtorMock.mock.calls.at(0)?.at(0) as {
        data?: KnowledgeSystemOverviewMindMapData['root'];
      } | undefined;
      expect(initOptions?.data?.children?.[0]).toEqual(expect.objectContaining({
        data: expect.objectContaining({
          tag: ['P2', '自定义标签'],
        }),
      }));
      expect(setFullDataMock).toHaveBeenCalledWith(expect.objectContaining({
        root: expect.objectContaining({
          children: [
            expect.objectContaining({
              data: expect.objectContaining({
                tag: ['P2', '自定义标签'],
              }),
            }),
          ],
        }),
      }));
    });
  });

  it('uses the latest value when async bootstrap finishes after props change', async () => {
    const initialValue: KnowledgeSystemOverviewMindMapData = {
      layout: 'logicalStructure',
      root: {
        data: { text: 'Payment Overview', expand: true },
        children: [],
      },
    };
    const updatedValue: KnowledgeSystemOverviewMindMapData = {
      layout: 'logicalStructure',
      theme: {
        template: 'default',
        config: {},
      },
      root: {
        data: { text: 'Payment Overview', expand: true },
        children: [
          {
            data: { text: 'Payment Flow', expand: true },
            children: [],
          },
        ],
      },
    };

    let rerender: ReturnType<typeof render>['rerender'];
    await act(async () => {
      ({ rerender } = render(
        <KnowledgeMindMapCanvas
          value={initialValue}
          fallbackTitle="Payment Overview"
          onChange={vi.fn()}
        />,
      ));
      rerender(
        <KnowledgeMindMapCanvas
          value={updatedValue}
          fallbackTitle="Payment Overview"
          onChange={vi.fn()}
        />,
      );
    });

    await waitFor(() => {
      expect(setFullDataMock).toHaveBeenCalledWith(expect.objectContaining({
        root: expect.objectContaining({
          children: [
            expect.objectContaining({
              data: expect.objectContaining({ text: 'Payment Flow' }),
            }),
          ],
        }),
      }));
    });
  });

  it('forwards context menu events from the mind map instance', async () => {
    const onNodeContextMenu = vi.fn();
    const onCanvasContextMenu = vi.fn();
    const initialValue: KnowledgeSystemOverviewMindMapData = {
      layout: 'logicalStructure',
      root: {
        data: { text: 'Payment Overview', expand: true },
        children: [],
      },
    };

    await act(async () => {
      render(
        <KnowledgeMindMapCanvas
          value={initialValue}
          fallbackTitle="Payment Overview"
          onChange={vi.fn()}
          onNodeContextMenu={onNodeContextMenu}
          onCanvasContextMenu={onCanvasContextMenu}
        />,
      );
    });

    const nodeEvent = { clientX: 180, clientY: 220 };
    const canvasEvent = { clientX: 60, clientY: 80 };

    await act(async () => {
      eventHandlers.get('node_contextmenu')?.(nodeEvent);
      eventHandlers.get('contextmenu')?.(canvasEvent);
    });

    expect(onNodeContextMenu).toHaveBeenCalledWith(nodeEvent);
    expect(onCanvasContextMenu).toHaveBeenCalledWith(canvasEvent);
  });
});

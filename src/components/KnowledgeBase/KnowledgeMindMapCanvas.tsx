import React, { useEffect, useRef } from 'react';
import type { KnowledgeSystemOverviewMindMapData } from '../../types';
import {
  createDefaultKnowledgeSystemOverviewData,
  filterKnowledgeOverviewVisibleTags,
  KNOWLEDGE_OVERVIEW_CASE_PRIORITY_TAGS,
  KNOWLEDGE_OVERVIEW_CORE_LEVEL_TAG,
  KNOWLEDGE_OVERVIEW_EXPECTED_RESULT_TAG,
  KNOWLEDGE_OVERVIEW_IMPORTANT_LEVEL_TAG,
  KNOWLEDGE_OVERVIEW_NEGATIVE_TAG,
  KNOWLEDGE_OVERVIEW_NORMAL_LEVEL_TAG,
  KNOWLEDGE_OVERVIEW_POSITIVE_TAG,
  normalizeKnowledgeSystemOverviewData,
} from '../../utils/knowledgeSystemOverview';

const MIND_MAP_FIT_PADDING = 72;
const NODE_PAN_START_THRESHOLD = 4;
const NODE_PAN_SUPPRESSION_RESET_DELAY = 250;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function cloneNodeWithVisibleTags(node: Record<string, unknown>): Record<string, unknown> {
  const data = isRecord(node.data) ? node.data : {};
  const visibleTags = filterKnowledgeOverviewVisibleTags(data.tag);
  const nextData = { ...data };
  if ('tag' in nextData) {
    if (visibleTags.length > 0) {
      nextData.tag = visibleTags;
    } else {
      delete nextData.tag;
    }
  }
  const rawChildren = Array.isArray(node.children) ? node.children : undefined;

  return {
    ...node,
    data: nextData,
    ...(rawChildren ? {
      children: rawChildren.map((child) => cloneNodeWithVisibleTags(
        isRecord(child) ? child : {},
      )),
    } : {}),
  };
}

function toMindMapDisplayData(
  data: KnowledgeSystemOverviewMindMapData,
): KnowledgeSystemOverviewMindMapData {
  return {
    ...data,
    root: cloneNodeWithVisibleTags(data.root) as KnowledgeSystemOverviewMindMapData['root'],
  };
}

export interface KnowledgeMindMapRenderNode {
  isRoot?: boolean;
  children?: KnowledgeMindMapRenderNode[];
  parent?: KnowledgeMindMapRenderNode | null;
  nodeData?: {
    data?: Record<string, unknown>;
    children?: unknown[];
  };
  getData?: (key?: string) => unknown;
}

export interface KnowledgeMindMapInstance {
  setFullData: (data: KnowledgeSystemOverviewMindMapData) => void;
  getData: (withConfig?: boolean) => Record<string, unknown>;
  execCommand: (command: string, ...args: unknown[]) => void;
  export: (type: string, isDownload?: boolean, name?: string, ...args: unknown[]) => Promise<unknown>;
  on: (event: string, handler: (...args: unknown[]) => void) => void;
  resize: () => void;
  destroy: () => void;
  renderer?: {
    activeNodeList?: KnowledgeMindMapRenderNode[];
  };
  view: {
    fit: (getRbox?: unknown, enlarge?: boolean, fitPadding?: number) => void;
    enlarge: () => void;
    narrow: () => void;
    translateXY: (x: number, y: number) => void;
  };
}

export interface KnowledgeMindMapContextMenuEvent {
  clientX: number;
  clientY: number;
  preventDefault?: () => void;
  stopPropagation?: () => void;
}

type MindMapConstructor = new (options: {
  el: HTMLDivElement;
  data: KnowledgeSystemOverviewMindMapData['root'];
  layout: string;
  theme: string;
  themeConfig: Record<string, unknown>;
  tagsColorMap?: Record<string, string>;
  fit: boolean;
  isDisableDrag?: boolean;
  disableMouseWheelZoom?: boolean;
  isLimitMindMapInCanvas?: boolean;
  mouseScaleCenterUseMousePosition?: boolean;
  mousedownEventPreventDefault?: boolean;
  mousewheelAction?: 'move' | 'zoom';
  useLeftKeySelectionRightKeyDrag?: boolean;
}) => KnowledgeMindMapInstance;
type MindMapStatic = MindMapConstructor & {
  usePlugin?: (plugin: unknown, opt?: Record<string, unknown>) => MindMapStatic;
};

function getEventTargetElement(target: EventTarget | null): Element | null {
  if (target instanceof Element) {
    return target;
  }
  if (target instanceof Node) {
    return target.parentElement;
  }
  return null;
}

function isMindMapNodeTarget(target: EventTarget | null): boolean {
  return Boolean(getEventTargetElement(target)?.closest('.smm-node'));
}

interface KnowledgeMindMapCanvasProps {
  value: KnowledgeSystemOverviewMindMapData | null;
  fallbackTitle: string;
  onChange: (nextValue: KnowledgeSystemOverviewMindMapData) => void;
  onReady?: (instance: KnowledgeMindMapInstance | null) => void;
  onSelectionChange?: (count: number) => void;
  onNodeContextMenu?: (event: KnowledgeMindMapContextMenuEvent) => void;
  onCanvasContextMenu?: (event: KnowledgeMindMapContextMenuEvent) => void;
  mousewheelAction?: 'move' | 'zoom';
}

const KnowledgeMindMapCanvas: React.FC<KnowledgeMindMapCanvasProps> = ({
  value,
  fallbackTitle,
  onChange,
  onReady,
  onSelectionChange,
  onNodeContextMenu,
  onCanvasContextMenu,
  mousewheelAction = 'move',
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mindMapRef = useRef<KnowledgeMindMapInstance | null>(null);
  const latestValueRef = useRef<KnowledgeSystemOverviewMindMapData | null>(value);
  const onChangeRef = useRef(onChange);
  const onReadyRef = useRef(onReady);
  const onSelectionChangeRef = useRef(onSelectionChange);
  const onNodeContextMenuRef = useRef(onNodeContextMenu);
  const onCanvasContextMenuRef = useRef(onCanvasContextMenu);
  const normalizedValueRef = useRef<KnowledgeSystemOverviewMindMapData | null>(null);
  const lastAppliedValueRef = useRef('');
  const snapshotFrameRef = useRef<number | null>(null);
  const fitFrameRef = useRef<number | null>(null);
  const nodePanCleanupRef = useRef<(() => void) | null>(null);
  const nodePanSuppressClickRef = useRef(false);
  const nodePanSuppressClickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  latestValueRef.current = value;
  onChangeRef.current = onChange;
  onReadyRef.current = onReady;
  onSelectionChangeRef.current = onSelectionChange;
  onNodeContextMenuRef.current = onNodeContextMenu;
  onCanvasContextMenuRef.current = onCanvasContextMenu;

  const cancelPendingFrames = () => {
    if (snapshotFrameRef.current !== null) {
      cancelAnimationFrame(snapshotFrameRef.current);
      snapshotFrameRef.current = null;
    }
    if (fitFrameRef.current !== null) {
      cancelAnimationFrame(fitFrameRef.current);
      fitFrameRef.current = null;
    }
  };

  const focusMindMapViewport = (instance: KnowledgeMindMapInstance) => {
    try {
      instance.resize();
    } catch {
      // Ignore resize errors raised while the container is still settling.
    }

    try {
      instance.view.fit(undefined, true, MIND_MAP_FIT_PADDING);
    } catch {
      // simple-mind-map may try to measure SVG nodes before they are ready.
    }
  };

  const scheduleFit = (instance: KnowledgeMindMapInstance) => {
    if (fitFrameRef.current !== null) {
      cancelAnimationFrame(fitFrameRef.current);
    }

    fitFrameRef.current = requestAnimationFrame(() => {
      fitFrameRef.current = requestAnimationFrame(() => {
        fitFrameRef.current = null;
        if (mindMapRef.current !== instance) {
          return;
        }
        focusMindMapViewport(instance);
      });
    });
  };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return undefined;
    }

    const resetSuppressedNodeClick = () => {
      if (nodePanSuppressClickTimerRef.current !== null) {
        clearTimeout(nodePanSuppressClickTimerRef.current);
        nodePanSuppressClickTimerRef.current = null;
      }
      nodePanSuppressClickRef.current = false;
    };

    const scheduleSuppressedNodeClickReset = () => {
      if (nodePanSuppressClickTimerRef.current !== null) {
        clearTimeout(nodePanSuppressClickTimerRef.current);
      }
      nodePanSuppressClickTimerRef.current = setTimeout(() => {
        nodePanSuppressClickTimerRef.current = null;
        nodePanSuppressClickRef.current = false;
      }, NODE_PAN_SUPPRESSION_RESET_DELAY);
    };

    const cleanupNodePan = () => {
      nodePanCleanupRef.current?.();
      nodePanCleanupRef.current = null;
      container.classList.remove('knowledge-mind-map-canvas--panning');
    };

    const handleNativeCanvasMouseDown = (event: MouseEvent) => {
      if (isMindMapNodeTarget(event.target)) {
        return;
      }
      cleanupNodePan();
    };

    const handleNodeMouseDownCapture = (event: MouseEvent) => {
      const instance = mindMapRef.current;
      if (
        !instance
        || event.button !== 0
        || event.ctrlKey
        || event.metaKey
        || !isMindMapNodeTarget(event.target)
      ) {
        return;
      }

      cleanupNodePan();
      resetSuppressedNodeClick();

      const startX = event.clientX;
      const startY = event.clientY;
      let lastX = startX;
      let lastY = startY;
      let isPanning = false;

      const handleMouseMove = (moveEvent: MouseEvent) => {
        if (moveEvent.buttons !== 0 && (moveEvent.buttons & 1) === 0) {
          handleMouseUp(moveEvent);
          return;
        }

        const totalX = moveEvent.clientX - startX;
        const totalY = moveEvent.clientY - startY;
        if (!isPanning) {
          if (
            Math.abs(totalX) < NODE_PAN_START_THRESHOLD
            && Math.abs(totalY) < NODE_PAN_START_THRESHOLD
          ) {
            return;
          }
          isPanning = true;
          nodePanSuppressClickRef.current = true;
          container.classList.add('knowledge-mind-map-canvas--panning');
        }

        const offsetX = moveEvent.clientX - lastX;
        const offsetY = moveEvent.clientY - lastY;
        lastX = moveEvent.clientX;
        lastY = moveEvent.clientY;
        moveEvent.preventDefault();
        moveEvent.stopPropagation();
        mindMapRef.current?.view.translateXY(offsetX, offsetY);
      };

      const handleMouseUp = (upEvent: MouseEvent) => {
        if (isPanning) {
          upEvent.preventDefault();
          upEvent.stopPropagation();
          scheduleSuppressedNodeClickReset();
        }
        cleanupNodePan();
      };

      const handleWindowBlur = () => {
        if (isPanning) {
          scheduleSuppressedNodeClickReset();
        }
        cleanupNodePan();
      };

      nodePanCleanupRef.current = () => {
        window.removeEventListener('mousemove', handleMouseMove, true);
        window.removeEventListener('mouseup', handleMouseUp, true);
        window.removeEventListener('blur', handleWindowBlur, true);
      };

      window.addEventListener('mousemove', handleMouseMove, true);
      window.addEventListener('mouseup', handleMouseUp, true);
      window.addEventListener('blur', handleWindowBlur, true);
    };

    const handleNodeClickCapture = (event: MouseEvent) => {
      if (!nodePanSuppressClickRef.current || !isMindMapNodeTarget(event.target)) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      resetSuppressedNodeClick();
    };

    container.addEventListener('mousedown', handleNodeMouseDownCapture, true);
    container.addEventListener('mousedown', handleNativeCanvasMouseDown);
    container.addEventListener('click', handleNodeClickCapture, true);

    return () => {
      container.removeEventListener('mousedown', handleNodeMouseDownCapture, true);
      container.removeEventListener('mousedown', handleNativeCanvasMouseDown);
      container.removeEventListener('click', handleNodeClickCapture, true);
      cleanupNodePan();
      resetSuppressedNodeClick();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const bootstrap = async () => {
      if (!containerRef.current) {
        return;
      }

      const [
        { default: MindMapCtor },
        { default: ExportPlugin },
        { default: ExportPDFPlugin },
        { default: ExportXMindPlugin },
      ] = await Promise.all([
        import('simple-mind-map'),
        import('simple-mind-map/src/plugins/Export'),
        import('simple-mind-map/src/plugins/ExportPDF'),
        import('simple-mind-map/src/plugins/ExportXMind'),
      ]);
      if (cancelled || !containerRef.current) {
        return;
      }

      const currentValue = latestValueRef.current;
      const initialValue = normalizeKnowledgeSystemOverviewData(
        currentValue as Record<string, unknown> | null | undefined,
        fallbackTitle,
        currentValue ?? createDefaultKnowledgeSystemOverviewData(fallbackTitle),
      );
      const initialDisplayValue = toMindMapDisplayData(initialValue);
      const MindMapClass = MindMapCtor as unknown as MindMapStatic;
      MindMapClass.usePlugin?.(ExportXMindPlugin);
      MindMapClass.usePlugin?.(ExportPDFPlugin);
      MindMapClass.usePlugin?.(ExportPlugin);
      const instance = new MindMapClass({
        el: containerRef.current,
        data: initialDisplayValue.root,
        layout: initialValue.layout ?? 'logicalStructure',
        theme: initialValue.theme?.template ?? 'default',
        themeConfig: initialValue.theme?.config ?? {},
        tagsColorMap: {
          [KNOWLEDGE_OVERVIEW_POSITIVE_TAG]: '#16a34a',
          [KNOWLEDGE_OVERVIEW_NEGATIVE_TAG]: '#dc2626',
          [KNOWLEDGE_OVERVIEW_CORE_LEVEL_TAG]: '#ea580c',
          [KNOWLEDGE_OVERVIEW_IMPORTANT_LEVEL_TAG]: '#d97706',
          [KNOWLEDGE_OVERVIEW_NORMAL_LEVEL_TAG]: '#2563eb',
          [KNOWLEDGE_OVERVIEW_CASE_PRIORITY_TAGS[0]]: '#dc2626',
          [KNOWLEDGE_OVERVIEW_CASE_PRIORITY_TAGS[1]]: '#f97316',
          [KNOWLEDGE_OVERVIEW_CASE_PRIORITY_TAGS[2]]: '#2563eb',
          [KNOWLEDGE_OVERVIEW_CASE_PRIORITY_TAGS[3]]: '#64748b',
          [KNOWLEDGE_OVERVIEW_EXPECTED_RESULT_TAG]: '#7c3aed',
        },
        fit: false,
        isDisableDrag: false,
        disableMouseWheelZoom: false,
        isLimitMindMapInCanvas: false,
        mouseScaleCenterUseMousePosition: true,
        mousedownEventPreventDefault: true,
        mousewheelAction,
        useLeftKeySelectionRightKeyDrag: false,
      });

      instance.setFullData(initialDisplayValue);

      const emitSnapshot = () => {
        if (snapshotFrameRef.current !== null) {
          cancelAnimationFrame(snapshotFrameRef.current);
        }
        snapshotFrameRef.current = requestAnimationFrame(() => {
          snapshotFrameRef.current = null;
          if (!mindMapRef.current) {
            return;
          }
          const rawData = mindMapRef.current.getData(true);
          const snapshot = normalizeKnowledgeSystemOverviewData(
            rawData,
            fallbackTitle,
            normalizedValueRef.current ?? initialValue,
          );
          normalizedValueRef.current = snapshot;
          lastAppliedValueRef.current = JSON.stringify(snapshot);
          onChangeRef.current(snapshot);
        });
      };

      const handleNodeActive = (...args: unknown[]) => {
        const activeNodeList = args[1];
        onSelectionChangeRef.current?.(
          Array.isArray(activeNodeList) ? activeNodeList.length : 0,
        );
      };

      const handleNodeContextMenu = (...args: unknown[]) => {
        const [event] = args;
        if (
          event
          && typeof event === 'object'
          && 'clientX' in event
          && 'clientY' in event
        ) {
          onNodeContextMenuRef.current?.(event as KnowledgeMindMapContextMenuEvent);
        }
      };

      const handleCanvasContextMenu = (...args: unknown[]) => {
        const [event] = args;
        if (
          event
          && typeof event === 'object'
          && 'clientX' in event
          && 'clientY' in event
        ) {
          onCanvasContextMenuRef.current?.(event as KnowledgeMindMapContextMenuEvent);
        }
      };

      mindMapRef.current = instance;
      normalizedValueRef.current = initialValue;
      lastAppliedValueRef.current = JSON.stringify(initialValue);
      instance.on('data_change', emitSnapshot);
      instance.on('view_data_change', emitSnapshot);
      instance.on('node_active', handleNodeActive);
      instance.on('node_contextmenu', handleNodeContextMenu);
      instance.on('contextmenu', handleCanvasContextMenu);
      if (!initialValue.view) {
        scheduleFit(instance);
      }
      onReadyRef.current?.(instance);
    };

    void bootstrap();

    return () => {
      cancelled = true;
      cancelPendingFrames();
      onReadyRef.current?.(null);
      onSelectionChangeRef.current?.(0);
      mindMapRef.current?.destroy();
      mindMapRef.current = null;
      normalizedValueRef.current = null;
    };
  }, [fallbackTitle, mousewheelAction]);

  useEffect(() => {
    if (!mindMapRef.current || !value) {
      return;
    }

    const normalizedValue = normalizeKnowledgeSystemOverviewData(
      value as Record<string, unknown>,
      fallbackTitle,
      normalizedValueRef.current ?? value,
    );
    const serialized = JSON.stringify(normalizedValue);
    if (serialized === lastAppliedValueRef.current) {
      return;
    }

    lastAppliedValueRef.current = serialized;
    normalizedValueRef.current = normalizedValue;
    mindMapRef.current.setFullData(toMindMapDisplayData(normalizedValue));
    if (!normalizedValue.view) {
      scheduleFit(mindMapRef.current);
    }
  }, [fallbackTitle, value]);

  return <div ref={containerRef} className="knowledge-mind-map-canvas" />;
};

export default KnowledgeMindMapCanvas;

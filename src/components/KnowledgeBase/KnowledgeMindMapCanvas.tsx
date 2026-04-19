import React, { useEffect, useRef } from 'react';
import type { KnowledgeSystemOverviewMindMapData } from '../../types';
import {
  createDefaultKnowledgeSystemOverviewData,
  normalizeKnowledgeSystemOverviewData,
} from '../../utils/knowledgeSystemOverview';

const MIND_MAP_FIT_PADDING = 72;

export interface KnowledgeMindMapInstance {
  setFullData: (data: KnowledgeSystemOverviewMindMapData) => void;
  getData: (withConfig?: boolean) => Record<string, unknown>;
  execCommand: (command: string) => void;
  on: (event: string, handler: (...args: unknown[]) => void) => void;
  resize: () => void;
  destroy: () => void;
  view: {
    fit: (getRbox?: unknown, enlarge?: boolean, fitPadding?: number) => void;
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
  fit: boolean;
  isDisableDrag?: boolean;
  useLeftKeySelectionRightKeyDrag?: boolean;
}) => KnowledgeMindMapInstance;

interface KnowledgeMindMapCanvasProps {
  value: KnowledgeSystemOverviewMindMapData | null;
  fallbackTitle: string;
  onChange: (nextValue: KnowledgeSystemOverviewMindMapData) => void;
  onReady?: (instance: KnowledgeMindMapInstance | null) => void;
  onSelectionChange?: (count: number) => void;
  onNodeContextMenu?: (event: KnowledgeMindMapContextMenuEvent) => void;
  onCanvasContextMenu?: (event: KnowledgeMindMapContextMenuEvent) => void;
}

const KnowledgeMindMapCanvas: React.FC<KnowledgeMindMapCanvasProps> = ({
  value,
  fallbackTitle,
  onChange,
  onReady,
  onSelectionChange,
  onNodeContextMenu,
  onCanvasContextMenu,
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
    let cancelled = false;

    const bootstrap = async () => {
      if (!containerRef.current) {
        return;
      }

      const { default: MindMapCtor } = await import('simple-mind-map');
      if (cancelled || !containerRef.current) {
        return;
      }

      const currentValue = latestValueRef.current;
      const initialValue = normalizeKnowledgeSystemOverviewData(
        currentValue as Record<string, unknown> | null | undefined,
        fallbackTitle,
        currentValue ?? createDefaultKnowledgeSystemOverviewData(fallbackTitle),
      );
      const MindMapClass = MindMapCtor as unknown as MindMapConstructor;
      const instance = new MindMapClass({
        el: containerRef.current,
        data: initialValue.root,
        layout: initialValue.layout ?? 'logicalStructure',
        theme: initialValue.theme?.template ?? 'default',
        themeConfig: initialValue.theme?.config ?? {},
        fit: false,
        isDisableDrag: false,
        useLeftKeySelectionRightKeyDrag: false,
      });

      instance.setFullData(initialValue);

      const emitSnapshot = () => {
        if (snapshotFrameRef.current !== null) {
          cancelAnimationFrame(snapshotFrameRef.current);
        }
        snapshotFrameRef.current = requestAnimationFrame(() => {
          snapshotFrameRef.current = null;
          if (!mindMapRef.current) {
            return;
          }
          const snapshot = normalizeKnowledgeSystemOverviewData(
            mindMapRef.current.getData(true),
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
  }, [fallbackTitle]);

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
    mindMapRef.current.setFullData(normalizedValue);
    if (!normalizedValue.view) {
      scheduleFit(mindMapRef.current);
    }
  }, [fallbackTitle, value]);

  return <div ref={containerRef} className="knowledge-mind-map-canvas" />;
};

export default KnowledgeMindMapCanvas;

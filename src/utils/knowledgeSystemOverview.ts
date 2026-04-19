import type { KnowledgeSystemOverviewMindMapData } from '../types';

type MindMapRootNode = KnowledgeSystemOverviewMindMapData['root'];

function normalizeRootNode(root: Record<string, unknown> | undefined, fallbackTitle: string): MindMapRootNode {
  const safeRoot = (root ?? {}) as MindMapRootNode;
  const safeData = (safeRoot.data ?? {}) as Record<string, unknown>;

  return {
    ...safeRoot,
    data: {
      ...safeData,
      text: String(safeData.text || fallbackTitle),
      expand: typeof safeData.expand === 'boolean' ? safeData.expand : true,
    },
    children: Array.isArray(safeRoot.children) ? safeRoot.children : [],
  };
}

export function createDefaultKnowledgeSystemOverviewData(title: string): KnowledgeSystemOverviewMindMapData {
  return {
    layout: 'logicalStructure',
    theme: {
      template: 'default',
      config: {},
    },
    root: normalizeRootNode(undefined, title),
  };
}

export function normalizeKnowledgeSystemOverviewData(
  data: Record<string, unknown> | null | undefined,
  fallbackTitle: string,
  current?: KnowledgeSystemOverviewMindMapData | null,
): KnowledgeSystemOverviewMindMapData {
  if (!data) {
    return createDefaultKnowledgeSystemOverviewData(fallbackTitle);
  }

  const layout = typeof data.layout === 'string'
    ? data.layout
    : current?.layout ?? 'logicalStructure';
  const theme = typeof data.theme === 'object' && data.theme !== null
    ? data.theme as KnowledgeSystemOverviewMindMapData['theme']
    : current?.theme ?? { template: 'default', config: {} };
  const view = typeof data.view === 'object' && data.view !== null
    ? data.view as KnowledgeSystemOverviewMindMapData['view']
    : current?.view;

  return {
    ...data,
    layout,
    theme,
    ...(view ? { view } : {}),
    root: normalizeRootNode(
      (typeof data.root === 'object' && data.root !== null ? data.root : data) as Record<string, unknown>,
      fallbackTitle,
    ),
  };
}

export async function parseKnowledgeSystemOverviewImport(
  file: File,
  fallbackTitle: string,
  current?: KnowledgeSystemOverviewMindMapData | null,
): Promise<{
  data: KnowledgeSystemOverviewMindMapData;
  sourceFormat: 'xmind' | 'markdown';
  sourceFileName: string;
}> {
  const normalizedFileName = file.name.trim() || '导入文件';
  const fileName = normalizedFileName.toLowerCase();

  if (fileName.endsWith('.xmind')) {
    const [{ default: xmindParser }] = await Promise.all([
      import('simple-mind-map/src/parse/xmind'),
    ]);
    const root = await xmindParser.parseXmindFile(await file.arrayBuffer(), undefined);
    return {
      data: normalizeKnowledgeSystemOverviewData(
        { ...current, root },
        fallbackTitle,
        current,
      ),
      sourceFormat: 'xmind',
      sourceFileName: normalizedFileName,
    };
  }

  if (fileName.endsWith('.md') || fileName.endsWith('.markdown')) {
    const [{ default: markdownParser }] = await Promise.all([
      import('simple-mind-map/src/parse/markdown'),
    ]);
    const root = markdownParser.transformMarkdownTo(await file.text());
    return {
      data: normalizeKnowledgeSystemOverviewData(
        { ...current, root },
        fallbackTitle,
        current,
      ),
      sourceFormat: 'markdown',
      sourceFileName: normalizedFileName,
    };
  }

  throw new Error('仅支持导入 .xmind、.md 或 .markdown 文件');
}

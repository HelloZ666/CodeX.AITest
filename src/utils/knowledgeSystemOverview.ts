import type { KnowledgeSystemOverviewMindMapData } from '../types';

type MindMapRootNode = KnowledgeSystemOverviewMindMapData['root'];

export type KnowledgeOverviewCasePolarity = 'positive' | 'negative';
export type KnowledgeOverviewCaseLevel = 'core' | 'important' | 'normal';
export type KnowledgeOverviewCasePriority = 'P0' | 'P1' | 'P2' | 'P3';
export type KnowledgeOverviewMindMapTag = string | {
  text?: string;
  style?: Record<string, unknown>;
  [key: string]: unknown;
};

export const KNOWLEDGE_OVERVIEW_POSITIVE_TAG = '正向';
export const KNOWLEDGE_OVERVIEW_NEGATIVE_TAG = '反向';
export const KNOWLEDGE_OVERVIEW_CORE_LEVEL_TAG = '核心';
export const KNOWLEDGE_OVERVIEW_IMPORTANT_LEVEL_TAG = '重要';
export const KNOWLEDGE_OVERVIEW_NORMAL_LEVEL_TAG = '一般';
export const KNOWLEDGE_OVERVIEW_EXPECTED_RESULT_TAG = '预期结果';
export const KNOWLEDGE_OVERVIEW_CASE_DESCRIPTION_PREFIX = '用例描述：';
export const KNOWLEDGE_OVERVIEW_EXPECTED_RESULT_MISSING_MARK = '_knowledgeOverviewExpectedResultMissing';
const KNOWLEDGE_OVERVIEW_EXPECTED_RESULT_MISSING_STYLE_BACKUP = '_knowledgeOverviewExpectedResultMissingStyleBackup';
export const KNOWLEDGE_OVERVIEW_CASE_LEVEL_OPTIONS: Array<{
  value: KnowledgeOverviewCaseLevel;
  label: string;
}> = [
  { value: 'core', label: KNOWLEDGE_OVERVIEW_CORE_LEVEL_TAG },
  { value: 'important', label: KNOWLEDGE_OVERVIEW_IMPORTANT_LEVEL_TAG },
  { value: 'normal', label: KNOWLEDGE_OVERVIEW_NORMAL_LEVEL_TAG },
];
export const KNOWLEDGE_OVERVIEW_CASE_PRIORITY_TAGS: KnowledgeOverviewCasePriority[] = [
  'P0',
  'P1',
  'P2',
  'P3',
];

const MANAGED_TAG_TEXTS = new Set([
  KNOWLEDGE_OVERVIEW_POSITIVE_TAG,
  KNOWLEDGE_OVERVIEW_NEGATIVE_TAG,
  ...KNOWLEDGE_OVERVIEW_CASE_LEVEL_OPTIONS.map(({ label }) => label),
  ...KNOWLEDGE_OVERVIEW_CASE_PRIORITY_TAGS,
  KNOWLEDGE_OVERVIEW_EXPECTED_RESULT_TAG,
]);

const HIDDEN_MIND_MAP_TAG_TEXTS = new Set([
  KNOWLEDGE_OVERVIEW_POSITIVE_TAG,
  KNOWLEDGE_OVERVIEW_NORMAL_LEVEL_TAG,
]);
const EXPECTED_RESULT_MISSING_STYLE = {
  fillColor: '#fee2e2',
  borderColor: '#dc2626',
  borderWidth: 2,
  color: '#991b1b',
};
const EXPECTED_RESULT_MISSING_STYLE_KEYS = Object.keys(EXPECTED_RESULT_MISSING_STYLE);

export interface KnowledgeOverviewValidationResult {
  hasNegativeBranch: boolean;
  missingExpectedResultLeafCount: number;
  missingExpectedResultLeafTexts: string[];
  isValid: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function getTagText(tag: unknown): string {
  if (typeof tag === 'string') {
    return tag;
  }
  if (isRecord(tag) && typeof tag.text === 'string') {
    return tag.text;
  }
  return '';
}

function normalizeTagValue(tagValue: unknown): KnowledgeOverviewMindMapTag[] {
  if (!Array.isArray(tagValue)) {
    return [];
  }

  return tagValue.filter((tag): tag is KnowledgeOverviewMindMapTag => (
    typeof tag === 'string' || isRecord(tag)
  ));
}

function isManagedOverviewTag(tag: unknown): boolean {
  const text = getTagText(tag);
  return MANAGED_TAG_TEXTS.has(text)
    || text.startsWith(KNOWLEDGE_OVERVIEW_CASE_DESCRIPTION_PREFIX);
}

function getLeafPolarity(tags: KnowledgeOverviewMindMapTag[]): KnowledgeOverviewCasePolarity {
  const polarityTag = [...tags]
    .reverse()
    .map(getTagText)
    .find((text) => (
      text === KNOWLEDGE_OVERVIEW_POSITIVE_TAG
      || text === KNOWLEDGE_OVERVIEW_NEGATIVE_TAG
    ));

  return polarityTag === KNOWLEDGE_OVERVIEW_NEGATIVE_TAG ? 'negative' : 'positive';
}

function getLeafLevel(tags: KnowledgeOverviewMindMapTag[]): KnowledgeOverviewCaseLevel {
  const levelTag = [...tags]
    .reverse()
    .map(getTagText)
    .find((text) => (
      text === KNOWLEDGE_OVERVIEW_CORE_LEVEL_TAG
      || text === KNOWLEDGE_OVERVIEW_IMPORTANT_LEVEL_TAG
      || text === KNOWLEDGE_OVERVIEW_NORMAL_LEVEL_TAG
    ));

  if (levelTag === KNOWLEDGE_OVERVIEW_CORE_LEVEL_TAG) {
    return 'core';
  }
  if (levelTag === KNOWLEDGE_OVERVIEW_IMPORTANT_LEVEL_TAG) {
    return 'important';
  }
  return 'normal';
}

function getCaseLevelTag(level: KnowledgeOverviewCaseLevel): string {
  if (level === 'core') {
    return KNOWLEDGE_OVERVIEW_CORE_LEVEL_TAG;
  }
  if (level === 'important') {
    return KNOWLEDGE_OVERVIEW_IMPORTANT_LEVEL_TAG;
  }
  return KNOWLEDGE_OVERVIEW_NORMAL_LEVEL_TAG;
}

export function calculateKnowledgeOverviewCasePriority(
  polarity: KnowledgeOverviewCasePolarity,
  level: KnowledgeOverviewCaseLevel,
): KnowledgeOverviewCasePriority {
  if (level === 'core') {
    return polarity === 'positive' ? 'P0' : 'P1';
  }
  if (level === 'important') {
    return polarity === 'positive' ? 'P1' : 'P2';
  }
  return polarity === 'positive' ? 'P2' : 'P3';
}

function buildCaseDescriptionTag(nodeText: string): string {
  const safeNodeText = nodeText.trim() || '该';
  return `${KNOWLEDGE_OVERVIEW_CASE_DESCRIPTION_PREFIX}验证${safeNodeText}功能`;
}

export function removeKnowledgeOverviewManagedTags(tagValue: unknown): KnowledgeOverviewMindMapTag[] {
  return normalizeTagValue(tagValue).filter((tag) => !isManagedOverviewTag(tag));
}

export function filterKnowledgeOverviewVisibleTags(tagValue: unknown): KnowledgeOverviewMindMapTag[] {
  return normalizeTagValue(tagValue).filter((tag) => !HIDDEN_MIND_MAP_TAG_TEXTS.has(getTagText(tag)));
}

export function hasKnowledgeOverviewExpectedResultTag(tagValue: unknown): boolean {
  return normalizeTagValue(tagValue).some((tag) => (
    getTagText(tag) === KNOWLEDGE_OVERVIEW_EXPECTED_RESULT_TAG
  ));
}

export function hasKnowledgeOverviewNegativeTag(tagValue: unknown): boolean {
  return normalizeTagValue(tagValue).some((tag) => (
    getTagText(tag) === KNOWLEDGE_OVERVIEW_NEGATIVE_TAG
  ));
}

export function buildKnowledgeOverviewLeafTagList(
  tagValue: unknown,
  nodeText: string,
  options: {
    polarity?: KnowledgeOverviewCasePolarity;
    level?: KnowledgeOverviewCaseLevel;
    expected?: boolean;
  } = {},
): KnowledgeOverviewMindMapTag[] {
  const tags = normalizeTagValue(tagValue);
  const customTags = removeKnowledgeOverviewManagedTags(tags);
  const polarity = options.polarity ?? getLeafPolarity(tags);
  const level = options.level ?? getLeafLevel(tags);
  const polarityTag = polarity === 'negative'
    ? KNOWLEDGE_OVERVIEW_NEGATIVE_TAG
    : KNOWLEDGE_OVERVIEW_POSITIVE_TAG;
  const levelTag = getCaseLevelTag(level);
  const priorityTag = calculateKnowledgeOverviewCasePriority(polarity, level);
  const shouldMarkExpected = options.expected ?? hasKnowledgeOverviewExpectedResultTag(tags);

  return [
    polarityTag,
    levelTag,
    priorityTag,
    ...(shouldMarkExpected
      ? [KNOWLEDGE_OVERVIEW_EXPECTED_RESULT_TAG, buildCaseDescriptionTag(nodeText)]
      : []),
    ...customTags,
  ];
}

function applyKnowledgeOverviewCaseTags(
  data: Record<string, unknown>,
  nodeText: string,
  isTaggableLeaf: boolean,
): Record<string, unknown> {
  const nextData = { ...data };

  if (!isTaggableLeaf) {
    const remainingTags = removeKnowledgeOverviewManagedTags(nextData.tag);
    if (remainingTags.length > 0) {
      nextData.tag = remainingTags;
    } else {
      delete nextData.tag;
    }
    return nextData;
  }

  nextData.tag = buildKnowledgeOverviewLeafTagList(nextData.tag, nodeText, {
    expected: hasKnowledgeOverviewExpectedResultTag(nextData.tag),
  });
  return nextData;
}

function getNodeData(node: Record<string, unknown>): Record<string, unknown> {
  return isRecord(node.data) ? node.data : {};
}

function getNodeChildren(node: Record<string, unknown>): Record<string, unknown>[] {
  if (!Array.isArray(node.children)) {
    return [];
  }
  return node.children.filter(isRecord);
}

function getNodeText(node: Record<string, unknown>, fallbackText: string): string {
  const data = getNodeData(node);
  return typeof data.text === 'string'
    ? data.text.trim() || fallbackText
    : String(data.text ?? fallbackText).trim() || fallbackText;
}

function applyExpectedResultMissingStyle(
  data: Record<string, unknown>,
  shouldMarkMissing: boolean,
): Record<string, unknown> {
  const nextData = { ...data };
  const wasMarked = nextData[KNOWLEDGE_OVERVIEW_EXPECTED_RESULT_MISSING_MARK] === true;

  if (shouldMarkMissing) {
    if (!wasMarked) {
      nextData[KNOWLEDGE_OVERVIEW_EXPECTED_RESULT_MISSING_STYLE_BACKUP] = EXPECTED_RESULT_MISSING_STYLE_KEYS.reduce(
        (backup, key) => ({
          ...backup,
          ...(Object.prototype.hasOwnProperty.call(nextData, key) ? { [key]: nextData[key] } : {}),
        }),
        {} as Record<string, unknown>,
      );
    }
    nextData[KNOWLEDGE_OVERVIEW_EXPECTED_RESULT_MISSING_MARK] = true;
    return {
      ...nextData,
      ...EXPECTED_RESULT_MISSING_STYLE,
    };
  }

  if (wasMarked) {
    const backup = isRecord(nextData[KNOWLEDGE_OVERVIEW_EXPECTED_RESULT_MISSING_STYLE_BACKUP])
      ? nextData[KNOWLEDGE_OVERVIEW_EXPECTED_RESULT_MISSING_STYLE_BACKUP]
      : {};
    EXPECTED_RESULT_MISSING_STYLE_KEYS.forEach((key) => {
      delete nextData[key];
    });
    delete nextData[KNOWLEDGE_OVERVIEW_EXPECTED_RESULT_MISSING_MARK];
    delete nextData[KNOWLEDGE_OVERVIEW_EXPECTED_RESULT_MISSING_STYLE_BACKUP];
    return {
      ...nextData,
      ...backup,
    };
  }

  return nextData;
}

function cloneNodeWithExpectedResultValidationStyle(
  node: Record<string, unknown>,
  isRoot: boolean,
): Record<string, unknown> {
  const children = getNodeChildren(node).map((child) => cloneNodeWithExpectedResultValidationStyle(child, false));
  const isLeaf = !isRoot && children.length === 0;
  const data = getNodeData(node);

  return {
    ...node,
    data: applyExpectedResultMissingStyle(
      data,
      isLeaf && !hasKnowledgeOverviewExpectedResultTag(data.tag),
    ),
    children,
  };
}

export function validateKnowledgeOverviewBranchTags(
  data: KnowledgeSystemOverviewMindMapData | Record<string, unknown> | null | undefined,
): KnowledgeOverviewValidationResult {
  const root = getComparableRoot(data);
  let hasNegativeBranch = false;
  const missingExpectedResultLeafTexts: string[] = [];

  const visit = (
    node: Record<string, unknown>,
    isRoot: boolean,
    branchHasNegativeTag: boolean,
  ) => {
    const nodeData = getNodeData(node);
    const children = getNodeChildren(node);
    const nextBranchHasNegativeTag = branchHasNegativeTag || hasKnowledgeOverviewNegativeTag(nodeData.tag);
    const isLeaf = !isRoot && children.length === 0;

    if (isLeaf) {
      if (nextBranchHasNegativeTag) {
        hasNegativeBranch = true;
      }
      if (!hasKnowledgeOverviewExpectedResultTag(nodeData.tag)) {
        missingExpectedResultLeafTexts.push(getNodeText(node, '未命名节点'));
      }
      return;
    }

    children.forEach((child) => visit(child, false, nextBranchHasNegativeTag));
  };

  visit(root, true, false);

  return {
    hasNegativeBranch,
    missingExpectedResultLeafCount: missingExpectedResultLeafTexts.length,
    missingExpectedResultLeafTexts,
    isValid: hasNegativeBranch && missingExpectedResultLeafTexts.length === 0,
  };
}

export function applyKnowledgeOverviewExpectedResultValidationStyles(
  data: KnowledgeSystemOverviewMindMapData,
): KnowledgeSystemOverviewMindMapData {
  return {
    ...data,
    root: cloneNodeWithExpectedResultValidationStyle(data.root, true) as MindMapRootNode,
  };
}

function normalizeMindMapNode(
  node: Record<string, unknown> | undefined,
  fallbackTitle: string,
  depth: number,
): Record<string, unknown> {
  const safeNode = (node ?? {}) as Record<string, unknown>;
  const safeData = isRecord(safeNode.data) ? safeNode.data : {};
  const rawChildren = Array.isArray(safeNode.children) ? safeNode.children : [];
  const children = rawChildren.map((child) => normalizeMindMapNode(
    isRecord(child) ? child : {},
    fallbackTitle,
    depth + 1,
  ));
  const isRoot = depth === 0;
  const text = String(safeData.text || (isRoot ? fallbackTitle : ''));
  const baseData: Record<string, unknown> = {
    ...safeData,
    ...(text ? { text } : {}),
    ...(isRoot ? {
      text,
      expand: typeof safeData.expand === 'boolean' ? safeData.expand : true,
    } : {}),
  };

  return {
    ...safeNode,
    data: applyKnowledgeOverviewCaseTags(
      baseData,
      text,
      !isRoot && children.length === 0,
    ),
    children,
  };
}

function normalizeRootNode(root: Record<string, unknown> | undefined, fallbackTitle: string): MindMapRootNode {
  return normalizeMindMapNode(root, fallbackTitle, 0) as MindMapRootNode;
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

function getComparableRoot(data: Record<string, unknown> | null | undefined): Record<string, unknown> {
  if (!data) {
    return {};
  }
  return isRecord(data.root) ? data.root : data;
}

function areTagValuesEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(normalizeTagValue(left)) === JSON.stringify(normalizeTagValue(right));
}

function hasNodeTagDiff(rawNode: unknown, normalizedNode: unknown): boolean {
  const raw = isRecord(rawNode) ? rawNode : {};
  const normalized = isRecord(normalizedNode) ? normalizedNode : {};
  const rawData = isRecord(raw.data) ? raw.data : {};
  const normalizedData = isRecord(normalized.data) ? normalized.data : {};

  if (!areTagValuesEqual(rawData.tag, normalizedData.tag)) {
    return true;
  }

  const rawChildren = Array.isArray(raw.children) ? raw.children : [];
  const normalizedChildren = Array.isArray(normalized.children) ? normalized.children : [];

  return normalizedChildren.some((child, index) => hasNodeTagDiff(rawChildren[index], child));
}

export function hasKnowledgeSystemOverviewCaseTagNormalizationDiff(
  data: Record<string, unknown> | null | undefined,
  normalizedData: KnowledgeSystemOverviewMindMapData,
): boolean {
  return hasNodeTagDiff(getComparableRoot(data), normalizedData.root);
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

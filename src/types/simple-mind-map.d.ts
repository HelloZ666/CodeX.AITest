declare module 'simple-mind-map/src/parse/xmind' {
  const xmindParser: {
    parseXmindFile: (
      file: ArrayBuffer | Uint8Array | Blob,
      handleMultiCanvas?: (content: unknown[]) => unknown,
    ) => Promise<Record<string, unknown>>;
  };

  export default xmindParser;
}

declare module 'simple-mind-map/src/parse/markdown' {
  const markdownParser: {
    transformMarkdownTo: (markdown: string) => Record<string, unknown>;
    transformToMarkdown: (root: Record<string, unknown>) => string;
  };

  export default markdownParser;
}

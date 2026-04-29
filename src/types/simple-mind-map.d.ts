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

declare module 'simple-mind-map/src/plugins/Export' {
  const ExportPlugin: unknown;
  export default ExportPlugin;
}

declare module 'simple-mind-map/src/plugins/ExportPDF' {
  const ExportPDFPlugin: unknown;
  export default ExportPDFPlugin;
}

declare module 'simple-mind-map/src/plugins/ExportXMind' {
  const ExportXMindPlugin: unknown;
  export default ExportXMindPlugin;
}

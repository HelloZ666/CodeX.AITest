import React from 'react';
import { FilePdfOutlined, WarningOutlined } from '@ant-design/icons';
import { Space, Tag, Typography } from 'antd';
import type { PdfCheckPageSnapshot, PdfCheckSnapshot, PdfCheckWord } from '../../types';

const { Text } = Typography;

function extractionMethodLabel(method: string): string {
  if (method === 'ocr') {
    return 'OCR';
  }
  if (method === 'manual_ocr') {
    return '人工修正';
  }
  return '文本';
}

function diffStatusTitle(status?: string): string | undefined {
  if (status === 'missing') {
    return '核对PDF缺失';
  }
  if (status === 'extra') {
    return '核对PDF新增';
  }
  if (status === 'changed') {
    return '文字变更';
  }
  if (status === 'ignored') {
    return '变量差异（不计失败）';
  }
  return undefined;
}

function getWordStyle(page: PdfCheckPageSnapshot, bbox: [number, number, number, number]): React.CSSProperties {
  const pageWidth = page.width || 1;
  const pageHeight = page.height || 1;
  const left = Math.max(0, Math.min(100, (bbox[0] / pageWidth) * 100));
  const top = Math.max(0, Math.min(100, (bbox[1] / pageHeight) * 100));
  const width = Math.max(0.3, Math.min(100 - left, ((bbox[2] - bbox[0]) / pageWidth) * 100));
  const height = Math.max(0.6, Math.min(100 - top, ((bbox[3] - bbox[1]) / pageHeight) * 100));

  return {
    left: `${left}%`,
    top: `${top}%`,
    width: `${width}%`,
    height: `${height}%`,
  };
}

function getMedianTextHeight(page: PdfCheckPageSnapshot): number {
  const heights = page.words
    .map((word) => Math.max(0, Number(word.bbox?.[3] ?? 0) - Number(word.bbox?.[1] ?? 0)))
    .filter((height) => height > 0 && height <= page.height * 0.04)
    .sort((left, right) => left - right);
  if (heights.length === 0) {
    return 12;
  }
  return heights[Math.floor(heights.length / 2)] || 12;
}

function shouldRenderHighlight(word: PdfCheckWord, medianHeight: number): boolean {
  if (!word.diff_status) {
    return false;
  }
  const bbox = word.bbox;
  const width = Math.max(0, Number(bbox?.[2] ?? 0) - Number(bbox?.[0] ?? 0));
  const height = Math.max(0, Number(bbox?.[3] ?? 0) - Number(bbox?.[1] ?? 0));
  if (width <= 0 || height <= 0) {
    return false;
  }
  const oversizedHeight = height > Math.max(32, medianHeight * 3.5);
  const oversizedWidth = width > Math.max(32, medianHeight * 3.5);
  return !(oversizedHeight && oversizedWidth);
}

export function PdfRenderedPage({ page }: { page: PdfCheckPageSnapshot }) {
  const medianHeight = getMedianTextHeight(page);
  const diffWords = page.words.filter((word) => shouldRenderHighlight(word, medianHeight));

  return (
    <article className="pdf-source-page">
      <div className="pdf-source-page__header">
        <Text strong>第 {page.page_number} 页</Text>
        <Space size={6}>
          <Tag>{extractionMethodLabel(page.extraction_method)}</Tag>
          {page.ocr_corrected ? <Tag color="processing">已修正</Tag> : null}
        </Space>
      </div>

      {page.image_data_url ? (
        <div className="pdf-source-page__canvas">
          <img src={page.image_data_url} alt={`PDF第 ${page.page_number} 页预览`} />
          {diffWords.map((word) => (
            <span
              key={word.id}
              className={`pdf-source-highlight pdf-source-highlight--${word.diff_status}`}
              style={getWordStyle(page, word.bbox)}
              title={diffStatusTitle(word.diff_status)}
              aria-label={`${diffStatusTitle(word.diff_status) ?? '差异'}：${word.text}`}
            />
          ))}
        </div>
      ) : page.words.length > 0 ? (
        <div className="pdf-source-page__text-fallback">
          {page.words.map((word) => (
            <span
              key={word.id}
              className={word.diff_status ? `pdf-check-word pdf-check-word--${word.diff_status}` : 'pdf-check-word'}
              title={diffStatusTitle(word.diff_status)}
            >
              {word.text}
            </span>
          ))}
        </div>
      ) : (
        <div className="pdf-check-empty-page">
          <WarningOutlined />
          <Text type="secondary">未提取到可预览文字</Text>
        </div>
      )}
    </article>
  );
}

export function PdfSnapshotPreview({
  snapshot,
  title,
  className,
}: {
  snapshot: PdfCheckSnapshot;
  title: string;
  className?: string;
}) {
  return (
    <section className={`pdf-check-preview-panel${className ? ` ${className}` : ''}`}>
      <div className="pdf-check-preview-panel__header">
        <Space>
          <FilePdfOutlined />
          <Text strong>{title}</Text>
        </Space>
        <Tag>{snapshot.page_count} 页</Tag>
      </div>
      <div className="pdf-source-page-list">
        {snapshot.pages.map((page) => (
          <PdfRenderedPage key={`${title}-${page.page_number}`} page={page} />
        ))}
      </div>
    </section>
  );
}

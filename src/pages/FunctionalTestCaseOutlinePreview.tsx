import React, { useEffect, useState } from 'react';
import { Button, Card, Empty, Space, Spin, Tag } from 'antd';
import { ArrowLeftOutlined, FullscreenExitOutlined, FullscreenOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import KnowledgeMindMapCanvas, {
  type KnowledgeMindMapInstance,
} from '../components/KnowledgeBase/KnowledgeMindMapCanvas';
import DashboardHero from '../components/Layout/DashboardHero';
import { useAppLayout } from '../components/Layout/AppLayout';
import { getFunctionalTestCaseRecord } from '../utils/api';

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString('zh-CN');
}

function formatIterationVersion(value: string | null | undefined): string {
  return value?.trim() || '--';
}

function stripFileExtension(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, '').trim();
}

function resolveCaseName(
  name: string | null | undefined,
  requirementFileName: string,
): string {
  return name?.trim() || stripFileExtension(requirementFileName) || '测试案例';
}

const FunctionalTestCaseOutlinePreviewPage: React.FC = () => {
  const navigate = useNavigate();
  const { recordId } = useParams<{ recordId: string }>();
  const parsedRecordId = Number(recordId);
  const { setPageFullscreenActive } = useAppLayout();
  const [mindMapInstance, setMindMapInstance] = useState<KnowledgeMindMapInstance | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const detailQuery = useQuery({
    queryKey: ['functional-test-case-record', parsedRecordId],
    queryFn: () => getFunctionalTestCaseRecord(parsedRecordId),
    enabled: Number.isFinite(parsedRecordId) && parsedRecordId > 0,
  });

  const syncMindMapViewport = () => {
    if (!mindMapInstance) {
      return;
    }

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        try {
          mindMapInstance.resize();
          mindMapInstance.view.fit(undefined, true, 72);
        } catch {
          // The canvas can briefly be unmeasurable while entering fullscreen.
        }
      });
    });
  };

  useEffect(() => {
    if (!isFullscreen) {
      return undefined;
    }

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isFullscreen]);

  useEffect(() => {
    setPageFullscreenActive(isFullscreen);

    return () => {
      setPageFullscreenActive(false);
    };
  }, [isFullscreen, setPageFullscreenActive]);

  useEffect(() => {
    syncMindMapViewport();
  }, [isFullscreen, mindMapInstance]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isFullscreen) {
        event.preventDefault();
        setIsFullscreen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isFullscreen]);

  if (!Number.isFinite(parsedRecordId) || parsedRecordId <= 0) {
    return <Empty description="无效测试案例记录" />;
  }

  if (detailQuery.isLoading) {
    return <Spin size="large" style={{ display: 'block', margin: '120px auto' }} />;
  }

  if (!detailQuery.data) {
    return <Empty description="未找到测试案例记录" />;
  }

  const detail = detailQuery.data;
  const caseName = resolveCaseName(detail.name, detail.requirement_file_name);

  return (
    <div className="functional-outline-preview-page">
      <DashboardHero
        eyebrow="功能测试 / 案例生成"
        title={`${caseName}大纲预览`}
        description={(
          <span>
            需求文档：<strong>{detail.requirement_file_name}</strong>
            {' '}· 生成时间：{formatDateTime(detail.created_at)}
          </span>
        )}
        chips={[
          { label: detail.project_name || '未关联项目', tone: 'accent' },
          { label: `${detail.case_count} 条案例`, tone: 'gold' },
          { label: `迭代版本：${formatIterationVersion(detail.iteration_version)}`, tone: 'neutral' },
        ]}
        actions={(
          <Button
            icon={<ArrowLeftOutlined />}
            size="large"
            onClick={() => navigate('/functional-testing/case-generation')}
          >
            返回案例生成
          </Button>
        )}
      />

      <Card
        variant="borderless"
        className={`functional-outline-preview-page__workspace${isFullscreen ? ' functional-outline-preview-page__workspace--fullscreen' : ''}`}
      >
        <div className="functional-outline-preview-page__toolbar">
          <Space size={[8, 8]} wrap>
            <Tag color={detail.generation_mode === 'ai' ? 'success' : 'default'}>
              {detail.generation_mode === 'ai' ? 'AI 生成' : '规则回退'}
            </Tag>
            {detail.provider ? <Tag>{detail.provider}</Tag> : null}
            <Tag>{detail.operator_name || '未知操作人'}</Tag>
          </Space>
          <Button
            icon={isFullscreen ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
            onClick={() => setIsFullscreen((current) => !current)}
          >
            {isFullscreen ? '退出全屏' : '页面全屏'}
          </Button>
        </div>

        {detail.outline_snapshot ? (
          <div className="functional-outline-preview-page__canvas-shell">
            <KnowledgeMindMapCanvas
              value={detail.outline_snapshot}
              fallbackTitle={caseName}
              onChange={() => undefined}
              onReady={setMindMapInstance}
              mousewheelAction="zoom"
              readonly
            />
          </div>
        ) : (
          <div className="functional-outline-preview-page__empty">
            <Empty description="该历史记录未保存大纲快照，无法预览思维导图" />
          </div>
        )}

      </Card>
    </div>
  );
};

export default FunctionalTestCaseOutlinePreviewPage;

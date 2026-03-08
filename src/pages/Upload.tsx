import React, { useState } from 'react';
import { Typography, Switch, Space, message, Alert, Select, Card, Row, Col, Tag } from 'antd';
import { ProjectOutlined } from '@ant-design/icons';
import { useMutation, useQuery } from '@tanstack/react-query';
import FileUploadComponent from '../components/FileUpload/FileUpload';
import AnalysisResult from '../components/AnalysisResult/AnalysisResult';
import ScoreCard from '../components/ScoreCard/ScoreCard';
import AISuggestions from '../components/AISuggestions/AISuggestions';
import { analyzeWithProject, listProjects } from '../utils/api';
import type { AnalyzeData, Project } from '../types';

const { Title } = Typography;

const UploadPage: React.FC = () => {
  const [useAI, setUseAI] = useState(true);
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [result, setResult] = useState<AnalyzeData | null>(null);

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: listProjects,
  });

  const selectedProject = (projects as Project[]).find((p) => p.id === selectedProjectId);
  const hasMapping = selectedProject?.mapping_data != null;

  const mutation = useMutation({
    mutationFn: (files: { codeChanges: File; testCases: File }) =>
      analyzeWithProject(selectedProjectId!, files.codeChanges, files.testCases, undefined, useAI),
    onSuccess: (response) => {
      if (response.success && response.data) {
        setResult(response.data);
        message.success(`分析完成，耗时 ${response.data.duration_ms}ms`);
      } else {
        message.error(response.error || '分析失败');
      }
    },
    onError: (err: Error & { response?: { data?: { detail?: string } } }) => {
      const msg = err.response?.data?.detail || err.message || '请求失败';
      message.error(msg);
    },
  });

  const handleFilesReady = (files: { codeChanges: File; testCases: File }) => {
    if (!selectedProjectId) {
      message.warning('请先选择项目');
      return;
    }
    if (!hasMapping) {
      message.warning('所选项目未绑定映射文件，请先在「项目管理 > 代码映射关系」中上传');
      return;
    }
    mutation.mutate(files);
  };

  return (
    <div>
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        marginBottom: 32,
        background: 'rgba(255,255,255,0.4)',
        padding: '16px 24px',
        borderRadius: 16,
        backdropFilter: 'blur(10px)',
        border: '1px solid rgba(255,255,255,0.3)'
      }}>
        <div>
          <Title level={2} style={{ margin: '0 0 4px 0', background: 'linear-gradient(135deg, #1a1a2e, #0f3460)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            案例质检
          </Title>
          <Typography.Text type="secondary">上传代码变更与测试用例，AI 智能分析覆盖率与质量</Typography.Text>
        </div>
        <Space size="large">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontWeight: 600, color: '#555' }}>AI 深度分析</span>
            <Switch 
              checked={useAI} 
              onChange={setUseAI} 
              checkedChildren="开启" 
              unCheckedChildren="关闭"
              style={{ background: useAI ? 'linear-gradient(135deg, #667eea, #764ba2)' : undefined }} 
            />
          </div>
        </Space>
      </div>

      <Row gutter={24}>
        <Col span={24}>
          <Card 
            title={<span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><ProjectOutlined style={{ color: '#667eea' }} /> 选择项目</span>}
            style={{ marginBottom: 24 }}
            bordered={false}
          >
            <Space style={{ width: '100%' }} direction="vertical" size="middle">
              <Select
                style={{ width: '100%', height: 48 }}
                placeholder="请选择要质检的项目..."
                value={selectedProjectId}
                onChange={(v) => { setSelectedProjectId(v); setResult(null); }}
                options={(projects as Project[]).map((p) => ({
                  value: p.id,
                  label: (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: 500 }}>{p.name}</span>
                      {!p.mapping_data && <Tag color="warning" style={{ margin: 0 }}>未绑定映射</Tag>}
                    </div>
                  ),
                }))}
                showSearch
                filterOption={() => true}
                allowClear
                onClear={() => { setSelectedProjectId(null); setResult(null); }}
                size="large"
              />
              {selectedProjectId && !hasMapping && (
                <Alert
                  type="warning"
                  showIcon
                  message="项目未绑定映射文件"
                  description={
                    <span>
                      该项目缺少代码与测试用例的映射关系文件。请前往 <a onClick={() => window.location.href='/projects'}>代码映射关系</a> 上传，否则分析结果可能不准确。
                    </span>
                  }
                  style={{ border: '1px solid #ffe58f', background: '#fffbe6' }}
                />
              )}
            </Space>
          </Card>
        </Col>
      </Row>

      <FileUploadComponent onFilesReady={handleFilesReady} loading={mutation.isPending} />

      {result && (
        <div style={{ marginTop: 32, animation: 'fadeIn 0.5s ease-in-out' }}>
          <div style={{ marginBottom: 24, textAlign: 'center' }}>
            <Title level={3} style={{ margin: 0 }}>分析报告</Title>
            <Typography.Text type="secondary">生成时间: {new Date().toLocaleString()}</Typography.Text>
          </div>
          
          <Row gutter={[24, 24]}>
            <Col xs={24} lg={16}>
              <AnalysisResult diffAnalysis={result.diff_analysis} coverage={result.coverage} />
            </Col>
            <Col xs={24} lg={8}>
              <ScoreCard score={result.score} />
            </Col>
            <Col span={24}>
              <AISuggestions analysis={result.ai_analysis} cost={result.ai_cost} />
            </Col>
          </Row>
        </div>
      )}
      
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
};

export default UploadPage;

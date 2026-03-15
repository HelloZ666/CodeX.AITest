import React, { useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Col,
  Modal,
  Row,
  Space,
  Tag,
  Typography,
  Upload,
  message,
} from 'antd';
import { TableOutlined, CodeOutlined, UploadOutlined, RocketOutlined } from '@ant-design/icons';
import type { UploadFile } from 'antd/es/upload/interface';

const { Text } = Typography;

interface FileUploadProps {
  onFilesReady: (files: { codeChanges: File; testCases: File }) => void;
  loading?: boolean;
}

interface FileSlot {
  key: 'codeChanges' | 'testCases';
  label: string;
  accept: string;
  icon: React.ReactNode;
}

const FILE_SLOTS: FileSlot[] = [
  {
    key: 'codeChanges',
    label: '代码改动文件',
    accept: '.json',
    icon: <CodeOutlined />,
  },
  {
    key: 'testCases',
    label: '测试用例文件',
    accept: '.csv,.xlsx,.xls',
    icon: <TableOutlined />,
  },
];

const FileUploadComponent: React.FC<FileUploadProps> = ({ onFilesReady, loading }) => {
  const [files, setFiles] = useState<Record<FileSlot['key'], File | null>>({
    codeChanges: null,
    testCases: null,
  });
  const [uploadModalOpen, setUploadModalOpen] = useState(false);

  const handleFileChange = (key: FileSlot['key'], file: File | null) => {
    setFiles((prev) => ({ ...prev, [key]: file }));
  };

  const allReady = files.codeChanges && files.testCases;

  const handleSubmit = () => {
    if (!allReady) {
      message.warning('请先上传所有必需文件');
      return;
    }

    onFilesReady({
      codeChanges: files.codeChanges!,
      testCases: files.testCases!,
    });
  };

  return (
    <>
      <Card
        className="upload-panel"
        title={(
          <>
            <span>上传文件</span>
            <Tag color="blue">必需</Tag>
          </>
        )}
        extra={(
          <Button icon={<UploadOutlined />} onClick={() => setUploadModalOpen(true)}>
            上传文件
          </Button>
        )}
        variant="borderless"
      >
        <Row gutter={[20, 20]} className="upload-grid">
          {FILE_SLOTS.map((slot) => (
            <Col xs={24} md={12} key={slot.key}>
              <div className={`upload-slot${files[slot.key] ? ' upload-slot--ready' : ''}`}>
                <div className="upload-slot__head">
                  <div className="upload-slot__icon">{slot.icon}</div>
                  <div>
                    <div className="upload-slot__title">{slot.label}</div>
                    <div className="upload-slot__accept">
                      {files[slot.key]?.name ?? '未选择文件'}
                    </div>
                  </div>
                  {files[slot.key] ? <Tag color="success">已就绪</Tag> : null}
                </div>

                <Text className="upload-slot__description">
                  {files[slot.key]
                    ? '文件已选择，如需替换请重新打开上传弹窗。'
                    : '点击“上传文件”后在弹窗内选择对应文件。'}
                </Text>

                <Button block icon={<UploadOutlined />} size="large" onClick={() => setUploadModalOpen(true)}>
                  {files[slot.key] ? '重新选择' : '选择文件'}
                </Button>
              </div>
            </Col>
          ))}
        </Row>

        <div className="upload-panel__footer">
          <Button
            type="primary"
            size="large"
            onClick={handleSubmit}
            disabled={!allReady}
            loading={loading}
            className="dashboard-cta"
            icon={<RocketOutlined />}
          >
            开始智能分析
          </Button>
        </div>
      </Card>

      <Modal
        title="上传分析文件"
        open={uploadModalOpen}
        onCancel={() => setUploadModalOpen(false)}
        footer={(
          <Button type="primary" onClick={() => setUploadModalOpen(false)}>
            完成
          </Button>
        )}
      >
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <Alert
            type="info"
            showIcon
            title="上传说明"
            description={(
              <Space direction="vertical" size={4}>
                <span>代码改动文件仅支持 `.json`，需包含 `current` 和 `history` 字段，且每个元素支持完整字符串或逐行数组。</span>
                <span>测试用例文件支持 `.csv / .xlsx / .xls`，需包含用例 ID、功能、步骤和预期结果。</span>
              </Space>
            )}
          />

          <Row gutter={[16, 16]}>
            {FILE_SLOTS.map((slot) => (
              <Col xs={24} md={12} key={slot.key}>
                <Card
                  variant="borderless"
                  title={(
                    <Space>
                      {slot.icon}
                      <span>{slot.label}</span>
                    </Space>
                  )}
                >
                  <Upload
                    accept={slot.accept}
                    maxCount={1}
                    beforeUpload={(file) => {
                      handleFileChange(slot.key, file);
                      return false;
                    }}
                    onRemove={() => handleFileChange(slot.key, null)}
                    fileList={
                      files[slot.key]
                        ? [{ uid: slot.key, name: files[slot.key]!.name, status: 'done' } as UploadFile]
                        : []
                    }
                    style={{ width: '100%' }}
                  >
                    <Button block icon={<UploadOutlined />} size="large">
                      {files[slot.key] ? '重新选择' : '点击上传'}
                    </Button>
                  </Upload>
                  <Text type="secondary" style={{ display: 'block', marginTop: 12 }}>
                    {files[slot.key] ? `当前文件：${files[slot.key]!.name}` : '未选择文件'}
                  </Text>
                </Card>
              </Col>
            ))}
          </Row>
        </Space>
      </Modal>
    </>
  );
};

export default FileUploadComponent;

import React from 'react';
import { Card, Empty } from 'antd';
import DashboardHero from '../components/Layout/DashboardHero';

interface KnowledgeBasePlaceholderPageProps {
  title: string;
  description: string;
}

const KnowledgeBasePlaceholderPage: React.FC<KnowledgeBasePlaceholderPageProps> = ({
  title,
  description,
}) => (
  <div>
    <DashboardHero
      eyebrow="知识库管理"
      title={title}
      description={description}
      chips={[
        { label: '当前为占位页', tone: 'gold' },
      ]}
    />

    <Card variant="borderless" title={`${title}（占位）`}>
      <Empty description={`${title}当前仅保留菜单与页面入口，后续按业务需求补充具体功能。`} />
    </Card>
  </div>
);

export default KnowledgeBasePlaceholderPage;

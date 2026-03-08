import React, { useMemo, useState } from 'react';
import {
  Button,
  Card,
  Input,
  Modal,
  Popconfirm,
  Radio,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { DeleteOutlined, EditOutlined, FilterOutlined, PlusOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createRequirementAnalysisRule,
  deleteRequirementAnalysisRule,
  extractApiErrorMessage,
  listRequirementAnalysisRules,
  updateRequirementAnalysisRule,
} from '../utils/api';
import type { RequirementAnalysisRule, RequirementAnalysisRuleType } from '../types';

const { Text, Title } = Typography;

const heroStyle: React.CSSProperties = {
  marginBottom: 24,
  background: 'linear-gradient(135deg, rgba(255,255,255,0.82), rgba(255,255,255,0.55))',
  border: '1px solid rgba(255,255,255,0.35)',
  boxShadow: '0 18px 36px rgba(15, 34, 60, 0.08)',
};

type RuleModalMode = 'create' | 'edit';

const normalizeSearchValue = (value: string) => value.trim().toLowerCase().replace(/\s+/g, '');

const RequirementAnalysisRulesPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<RuleModalMode>('create');
  const [editingRuleId, setEditingRuleId] = useState<number | null>(null);
  const [ruleType, setRuleType] = useState<RequirementAnalysisRuleType>('ignore');
  const [keyword, setKeyword] = useState('');
  const [searchKeyword, setSearchKeyword] = useState('');

  const rulesQuery = useQuery({
    queryKey: ['requirement-analysis-rules'],
    queryFn: listRequirementAnalysisRules,
    staleTime: 30_000,
  });

  const createRuleMutation = useMutation({
    mutationFn: ({ nextRuleType, nextKeyword }: { nextRuleType: RequirementAnalysisRuleType; nextKeyword: string }) => (
      createRequirementAnalysisRule(nextRuleType, nextKeyword)
    ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['requirement-analysis-rules'] });
      message.success('规则已新增');
      handleCloseModal();
    },
    onError: (error) => {
      message.error(extractApiErrorMessage(error, '新增规则失败'));
    },
  });

  const updateRuleMutation = useMutation({
    mutationFn: ({
      ruleId,
      nextRuleType,
      nextKeyword,
    }: {
      ruleId: number;
      nextRuleType: RequirementAnalysisRuleType;
      nextKeyword: string;
    }) => updateRequirementAnalysisRule(ruleId, nextRuleType, nextKeyword),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['requirement-analysis-rules'] });
      message.success('规则已更新');
      handleCloseModal();
    },
    onError: (error) => {
      message.error(extractApiErrorMessage(error, '更新规则失败'));
    },
  });

  const deleteRuleMutation = useMutation({
    mutationFn: (ruleId: number) => deleteRequirementAnalysisRule(ruleId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['requirement-analysis-rules'] });
      message.success('规则已删除');
    },
    onError: (error) => {
      message.error(extractApiErrorMessage(error, '删除规则失败'));
    },
  });

  const rules = rulesQuery.data ?? [];

  const orderedRules = useMemo(
    () => [...rules].sort((left, right) => {
      const leftWeight = left.rule_source === 'default' ? 0 : 1;
      const rightWeight = right.rule_source === 'default' ? 0 : 1;
      if (leftWeight !== rightWeight) {
        return leftWeight - rightWeight;
      }
      return right.id - left.id;
    }),
    [rules],
  );

  const filteredRules = useMemo(() => {
    const normalizedSearchKeyword = normalizeSearchValue(searchKeyword);
    if (!normalizedSearchKeyword) {
      return orderedRules;
    }

    return orderedRules.filter((rule) => normalizeSearchValue(rule.keyword).includes(normalizedSearchKeyword));
  }, [orderedRules, searchKeyword]);

  const getRulePropertyLabel = (rule: RequirementAnalysisRule) => {
    if (rule.rule_source === 'default') {
      return { text: '默认', color: 'blue' as const };
    }
    if (rule.rule_type === 'allow') {
      return { text: '白名单', color: 'green' as const };
    }
    return { text: '忽略词', color: 'red' as const };
  };

  const handleOpenCreateModal = () => {
    setModalMode('create');
    setEditingRuleId(null);
    setRuleType('ignore');
    setKeyword('');
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (rule: RequirementAnalysisRule) => {
    setModalMode('edit');
    setEditingRuleId(rule.id);
    setRuleType(rule.rule_type);
    setKeyword(rule.keyword);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    if (createRuleMutation.isPending || updateRuleMutation.isPending) {
      return;
    }
    setIsModalOpen(false);
    setEditingRuleId(null);
    setRuleType('ignore');
    setKeyword('');
  };

  const handleSubmit = () => {
    const trimmedKeyword = keyword.trim();
    if (!trimmedKeyword) {
      message.warning('请输入规则词');
      return;
    }

    if (modalMode === 'create') {
      createRuleMutation.mutate({ nextRuleType: ruleType, nextKeyword: trimmedKeyword });
      return;
    }

    if (editingRuleId === null) {
      message.error('未找到要修改的规则');
      return;
    }

    updateRuleMutation.mutate({
      ruleId: editingRuleId,
      nextRuleType: ruleType,
      nextKeyword: trimmedKeyword,
    });
  };

  const columns: ColumnsType<RequirementAnalysisRule> = [
    {
      title: '规则词',
      dataIndex: 'keyword',
      key: 'keyword',
    },
    {
      title: '属性',
      key: 'property',
      width: 120,
      render: (_value, record) => {
        const property = getRulePropertyLabel(record);
        return <Tag color={property.color}>{property.text}</Tag>;
      },
    },
    {
      title: '规则类型',
      dataIndex: 'rule_type',
      key: 'rule_type',
      width: 120,
      render: (value: RequirementAnalysisRuleType) => (
        <Tag color={value === 'allow' ? 'green' : 'red'}>
          {value === 'allow' ? '白名单' : '忽略词'}
        </Tag>
      ),
    },
    {
      title: '更新时间',
      dataIndex: 'updated_at',
      key: 'updated_at',
      width: 180,
    },
    {
      title: '操作',
      key: 'action',
      width: 120,
      render: (_value, record) => (
        <Space size="small">
          <Button type="text" icon={<EditOutlined />} onClick={() => handleOpenEditModal(record)} />
          <Popconfirm
            title="确认删除这条规则吗？"
            okText="删除"
            cancelText="取消"
            onConfirm={() => deleteRuleMutation.mutate(record.id)}
          >
            <Button
              danger
              type="text"
              icon={<DeleteOutlined />}
              loading={deleteRuleMutation.isPending}
            />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Card variant="borderless" style={heroStyle}>
        <Space orientation="vertical" size={8}>
          <Space wrap>
            <Tag color="processing">需求分析</Tag>
            <Tag color="blue">过滤规则</Tag>
            <Tag color="purple">实时生效</Tag>
          </Space>
          <Title level={2} style={{ margin: 0 }}>过滤规则</Title>
        </Space>
      </Card>

      <Card
        title={(
          <Space>
            <FilterOutlined style={{ color: '#4f7cff' }} />
            <span>规则列表</span>
          </Space>
        )}
        extra={(
          <Space wrap size={12}>
            <Input.Search
              allowClear
              value={searchKeyword}
              onChange={(event) => setSearchKeyword(event.target.value)}
              placeholder="搜索规则词"
              style={{ width: 260 }}
            />
            <Button type="primary" icon={<PlusOutlined />} onClick={handleOpenCreateModal}>
              新增
            </Button>
          </Space>
        )}
        variant="borderless"
      >
        <Table
          size="small"
          rowKey="id"
          columns={columns}
          dataSource={filteredRules}
          pagination={{ pageSize: 10, showSizeChanger: false }}
          locale={{ emptyText: searchKeyword.trim() ? '暂无匹配规则' : '暂无规则' }}
        />
      </Card>

      <Modal
        title={modalMode === 'create' ? '新增规则' : '修改规则'}
        open={isModalOpen}
        onCancel={handleCloseModal}
        onOk={handleSubmit}
        okText="保存"
        cancelText="取消"
        confirmLoading={createRuleMutation.isPending || updateRuleMutation.isPending}
        destroyOnHidden
      >
        <Space orientation="vertical" size="large" style={{ width: '100%' }}>
          <div>
            <Text strong>规则类型</Text>
            <div style={{ marginTop: 12 }}>
              <Radio.Group
                value={ruleType}
                onChange={(event) => setRuleType(event.target.value as RequirementAnalysisRuleType)}
              >
                <Radio.Button value="ignore">忽略词</Radio.Button>
                <Radio.Button value="allow">白名单</Radio.Button>
              </Radio.Group>
            </div>
          </div>

          <div>
            <Text strong>规则词</Text>
            <Input
              style={{ marginTop: 12 }}
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder={ruleType === 'allow' ? '例如：越权、串户、漏校验' : '例如：不可编辑、点击按钮、数字展示'}
              maxLength={100}
              onPressEnter={handleSubmit}
            />
          </div>
        </Space>
      </Modal>
    </div>
  );
};

export default RequirementAnalysisRulesPage;

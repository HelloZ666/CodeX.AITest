import { describe, expect, it, vi } from 'vitest';
import { collectE2ETestRunPayload } from './EndToEndTesting';

describe('EndToEndTestingPage payload collection', () => {
  it('submits preserved wizard fields instead of only the mounted step fields', async () => {
    const validateFields = vi.fn().mockResolvedValue({
      primary_database_config_id: 1,
      primary_table: 'policy',
      primary_key_column: 'id',
      compare_columns_text: 'status',
    });
    const getFieldsValue = vi.fn().mockReturnValue({
      name: '端到端字段一致性',
      test_version: '20260510',
      compare_type: '新需求验证',
      tester: '张三',
      primary_database_config_id: 1,
      primary_table: 'policy',
      primary_key_column: 'id',
      compare_columns_text: 'status\npremium',
      key_values_text: 'id\npolicy-002',
      target_systems: [
        {
          database_config_id: 2,
          system_name: '影子库',
          table_name: 'policy_shadow',
          primary_key_column: 'policy_id',
        },
        {
          database_config_id: 3,
          system_name: '下游系统',
          table_name: 'policy_downstream',
          compare_columns_text: 'status',
        },
      ],
    });

    const payload = await collectE2ETestRunPayload({ validateFields, getFieldsValue });

    expect(validateFields).toHaveBeenCalledWith();
    expect(getFieldsValue).toHaveBeenCalledWith(true);
    expect(payload).toMatchObject({
      name: '端到端字段一致性（20260510 / 新需求验证 / 张三）',
      primary_database_config_id: 1,
      primary_table: 'policy',
      primary_key_column: 'id',
      compare_columns: ['status', 'premium'],
      key_values: ['id', 'policy-002'],
      target_systems: [
        {
          database_config_id: 2,
          system_name: '影子库',
          table_name: 'policy_shadow',
          primary_key_column: 'policy_id',
          compare_columns: ['status', 'premium'],
        },
        {
          database_config_id: 3,
          system_name: '下游系统',
          table_name: 'policy_downstream',
          primary_key_column: 'id',
          compare_columns: ['status'],
        },
      ],
    });
  });
});

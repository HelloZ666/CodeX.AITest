import { describe, expect, it, vi } from 'vitest';
import { collectRegressionScanPayload } from './RegressionValidation';

describe('RegressionValidationPage payload collection', () => {
  it('submits preserved wizard fields instead of only the mounted step fields', async () => {
    const validateFields = vi.fn().mockResolvedValue({ name: '数据库字段回归扫描2' });
    const getFieldsValue = vi.fn().mockReturnValue({
      name: '数据库字段回归扫描2',
      database_config_id: 1,
      table_name: 'ai_agent_conversations',
      created_at_column: 'id',
      rules: [
        { column_name: 'id', rule_type: 'not_null', min_count: 1 },
        { column_name: 'name', rule_type: 'enum_count', expected_values_text: 'open\nclosed', min_count: 2 },
      ],
    });

    const payload = await collectRegressionScanPayload({ validateFields, getFieldsValue });

    expect(validateFields).toHaveBeenCalledWith(['name']);
    expect(getFieldsValue).toHaveBeenCalledWith(true);
    expect(payload).toMatchObject({
      name: '数据库字段回归扫描2',
      database_config_id: 1,
      table_name: 'ai_agent_conversations',
      created_at_column: 'id',
      rules: [
        { column_name: 'id', rule_type: 'not_null', expected_values: [], min_count: 1 },
        { column_name: 'name', rule_type: 'enum_count', expected_values: ['open', 'closed'], min_count: 2 },
      ],
    });
  });
});

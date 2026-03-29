import { useEffect } from 'react';
import { Form, Input, Modal } from 'antd';
import type { CodeMappingEntry } from '../../types';

interface CodeMappingEntryModalProps {
  open: boolean;
  loading?: boolean;
  title?: string;
  initialValues?: Partial<CodeMappingEntry> | null;
  onCancel: () => void;
  onSubmit: (values: CodeMappingEntry) => void | Promise<void>;
}

const DEFAULT_VALUES: CodeMappingEntry = {
  package_name: '',
  class_name: '',
  method_name: '',
  description: '',
  test_point: '',
};

const CodeMappingEntryModal: React.FC<CodeMappingEntryModalProps> = ({
  open,
  loading = false,
  title = '新增代码映射',
  initialValues,
  onCancel,
  onSubmit,
}) => {
  const [form] = Form.useForm<CodeMappingEntry>();

  useEffect(() => {
    if (!open) {
      return;
    }

    form.setFieldsValue({
      ...DEFAULT_VALUES,
      ...initialValues,
    });
  }, [form, initialValues, open]);

  const handleOk = async () => {
    const values = await form.validateFields();
    await onSubmit({
      package_name: values.package_name.trim(),
      class_name: values.class_name.trim(),
      method_name: values.method_name.trim(),
      description: values.description.trim(),
      test_point: values.test_point.trim(),
    });
  };

  const handleCancel = () => {
    form.resetFields();
    onCancel();
  };

  return (
    <Modal
      title={title}
      open={open}
      onOk={() => void handleOk()}
      onCancel={handleCancel}
      okText="保存"
      cancelText="取消"
      confirmLoading={loading}
      width={640}
      destroyOnHidden
    >
      <Form form={form} layout="vertical" initialValues={DEFAULT_VALUES}>
        <Form.Item
          label="包名"
          name="package_name"
          rules={[{ required: true, message: '请输入包名' }]}
        >
          <Input placeholder="例如：com.example.order" />
        </Form.Item>
        <Form.Item
          label="类名"
          name="class_name"
          rules={[{ required: true, message: '请输入类名' }]}
        >
          <Input placeholder="例如：OrderService" />
        </Form.Item>
        <Form.Item
          label="方法名"
          name="method_name"
          rules={[{ required: true, message: '请输入方法名' }]}
        >
          <Input placeholder="例如：createOrder" />
        </Form.Item>
        <Form.Item
          label="功能描述"
          name="description"
          rules={[{ required: true, message: '请输入功能描述' }]}
        >
          <Input.TextArea
            placeholder="例如：创建订单并校验库存"
            autoSize={{ minRows: 3, maxRows: 6 }}
          />
        </Form.Item>
        <Form.Item
          label="测试点"
          name="test_point"
        >
          <Input.TextArea
            placeholder="例如：库存不足、重复提交、异常回滚、边界值校验"
            autoSize={{ minRows: 3, maxRows: 6 }}
          />
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default CodeMappingEntryModal;

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ApiOutlined,
  ApartmentOutlined,
  BarChartOutlined,
  LogoutOutlined,
  RobotOutlined,
  SettingOutlined,
  TeamOutlined,
  ThunderboltOutlined,
  ToolOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { Avatar, Button, Dropdown, Layout, Menu, Space, Typography, message } from 'antd';
import type { MenuProps } from 'antd';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';

const { Sider, Content, Footer, Header } = Layout;
const { Text } = Typography;
const DEFAULT_LANDING_ROUTE = '/functional-testing/case-quality';
const CASE_GENERATION_ROUTE = '/functional-testing/case-generation';

interface AppLayoutProps {
  children: React.ReactNode;
}

interface SidebarMenuLeaf {
  key: string;
  label: string;
  kind: 'route' | 'placeholder';
}

interface SidebarMenuGroup {
  key: string;
  icon: React.ReactNode;
  label: string;
  children: SidebarMenuLeaf[];
}

const ROOT_GROUP_KEY = 'quality-board';
const PLACEHOLDER_MESSAGE_KEY = 'sidebar-placeholder-coming-soon';

const routeToGroupMap: Record<string, string> = {
  [CASE_GENERATION_ROUTE]: 'functional-testing',
  [DEFAULT_LANDING_ROUTE]: 'functional-testing',
  '/': 'functional-testing',
  '/history': 'functional-testing',
  '/functional-testing/records': 'functional-testing',
  '/requirement-analysis': 'functional-testing',
  '/requirement-analysis/history': 'functional-testing',
  '/automation-testing/api': 'automation-testing',
  '/issue-analysis': 'quality-board',
  '/defect-analysis': 'quality-board',
  '/project-management': 'project-management',
  '/production-issues': 'config-management',
  '/test-issues': 'config-management',
  '/requirement-mappings': 'config-management',
  '/projects': 'config-management',
  '/operation-logs': 'system-management',
  '/users': 'system-management',
};

const baseMenuGroups: SidebarMenuGroup[] = [
  {
    key: 'quality-board',
    icon: <BarChartOutlined />,
    label: '质量看板',
    children: [
      { key: '/issue-analysis', label: '生产问题分析', kind: 'route' },
      { key: '/defect-analysis', label: '测试问题分析', kind: 'route' },
    ],
  },
  {
    key: 'functional-testing',
    icon: <ToolOutlined />,
    label: '功能测试',
    children: [
      { key: CASE_GENERATION_ROUTE, label: '案例生成', kind: 'placeholder' },
      { key: DEFAULT_LANDING_ROUTE, label: '案例质检', kind: 'route' },
      { key: '/functional-testing/records', label: '分析记录', kind: 'route' },
    ],
  },
  {
    key: 'automation-testing',
    icon: <ApiOutlined />,
    label: '自动化测试',
    children: [
      { key: 'placeholder:automation-ui', label: 'UI自动化', kind: 'placeholder' },
      { key: '/automation-testing/api', label: '接口自动化', kind: 'route' },
    ],
  },
  {
    key: 'performance-testing',
    icon: <ThunderboltOutlined />,
    label: '性能测试',
    children: [
      { key: 'placeholder:perf-pressure', label: '压测', kind: 'placeholder' },
      { key: 'placeholder:perf-script-gen', label: '脚本生成', kind: 'placeholder' },
      { key: 'placeholder:perf-script-run', label: '脚本执行', kind: 'placeholder' },
      { key: 'placeholder:perf-tuning', label: '调优', kind: 'placeholder' },
    ],
  },
  {
    key: 'ai-tools',
    icon: <RobotOutlined />,
    label: 'AI辅助工具',
    children: [
      { key: 'placeholder:ai-pdf-check', label: 'PDF核对', kind: 'placeholder' },
      { key: 'placeholder:ai-data-gen', label: '数据生成', kind: 'placeholder' },
      { key: 'placeholder:ai-regression', label: '回归验证', kind: 'placeholder' },
      { key: 'placeholder:ai-e2e', label: '端到端测试', kind: 'placeholder' },
    ],
  },
  {
    key: 'project-management',
    icon: <ApartmentOutlined />,
    label: '项目管理',
    children: [{ key: '/project-management', label: '项目列表', kind: 'route' }],
  },
  {
    key: 'config-management',
    icon: <SettingOutlined />,
    label: '配置管理',
    children: [
      { key: '/production-issues', label: '生产问题', kind: 'route' },
      { key: '/test-issues', label: '测试问题', kind: 'route' },
      { key: '/requirement-mappings', label: '需求映射关系', kind: 'route' },
      { key: '/projects', label: '代码映射关系', kind: 'route' },
    ],
  },
];

function resolveMenuSelectedKey(pathname: string): string {
  if (pathname === '/') {
    return DEFAULT_LANDING_ROUTE;
  }
  if (pathname.startsWith('/project/')) {
    return '/projects';
  }
  if (pathname.startsWith('/functional-testing/records/')) {
    return '/functional-testing/records';
  }
  return pathname;
}

const AppLayout: React.FC<AppLayoutProps> = ({ children }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [isCollapsing, setIsCollapsing] = useState(false);
  const collapseTimerRef = useRef<number | null>(null);

  const selectedKey = resolveMenuSelectedKey(location.pathname);
  const activeGroupKey = routeToGroupMap[selectedKey] ?? ROOT_GROUP_KEY;
  const [openKeys, setOpenKeys] = useState<string[]>([activeGroupKey]);

  useEffect(() => {
    if (!collapsed) {
      setOpenKeys((previousKeys) => (
        previousKeys.length === 1 && previousKeys[0] === activeGroupKey
          ? previousKeys
          : [activeGroupKey]
      ));
    }
  }, [activeGroupKey, collapsed]);

  const sidebarGroups = useMemo(() => {
    const groups: SidebarMenuGroup[] = [...baseMenuGroups];
    if (user?.role === 'admin') {
      groups.push({
        key: 'system-management',
        icon: <TeamOutlined />,
        label: '系统管理',
        children: [{ key: '/users', label: '用户管理', kind: 'route' }],
      });
      groups[groups.length - 1]?.children.push({
        key: '/operation-logs',
        label: '操作记录',
        kind: 'route',
      });
    }

    return groups;
  }, [user?.role]);

  const menuItems: MenuProps['items'] = useMemo(() => (
    sidebarGroups.map((group) => ({
      key: group.key,
      icon: group.icon,
      label: group.label,
      children: group.children.map((item) => ({
        key: item.key,
        label: item.label,
      })),
    }))
  ), [sidebarGroups]);

  const menuKindMap = useMemo(
    () => Object.fromEntries(
      sidebarGroups.flatMap((group) => group.children.map((item) => [item.key, item.kind])),
    ) as Record<string, SidebarMenuLeaf['kind']>,
    [sidebarGroups],
  );

  const handleMenuClick: MenuProps['onClick'] = ({ key }) => {
    if (typeof key !== 'string') {
      return;
    }

    if (menuKindMap[key] === 'route') {
      if (collapsed) {
        setOpenKeys([]);
      }
      navigate(key);
      return;
    }

    if (collapsed) {
      setOpenKeys([]);
    }

    void message.open({
      key: PLACEHOLDER_MESSAGE_KEY,
      type: 'info',
      content: '敬请期待',
      duration: 1.8,
    });
  };

  const handleOpenChange: MenuProps['onOpenChange'] = (keys) => {
    if (collapsed) {
      setOpenKeys(keys.map((key) => String(key)));
      return;
    }

    const latestKey = keys.find((key) => !openKeys.includes(String(key)));
    if (latestKey) {
      setOpenKeys([String(latestKey)]);
      return;
    }

    setOpenKeys([]);
  };

  const handleCollapse = (nextCollapsed: boolean) => {
    setIsCollapsing(true);
    setCollapsed(nextCollapsed);
    setOpenKeys(nextCollapsed ? [] : [activeGroupKey]);
    if (collapseTimerRef.current !== null) {
      window.clearTimeout(collapseTimerRef.current);
    }
    collapseTimerRef.current = window.setTimeout(() => {
      setIsCollapsing(false);
    }, 180);
  };

  useEffect(() => () => {
    if (collapseTimerRef.current !== null) {
      window.clearTimeout(collapseTimerRef.current);
    }
  }, []);

  const handleLogout = async () => {
    await logout();
    message.success('已退出登录');
    navigate('/login', { replace: true });
  };

  const userMenuItems: MenuProps['items'] = [
    {
      key: 'username',
      disabled: true,
      label: (
        <Space direction="vertical" size={0}>
          <Text strong>{user?.display_name ?? user?.username}</Text>
          <Text type="secondary">{user?.username}</Text>
        </Space>
      ),
    },
    { type: 'divider' },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: '退出登录',
      onClick: () => void handleLogout(),
    },
  ];

  const todayLabel = new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(new Date());

  return (
    <Layout
      className={isCollapsing ? 'app-layout app-layout-collapsing' : 'app-layout'}
      style={{ minHeight: '100vh', background: 'transparent' }}
    >
      <Sider
        theme="dark"
        width={272}
        collapsible
        collapsed={collapsed}
        onCollapse={handleCollapse}
        collapsedWidth={84}
        className="app-sider"
        style={{ position: 'sticky', top: 0, height: '100vh' }}
      >
        <div className={collapsed ? 'app-brand app-brand-collapsed' : 'app-brand'}>
          <button
            type="button"
            className="app-brand-core"
            onClick={() => navigate(DEFAULT_LANDING_ROUTE)}
            aria-label="返回案例质检"
          >
            <span className={collapsed ? 'app-brand-mark app-brand-mark-collapsed' : 'app-brand-mark'}>
              <img src="/cpic-mark.png" alt="太保图标" className="app-brand-logo" />
            </span>
            {!collapsed && (
              <span className="app-brand-copy">
                <span className="app-brand-wordmark">智测平台</span>
              </span>
            )}
          </button>
        </div>

        <Menu
          theme="dark"
          mode="inline"
          triggerSubMenuAction="hover"
          inlineIndent={18}
          inlineCollapsed={collapsed}
          selectedKeys={[selectedKey]}
          openKeys={openKeys}
          onOpenChange={handleOpenChange}
          items={menuItems}
          onClick={handleMenuClick}
          className="app-side-menu"
          style={{ borderInlineEnd: 'none', background: 'transparent', fontSize: 15, fontWeight: 500 }}
        />
      </Sider>

      <Layout style={{ background: 'transparent' }}>
        <Header style={{ padding: '16px 28px 0', background: 'transparent', height: 'auto', lineHeight: 'normal' }}>
          <div className="app-topbar">
            <div className="app-topbar__identity">
              <span className="app-topbar__title">一站式智能测试服务平台</span>
              <div className="app-topbar__meta">
                <span className="app-status-pill">{todayLabel}</span>
              </div>
            </div>

            <Dropdown menu={{ items: userMenuItems }} placement="bottomRight" trigger={['click']}>
              <Button type="text" className="app-user-trigger">
                <Space size={12}>
                  <Avatar className="app-user-avatar" icon={<UserOutlined />} />
                  <Space direction="vertical" size={0} className="app-user-stack">
                    <Text strong>{user?.display_name ?? user?.username}</Text>
                    <Text type="secondary">{user?.username}</Text>
                  </Space>
                </Space>
              </Button>
            </Dropdown>
          </div>
        </Header>

        <Content style={{ padding: '20px 28px', maxWidth: 1440, margin: '0 auto', width: '100%' }}>
          <div className="app-page-shell">
            <div className="app-page-content">{children}</div>
          </div>
        </Content>

        <Footer style={{ textAlign: 'center', color: '#666', background: 'transparent', padding: '8px 0 28px' }}>
          <div style={{ opacity: 0.72, fontSize: 13 }}>智测平台 @ 太保科技</div>
        </Footer>
      </Layout>
    </Layout>
  );
};

export default AppLayout;

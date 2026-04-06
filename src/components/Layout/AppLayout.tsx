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
import type { UserRole } from '../../types';

const { Sider, Content, Footer, Header } = Layout;
const { Text } = Typography;
const DEFAULT_LANDING_ROUTE = '/functional-testing/case-quality';
const CASE_GENERATION_ROUTE = '/functional-testing/case-generation';
const TEST_CASES_ROUTE = '/functional-testing/test-cases';
const SIDEBAR_WIDTH = 248;
const SIDEBAR_COLLAPSED_WIDTH = 84;

interface AppLayoutProps {
  children: React.ReactNode;
}

interface SidebarMenuLeaf {
  key: string;
  label: string;
  kind: 'route' | 'placeholder';
  visibleRoles?: UserRole[];
}

interface SidebarMenuBranch {
  key: string;
  label: string;
  kind: 'group';
  children: SidebarMenuNode[];
  visibleRoles?: UserRole[];
}

type SidebarMenuNode = SidebarMenuLeaf | SidebarMenuBranch;

interface SidebarMenuGroup {
  key: string;
  icon: React.ReactNode;
  label: string;
  children: SidebarMenuNode[];
  visibleRoles?: UserRole[];
}

const ROOT_GROUP_KEY = 'quality-board';
const QUALITY_ANALYSIS_GROUP_KEY = 'quality-board/quality-analysis';
const PLACEHOLDER_MESSAGE_KEY = 'sidebar-placeholder-coming-soon';

const routeToOpenKeysMap: Record<string, string[]> = {
  [CASE_GENERATION_ROUTE]: ['functional-testing'],
  [TEST_CASES_ROUTE]: ['functional-testing'],
  [DEFAULT_LANDING_ROUTE]: ['functional-testing'],
  '/': ['functional-testing'],
  '/history': ['functional-testing'],
  '/functional-testing/records': ['functional-testing'],
  '/requirement-analysis': ['functional-testing'],
  '/requirement-analysis/history': ['functional-testing'],
  '/automation-testing/api': ['automation-testing'],
  '/ai-tools/agents': ['ai-tools'],
  '/performance-analysis': [ROOT_GROUP_KEY],
  '/issue-analysis': [ROOT_GROUP_KEY, QUALITY_ANALYSIS_GROUP_KEY],
  '/defect-analysis': [ROOT_GROUP_KEY, QUALITY_ANALYSIS_GROUP_KEY],
  '/project-management': ['project-management'],
  '/production-issues': ['config-management'],
  '/test-issues': ['config-management'],
  '/config-management/prompt-templates': ['config-management'],
  '/requirement-mappings': ['config-management'],
  '/projects': ['config-management'],
  '/operation-logs': ['system-management'],
  '/users': ['system-management'],
};

const baseMenuGroups: SidebarMenuGroup[] = [
  {
    key: 'quality-board',
    icon: <BarChartOutlined />,
    label: '质量看板',
    children: [
      {
        key: '/performance-analysis',
        label: '效能分析',
        kind: 'route',
        visibleRoles: ['admin'],
      },
      {
        key: QUALITY_ANALYSIS_GROUP_KEY,
        label: '质量分析',
        kind: 'group',
        children: [
          { key: '/issue-analysis', label: '生产问题分析', kind: 'route' },
          { key: '/defect-analysis', label: '测试问题分析', kind: 'route' },
        ],
      },
    ],
  },
  {
    key: 'functional-testing',
    icon: <ToolOutlined />,
    label: '功能测试',
    children: [
      { key: CASE_GENERATION_ROUTE, label: '案例生成', kind: 'route' },
      { key: TEST_CASES_ROUTE, label: '测试案例', kind: 'route' },
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
      { key: 'placeholder:perf-pressure', label: '压测场景', kind: 'placeholder' },
      { key: 'placeholder:perf-script-gen', label: '脚本生成', kind: 'placeholder' },
      { key: 'placeholder:perf-script-run', label: '脚本执行', kind: 'placeholder' },
      { key: 'placeholder:perf-tuning', label: '性能调优', kind: 'placeholder' },
    ],
  },
  {
    key: 'ai-tools',
    icon: <RobotOutlined />,
    label: 'AI辅助工具',
    children: [
      { key: '/ai-tools/agents', label: 'AI助手', kind: 'route' },
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
      { key: '/config-management/prompt-templates', label: '提示词管理', kind: 'route', visibleRoles: ['admin'] },
      { key: '/requirement-mappings', label: '需求映射关系', kind: 'route' },
      { key: '/projects', label: '代码映射关系', kind: 'route' },
    ],
  },
  {
    key: 'system-management',
    icon: <TeamOutlined />,
    label: '系统管理',
    visibleRoles: ['admin'],
    children: [
      { key: '/users', label: '用户管理', kind: 'route' },
      { key: '/operation-logs', label: '操作记录', kind: 'route' },
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

function areSameKeys(left: string[], right: string[]) {
  return left.length === right.length && left.every((key, index) => key === right[index]);
}

function buildMenuItems(nodes: SidebarMenuNode[]): MenuProps['items'] {
  return nodes.map((node) => (
    node.kind === 'group'
      ? {
          key: node.key,
          label: node.label,
          children: buildMenuItems(node.children),
        }
      : {
          key: node.key,
          label: node.label,
        }
  ));
}

function collectMenuKinds(nodes: SidebarMenuNode[]): Array<[string, SidebarMenuLeaf['kind']]> {
  return nodes.flatMap((node) => (
    node.kind === 'group'
      ? collectMenuKinds(node.children)
      : [[node.key, node.kind]]
  ));
}

function collectSubmenuRootKeys(nodes: SidebarMenuNode[], rootKey: string): Array<[string, string]> {
  return nodes.flatMap((node) => (
    node.kind === 'group'
      ? [[node.key, rootKey], ...collectSubmenuRootKeys(node.children, rootKey)]
      : []
  ));
}

function isVisibleForRole(visibleRoles: UserRole[] | undefined, role: UserRole | null | undefined) {
  return !visibleRoles || (role !== null && role !== undefined && visibleRoles.includes(role));
}

function filterSidebarMenuNodesByRole(nodes: SidebarMenuNode[], role: UserRole | null | undefined): SidebarMenuNode[] {
  const filteredNodes: SidebarMenuNode[] = [];

  nodes.forEach((node) => {
    if (!isVisibleForRole(node.visibleRoles, role)) {
      return;
    }

    if (node.kind !== 'group') {
      filteredNodes.push(node);
      return;
    }

    const children = filterSidebarMenuNodesByRole(node.children, role);
    if (children.length === 0) {
      return;
    }

    filteredNodes.push({ ...node, children });
  });

  return filteredNodes;
}

function filterSidebarMenuGroupsByRole(groups: SidebarMenuGroup[], role: UserRole | null | undefined): SidebarMenuGroup[] {
  const filteredGroups: SidebarMenuGroup[] = [];

  groups.forEach((group) => {
    if (!isVisibleForRole(group.visibleRoles, role)) {
      return;
    }

    const children = filterSidebarMenuNodesByRole(group.children, role);
    if (children.length === 0) {
      return;
    }

    filteredGroups.push({ ...group, children });
  });

  return filteredGroups;
}

const AppLayout: React.FC<AppLayoutProps> = ({ children }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [isCollapsing, setIsCollapsing] = useState(false);
  const collapseTimerRef = useRef<number | null>(null);

  const selectedKey = resolveMenuSelectedKey(location.pathname);
  const activeOpenKeys = routeToOpenKeysMap[selectedKey] ?? [ROOT_GROUP_KEY];
  const [openKeys, setOpenKeys] = useState<string[]>(activeOpenKeys);

  useEffect(() => {
    if (!collapsed) {
      setOpenKeys((previousKeys) => (
        areSameKeys(previousKeys, activeOpenKeys)
          ? previousKeys
          : activeOpenKeys
      ));
    }
  }, [activeOpenKeys, collapsed]);

  const sidebarGroups = useMemo(() => {
    return filterSidebarMenuGroupsByRole(baseMenuGroups, user?.role);
  }, [user?.role]);

  const menuItems: MenuProps['items'] = useMemo(() => (
    sidebarGroups.map((group) => ({
      key: group.key,
      icon: group.icon,
      label: group.label,
      children: buildMenuItems(group.children),
    }))
  ), [sidebarGroups]);

  const menuKindMap = useMemo(
    () => Object.fromEntries(
      sidebarGroups.flatMap((group) => collectMenuKinds(group.children)),
    ) as Record<string, SidebarMenuLeaf['kind']>,
    [sidebarGroups],
  );

  const topLevelGroupKeys = useMemo(
    () => sidebarGroups.map((group) => group.key),
    [sidebarGroups],
  );

  const submenuRootKeyMap = useMemo(
    () => Object.fromEntries(
      sidebarGroups.flatMap((group) => [
        [group.key, group.key],
        ...collectSubmenuRootKeys(group.children, group.key),
      ]),
    ) as Record<string, string>,
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
    const nextKeys = keys.map((key) => String(key));

    if (collapsed) {
      setOpenKeys(nextKeys);
      return;
    }

    const latestKey = nextKeys.find((key) => !openKeys.includes(key));
    if (latestKey) {
      const activeRootKey = topLevelGroupKeys.includes(latestKey)
        ? latestKey
        : submenuRootKeyMap[latestKey];

      if (activeRootKey) {
        setOpenKeys(nextKeys.filter((key) => (
          topLevelGroupKeys.includes(key)
            ? key === activeRootKey
            : submenuRootKeyMap[key] === activeRootKey
        )));
        return;
      }

      setOpenKeys(nextKeys);
      return;
    }

    setOpenKeys(nextKeys);
  };

  const handleCollapse = (nextCollapsed: boolean) => {
    setIsCollapsing(true);
    setCollapsed(nextCollapsed);
    setOpenKeys(nextCollapsed ? [] : activeOpenKeys);
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
        <Space orientation="vertical" size={0}>
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
  const contentOffset = collapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_WIDTH;

  return (
    <Layout
      className={isCollapsing ? 'app-layout app-layout-collapsing' : 'app-layout'}
      style={{ minHeight: '100vh', background: 'transparent' }}
    >
      <Sider
        theme="dark"
        width={SIDEBAR_WIDTH}
        collapsible
        collapsed={collapsed}
        onCollapse={handleCollapse}
        collapsedWidth={SIDEBAR_COLLAPSED_WIDTH}
        className="app-sider"
        data-testid="app-sider"
        style={{ position: 'fixed', inset: '0 auto 0 0', height: '100vh', zIndex: 120 }}
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
            {!collapsed ? (
              <span className="app-brand-copy">
                <span className="app-brand-wordmark">智测平台</span>
              </span>
            ) : null}
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

      <Layout
        data-testid="app-main-layout"
        className="app-main-layout"
        style={{ background: 'transparent', minWidth: 0, marginInlineStart: contentOffset }}
      >
        <Header style={{ padding: '16px 20px 0', background: 'transparent', height: 'auto', lineHeight: 'normal' }}>
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
                  <Space orientation="vertical" size={0} className="app-user-stack">
                    <Text strong>{user?.display_name ?? user?.username}</Text>
                    <Text type="secondary">{user?.username}</Text>
                  </Space>
                </Space>
              </Button>
            </Dropdown>
          </div>
        </Header>

        <Content style={{ padding: '16px 20px 24px', width: '100%', minWidth: 0 }}>
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

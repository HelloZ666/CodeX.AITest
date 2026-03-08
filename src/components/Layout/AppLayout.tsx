import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ApartmentOutlined,
  BarChartOutlined,
  FileSearchOutlined,
  FolderOpenOutlined,
  LogoutOutlined,
  SafetyCertificateOutlined,
  SettingOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { Avatar, Button, Dropdown, Layout, Menu, Space, Typography, message } from 'antd';
import type { MenuProps } from 'antd';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';

const { Sider, Content, Footer, Header } = Layout;
const { Text } = Typography;

interface AppLayoutProps {
  children: React.ReactNode;
}

const routeToGroupMap: Record<string, string> = {
  '/': 'quality',
  '/history': 'quality',
  '/issue-analysis': 'issue-insight',
  '/defect-analysis': 'issue-insight',
  '/requirement-analysis': 'requirement-analysis',
  '/requirement-analysis/history': 'requirement-analysis',
  '/requirement-analysis/rules': 'requirement-analysis',
  '/project-management': 'project-management',
  '/production-issues': 'file-management',
  '/test-issues': 'file-management',
  '/projects': 'file-management',
  '/users': 'system-management',
};

const AppLayout: React.FC<AppLayoutProps> = ({ children }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [isCollapsing, setIsCollapsing] = useState(false);
  const collapseTimerRef = useRef<number | null>(null);

  const selectedKey = location.pathname.startsWith('/project/') ? '/projects' : location.pathname;
  const activeGroupKey = routeToGroupMap[selectedKey] ?? 'quality';
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

  const menuItems: MenuProps['items'] = useMemo(() => {
    const items: MenuProps['items'] = [
      {
        key: 'issue-insight',
        icon: <BarChartOutlined />,
        label: '数据看板',
        children: [
          { key: '/issue-analysis', label: '生产问题分析' },
          { key: '/defect-analysis', label: '测试问题分析' },
        ],
      },
      {
        key: 'requirement-analysis',
        icon: <FileSearchOutlined />,
        label: '需求分析',
        children: [
          { key: '/requirement-analysis', label: '需求分析' },
          { key: '/requirement-analysis/history', label: '分析记录' },
          { key: '/requirement-analysis/rules', label: '过滤规则' },
        ],
      },
      {
        key: 'quality',
        icon: <SafetyCertificateOutlined />,
        label: '案例分析',
        children: [
          { key: '/', label: '案例分析' },
          { key: '/history', label: '分析记录' },
        ],
      },
      {
        key: 'project-management',
        icon: <ApartmentOutlined />,
        label: '项目管理',
        children: [{ key: '/project-management', label: '项目列表' }],
      },
      {
        key: 'file-management',
        icon: <FolderOpenOutlined />,
        label: '文件管理',
        children: [
          { key: '/production-issues', label: '生产问题' },
          { key: '/test-issues', label: '测试问题' },
          { key: '/projects', label: '代码映射关系' },
        ],
      },
    ];

    if (user?.role === 'admin') {
      items.push({
        key: 'system-management',
        icon: <SettingOutlined />,
        label: '系统管理',
        children: [{ key: '/users', label: '用户管理' }],
      });
    }

    return items;
  }, [user?.role]);

  const handleMenuClick: MenuProps['onClick'] = ({ key }) => {
    if (typeof key === 'string' && key.startsWith('/')) {
      navigate(key);
    }
  };

  const handleOpenChange: MenuProps['onOpenChange'] = (keys) => {
    if (collapsed) {
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
    if (!nextCollapsed) {
      setOpenKeys([activeGroupKey]);
    }
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
    {
      type: 'divider',
    },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: '退出登录',
      onClick: () => void handleLogout(),
    },
  ];

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
        breakpoint="lg"
        collapsedWidth={84}
        className="app-sider"
        style={{ position: 'sticky', top: 0, height: '100vh' }}
      >
        <div className={collapsed ? 'app-brand app-brand-collapsed' : 'app-brand'}>
          <button
            type="button"
            className="app-brand-core"
            onClick={() => navigate('/')}
            aria-label="返回案例分析"
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
          inlineIndent={18}
          inlineCollapsed={collapsed}
          selectedKeys={[selectedKey]}
          openKeys={collapsed ? [] : openKeys}
          onOpenChange={handleOpenChange}
          items={menuItems}
          onClick={handleMenuClick}
          className="app-side-menu"
          style={{
            borderInlineEnd: 'none',
            background: 'transparent',
            fontSize: 15,
            fontWeight: 500,
          }}
        />
      </Sider>

      <Layout style={{ background: 'transparent' }}>
        <Header
          style={{
            padding: '16px 28px 0',
            background: 'transparent',
            height: 'auto',
            lineHeight: 'normal',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '14px 18px',
              borderRadius: 18,
              background: 'rgba(255,255,255,0.55)',
              border: '1px solid rgba(255,255,255,0.45)',
              backdropFilter: 'blur(14px)',
              boxShadow: '0 12px 30px rgba(15, 52, 96, 0.08)',
            }}
          >
            <Space orientation="vertical" size={0}>
              <Text strong style={{ fontSize: 16 }}>
                欢迎使用智测平台
              </Text>
              <Text type="secondary">
                当前登录：{user?.display_name ?? user?.username}（{user?.role === 'admin' ? '管理员' : '普通用户'}）
              </Text>
            </Space>

            <Dropdown menu={{ items: userMenuItems }} placement="bottomRight" trigger={['click']}>
              <Button type="text" style={{ height: 'auto', padding: '4px 8px' }}>
                <Space size={12}>
                  <Avatar icon={<UserOutlined />} />
                  <Space orientation="vertical" size={0} style={{ alignItems: 'flex-start' }}>
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
            <div className="app-page-watermark" aria-hidden="true">
              <img src="/cpic-mark.png" alt="" className="app-page-watermark-logo" />
            </div>
            <div className="app-page-content">{children}</div>
          </div>
        </Content>

        <Footer style={{ textAlign: 'center', color: '#666', background: 'transparent', padding: '8px 0 28px' }}>
          <div style={{ opacity: 0.72, fontSize: 13 }}>智测平台@太保科技</div>
        </Footer>
      </Layout>
    </Layout>
  );
};

export default AppLayout;

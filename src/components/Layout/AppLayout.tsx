import React, { useEffect, useState } from 'react';
import { Layout, Menu } from 'antd';
import type { MenuProps } from 'antd';
import {
  BarChartOutlined,
  ProjectOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons';
import { useLocation, useNavigate } from 'react-router-dom';

const { Sider, Content, Footer } = Layout;

interface AppLayoutProps {
  children: React.ReactNode;
}

function renderSectionLabel(title: string) {
  return <span className="app-menu-title">{title}</span>;
}

const AppLayout: React.FC<AppLayoutProps> = ({ children }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(true);

  const selectedKey = location.pathname.startsWith('/project/')
    ? '/projects'
    : location.pathname;

  const activeGroupKey = selectedKey === '/issue-analysis' || selectedKey === '/defect-analysis'
    ? 'issue-insight'
    : selectedKey === '/projects'
      ? 'project-management'
      : 'quality';

  const [openKeys, setOpenKeys] = useState<string[]>([activeGroupKey]);

  useEffect(() => {
    if (collapsed) {
      setOpenKeys([]);
      return;
    }

    setOpenKeys((previousKeys) => {
      if (previousKeys.length === 1 && previousKeys[0] === activeGroupKey) {
        return previousKeys;
      }

      return [activeGroupKey];
    });
  }, [activeGroupKey, collapsed]);

  const menuItems: MenuProps['items'] = [
    {
      key: 'issue-insight',
      icon: <BarChartOutlined />,
      label: renderSectionLabel('问题归纳'),
      children: [
        {
          key: '/issue-analysis',
          label: '生产问题',
        },
        {
          key: '/defect-analysis',
          label: '缺陷总结',
        },
      ],
    },
    {
      key: 'project-management',
      icon: <ProjectOutlined />,
      label: renderSectionLabel('项目管理'),
      children: [
        {
          key: '/projects',
          label: '代码映射关系',
        },
      ],
    },
    {
      key: 'quality',
      icon: <SafetyCertificateOutlined />,
      label: renderSectionLabel('案例质检'),
      children: [
        {
          key: '/',
          label: '质检分析',
        },
        {
          key: '/history',
          label: '历史记录',
        },
      ],
    },
  ];

  const handleMenuClick: MenuProps['onClick'] = ({ key }) => {
    if (typeof key === 'string' && key.startsWith('/')) {
      navigate(key);
    }
  };

  const handleOpenChange: MenuProps['onOpenChange'] = (keys) => {
    const latestKey = keys.find((key) => !openKeys.includes(String(key)));
    if (latestKey) {
      setOpenKeys([String(latestKey)]);
      return;
    }

    setOpenKeys([]);
  };

  const handleCollapse = (nextCollapsed: boolean) => {
    setCollapsed(nextCollapsed);

    if (!nextCollapsed) {
      setOpenKeys([activeGroupKey]);
    }
  };

  return (
    <Layout style={{ minHeight: '100vh', background: 'transparent' }}>
      <Sider
        theme="dark"
        width={272}
        collapsible
        collapsed={collapsed}
        onCollapse={handleCollapse}
        breakpoint="lg"
        collapsedWidth={84}
        className="app-sider"
        style={{
          position: 'sticky',
          top: 0,
          height: '100vh',
        }}
      >
        <div className={collapsed ? 'app-brand app-brand-collapsed' : 'app-brand'}>
          <button
            type="button"
            className="app-brand-core"
            onClick={() => navigate('/')}
            aria-label="返回质检分析"
          >
            <span className={collapsed ? 'app-brand-mark app-brand-mark-collapsed' : 'app-brand-mark'}>
              <img
                src="/cpic-mark-tight.png"
                alt="太保图标"
                className="app-brand-logo"
              />
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
        <Content style={{ padding: '28px 28px 20px', maxWidth: 1440, margin: '0 auto', width: '100%' }}>
          <div className="app-page-shell">
            <div className="app-page-watermark" aria-hidden="true">
              <img src="/cpic-mark-tight.png" alt="" className="app-page-watermark-logo" />
            </div>
            <div className="app-page-content">{children}</div>
          </div>
        </Content>
        <Footer style={{ textAlign: 'center', color: '#666', background: 'transparent', padding: '8px 0 28px' }}>
          <div style={{ opacity: 0.72, fontSize: 13 }}>
            智测平台@太保科技
          </div>
        </Footer>
      </Layout>
    </Layout>
  );
};

export default AppLayout;

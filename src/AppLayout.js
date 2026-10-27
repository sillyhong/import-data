import React, { useEffect, useState } from 'react';
import { Button, Drawer, Layout, Menu, Typography } from 'antd';
import {
  AppstoreOutlined,
  DatabaseOutlined,
  GlobalOutlined,
  SearchOutlined,
  FileTextOutlined,
  TeamOutlined,
  ThunderboltOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
} from '@ant-design/icons';
import { Link, Outlet, useLocation } from 'react-router-dom';
import './AppLayout.css';

const { Sider, Content } = Layout;
const { Text } = Typography;
const SIDEBAR_STORAGE_KEY = 'import-desk.sidebar-collapsed';

function isNarrowScreen() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia ? window.matchMedia('(max-width: 991px)').matches : window.innerWidth < 992;
}

function getSavedCollapsed() {
  try { return window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === 'true'; }
  catch (_) { return false; }
}

const navigation = [
  { key: '/app', icon: <DatabaseOutlined />, label: <Link to="/app">进出口数据</Link> },
  { key: '/app/tradesns', icon: <GlobalOutlined />, label: <Link to="/app/tradesns">TradeSNS</Link> },
  { key: '/app/importgenius', icon: <TeamOutlined />, label: <Link to="/app/importgenius">ImportGenius</Link> },
  { key: '/app/importyeti', icon: <SearchOutlined />, label: <Link to="/app/importyeti">ImportYeti</Link> },
  { key: '/app/tasks', icon: <ThunderboltOutlined />, label: <Link to="/app/tasks">任务执行</Link> },
  { key: '/app/robot-tasks', icon: <TeamOutlined />, label: <Link to="/app/robot-tasks">客户开发任务</Link> },
  { key: '/app/task-logs', icon: <FileTextOutlined />, label: <Link to="/app/task-logs">任务日志</Link> },
];

function AppLayout() {
  const { pathname } = useLocation();
  const [isMobile, setIsMobile] = useState(isNarrowScreen);
  const [desktopCollapsed, setDesktopCollapsed] = useState(getSavedCollapsed);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (!window.matchMedia) return undefined;
    const media = window.matchMedia('(max-width: 991px)');
    const update = () => { setIsMobile(media.matches); setMobileOpen(false); };
    if (media.addEventListener) media.addEventListener('change', update);
    else media.addListener(update);
    return () => {
      if (media.removeEventListener) media.removeEventListener('change', update);
      else media.removeListener(update);
    };
  }, []);

  useEffect(() => { setMobileOpen(false); }, [pathname]);

  const setCollapsed = value => {
    setDesktopCollapsed(value);
    try { window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(value)); } catch (_) { /* Storage may be unavailable in private mode. */ }
  };
  const selectedKey = pathname.startsWith('/app/task-logs') || pathname.startsWith('/app/scheduler-logs')
    ? '/app/task-logs'
    : pathname.startsWith('/app/robot-tasks')
    ? '/app/robot-tasks'
    : pathname.startsWith('/app/tasks')
    ? '/app/tasks'
    : pathname.startsWith('/app/importyeti')
    ? '/app/importyeti'
    : pathname.startsWith('/app/importgenius')
      ? '/app/importgenius'
      : pathname.startsWith('/app/tradesns')
        ? '/app/tradesns'
        : '/app';

  const navigationContent = (
    <div className="workspace-sidebar-content" id="workspace-navigation">
        <Link className="workspace-brand" to="/app" aria-label="Import Desk 首页" onClick={() => setMobileOpen(false)}>
          <span className="workspace-brand-mark"><AppstoreOutlined /></span>
          <span className="workspace-brand-copy">
            <strong>Import Desk</strong>
            <Text>TRADE INTELLIGENCE</Text>
          </span>
        </Link>
        <div className="workspace-nav-label">工作空间</div>
        {!isMobile && <Button
          className="workspace-collapse-button"
          type="text"
          icon={<MenuFoldOutlined />}
          aria-label="收起侧边栏"
          title="收起侧边栏"
          aria-controls="workspace-navigation"
          aria-expanded
          onClick={() => setCollapsed(true)}
        />}
        <Menu
          className="workspace-menu"
          theme="dark"
          mode="inline"
          selectedKeys={[selectedKey]}
          items={navigation}
          onClick={() => setMobileOpen(false)}
        />
        <div className="workspace-sider-footer">
          <span className="workspace-status-dot" />
          <span>数据工作台</span>
          <Text>已连接</Text>
        </div>
    </div>
  );

  return (
    <Layout className={`workspace-layout${isMobile ? ' workspace-layout--mobile' : ''}${!isMobile && desktopCollapsed ? ' workspace-layout--sidebar-hidden' : ''}`}>
      {!isMobile && !desktopCollapsed && <Sider className="workspace-sider" width={248}>{navigationContent}</Sider>}
      {isMobile && <Drawer
        className="workspace-mobile-drawer"
        title="工作空间导航"
        placement="left"
        width="min(288px, calc(100vw - 32px))"
        visible={mobileOpen}
        onClose={() => setMobileOpen(false)}
        bodyStyle={{ padding: 0 }}
        destroyOnClose
      >{navigationContent}</Drawer>}
      <Layout className="workspace-main">
        {isMobile && <header className="workspace-mobile-header">
          <Button
            type="text"
            icon={<MenuUnfoldOutlined />}
            aria-label="打开侧边栏"
            aria-controls="workspace-navigation"
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen(true)}
          />
          <span className="workspace-mobile-brand">Import Desk</span>
          <span className="workspace-mobile-caption">数据工作台</span>
        </header>}
        <Content className="workspace-content">
          {!isMobile && desktopCollapsed && <div className="workspace-desktop-toolbar">
            <Button
              icon={<MenuUnfoldOutlined />}
              aria-label="展开侧边栏"
              aria-controls="workspace-navigation"
              aria-expanded={false}
              onClick={() => setCollapsed(false)}
            >展开导航</Button>
          </div>}
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}

export default AppLayout;

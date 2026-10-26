import React from 'react';
import { Layout, Menu, Typography } from 'antd';
import {
  AppstoreOutlined,
  DatabaseOutlined,
  GlobalOutlined,
  SearchOutlined,
  FileTextOutlined,
  TeamOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { Link, Outlet, useLocation } from 'react-router-dom';
import './AppLayout.css';

const { Sider, Content } = Layout;
const { Text } = Typography;

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

  return (
    <Layout className="workspace-layout">
      <Sider className="workspace-sider" width={248} breakpoint="lg" collapsedWidth={72}>
        <Link className="workspace-brand" to="/app" aria-label="Import Desk 首页">
          <span className="workspace-brand-mark"><AppstoreOutlined /></span>
          <span className="workspace-brand-copy">
            <strong>Import Desk</strong>
            <Text>TRADE INTELLIGENCE</Text>
          </span>
        </Link>
        <div className="workspace-nav-label">工作空间</div>
        <Menu
          className="workspace-menu"
          theme="dark"
          mode="inline"
          selectedKeys={[selectedKey]}
          items={navigation}
        />
        <div className="workspace-sider-footer">
          <span className="workspace-status-dot" />
          <span>数据工作台</span>
          <Text>已连接</Text>
        </div>
      </Sider>
      <Layout className="workspace-main">
        <Content className="workspace-content">
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}

export default AppLayout;

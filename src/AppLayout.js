import React from 'react';
import { Layout, Menu, Typography } from 'antd';
import {
  AppstoreOutlined,
  DatabaseOutlined,
  GlobalOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import { Link, Outlet, useLocation } from 'react-router-dom';
import './AppLayout.css';

const { Sider, Header, Content } = Layout;
const { Text } = Typography;

const navigation = [
  { key: '/app', icon: <DatabaseOutlined />, label: <Link to="/app">进出口数据</Link> },
  { key: '/app/tradesns', icon: <GlobalOutlined />, label: <Link to="/app/tradesns">TradeSNS</Link> },
  { key: '/app/importgenius', icon: <TeamOutlined />, label: <Link to="/app/importgenius">ImportGenius</Link> },
];

function AppLayout() {
  const { pathname } = useLocation();
  const selectedKey = pathname.startsWith('/app/importgenius')
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
        <Header className="workspace-header">
          <div>
            <span className="workspace-header-kicker">IMPORT DATA PLATFORM</span>
            <span className="workspace-header-title">全球贸易数据工作台</span>
          </div>
          <div className="workspace-header-meta">
            <span className="workspace-header-indicator" />
            <Text>数据服务正常</Text>
          </div>
        </Header>
        <Content className="workspace-content">
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}

export default AppLayout;

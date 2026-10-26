import React, { useState } from 'react';
import { Alert, Button, Card, Col, Empty, Row, Space, Tag, Typography } from 'antd';

const { Text } = Typography;
const FINDINGS = [
  {
    id: 'result-state', priority: 'P0', platforms: ['facebook', 'instagram', 'tiktok', 'email'], title: '先让处理标记反映实际结果', stage: '本次接入修复范围',
    problem: '初始审计发现 Facebook 私信返回不明确、Instagram 未找到按钮仍走到成功路径，第二轮邮件缺失会话仍可能推进标记。旧 hasUsed / hasChated 无法证明实际提交。',
    recommendation: '只在明确完成平台操作后推进本地标记；跳过、失败与结果待核对分别记录。保留每次尝试的时间、原因和运行日志，再用小批量真实页面验证。',
    benefit: '降低漏跟进与错误重发，操作者可以追溯每次结果。',
    acceptance: '模拟缺失按钮、缺失会话和提交异常时，成功标记均不推进；未知结果进入人工核对队列，真实小批次逐项核对平台结果。',
    sources: ['facebook/chat.js:254', 'ig/chat.js:197–224', 'email/emailApp2.js:42,96'],
  },
  {
    id: 'durable-state', priority: 'P0', platforms: ['tools'], title: '保护名单写入与共享浏览器会话', stage: '本次接入修复范围',
    problem: '初始实现整文件覆盖名单，并共享 9222 浏览器会话；Facebook 浏览器回调还引用 Node 文件写入。异步 forEach 无法等待完整处理，可能提前结束或并发覆盖。',
    recommendation: '使用单任务互斥、可等待入口与串行遍历；在 Node 侧写入同目录临时文件后原子替换。浏览器会话增加任务归属，后续引入按记录更新与操作流水。',
    benefit: '防止任务互相操作账号、名单截断和执行中断后状态丢失。',
    acceptance: '并发启动只能有一项进入浏览器；中断写入保留完整 JSON；确认 driver 清理完成后释放锁，否则保留待核对状态；重启可识别未完成尝试。',
    sources: ['utils/writeNameFile.js:1', 'facebook/FBApp.js:90,129', 'ig/IGApp.js:1', 'tt/TTWebApp.js:1'],
  },
  {
    id: 'email-retry', priority: 'P0', platforms: ['email'], title: '结果不明确的邮件先核对，再重试', stage: '规划能力',
    problem: '当前使用 Selenium 操作 Gmail 预约界面，首轮 / 二轮 / 三轮固定上限为 20 / 50 / 20。页面提交与本地写回之间存在结果不明确窗口，重跑可能产生重复邮件。',
    recommendation: '为每位联系人、轮次和模板建立唯一尝试记录；将待处理、预约已提交、失败、待核对分开。遇到超时先检查 Gmail 草稿、预约和已发送，再决定重试。',
    benefit: '避免因网络或页面错误重复触达同一联系人。',
    acceptance: '模拟提交后断网，不自动重发；每项可关联唯一尝试和核对结果；页面只称“预约提交”，不声称已送达。',
    sources: ['email/emailApp.js:1', 'email/emailApp2.js:1', 'email/emailApp3.js:1'],
  },
  {
    id: 'facebook-funnel', priority: 'P1', platforms: ['facebook'], title: '把关系拓展与立即关注拆成两个决策', stage: '规划能力',
    problem: 'Facebook 任务沿种子账号的关系继续遍历，并即时关注；它并非只收集线索。当前筛选与触达绑定，难以先审阅候选人。',
    recommendation: '先生成候选名单，保存来源账号、稳定 ID、匹配原因和排除原因，再由操作者批准关注或私信；单独维护种子处理状态与客户触达状态。',
    benefit: '先判断是否匹配目标客户，再消耗关注或沟通机会。',
    acceptance: '候选生成阶段不关注、不私信；任一候选能解释来源和筛选原因；只有批准名单进入外部动作。',
    sources: ['facebook/FBApp.js:1', 'facebook/chat.js:1'],
  },
  {
    id: 'instagram-seeds', priority: 'P1', platforms: ['instagram'], title: '重新评估 Instagram 种子与筛选质量', stage: '规划能力',
    problem: '初始快照中 1,609 个种子均带已使用旧标记，按旧逻辑可继续处理的种子为 0。清空 hasUsed 会重复遍历，也不能改善线索质量。',
    recommendation: '保留旧记录，新增种子来源、采集时间、状态版本与筛选解释。补充经确认的新种子，对地区、行业和账号简介逐项记录命中或排除依据。',
    benefit: '区分种子耗尽、筛选过严与实际无匹配客户。',
    acceptance: '可看到每个种子的候选数与排除原因；不会通过重置历史标记重复触达；新旧批次可以独立复核。',
    sources: ['ig/IGFriendLists.js:1', 'ig/IGApp.js:1'],
  },
  {
    id: 'tiktok-identity', priority: 'P1', platforms: ['tiktok'], title: '先统一 TikTok 身份与重复记录', stage: '规划能力',
    problem: '初始 Web 名单快照有 3,256 条记录、3,204 个唯一 ID，重复 52 条；另有 39 条记录同时标记 hasChated 与 notFoundName，旧状态含义矛盾。项目没有独立的客户线索库。',
    recommendation: '用平台稳定 ID 建立唯一联系人；将别名、来源、关注状态与私信尝试分表记录。先输出重复与冲突审阅结果，再迁移，保留来源证据。',
    benefit: '避免同一账号重复关注或私信，后续可以按联系人追踪。',
    acceptance: '唯一 ID 有唯一联系人；52 条重复和 39 条矛盾记录都有处理记录；历史冲突不自动解释为触达成功。',
    sources: ['tt/FollowingListWebAlls.js:1', 'tt/TTWebApp.js:1', 'tt/chat.js:1'],
  },
  {
    id: 'followup-state', priority: 'P1', platforms: ['email'], title: '用回复、退信和停止跟进决定下一轮', stage: '规划能力',
    problem: '当前轮次主要依赖历史布尔标记，没有统一的回复、退信或停止跟进状态；第三轮创建新邮件，不能保证沿原邮件会话继续。',
    recommendation: '增加联系人跟进状态和停止名单；已回复、退信或要求停止时阻止后续任务。保存 messageId / threadId，以同一会话组织跟进并区分新邮件。',
    benefit: '及时结束无效或已完成沟通，保留完整上下文。',
    acceptance: '回复、退信与停止名单样例均被排除；原会话可追溯；第三轮标题与说明清楚标注新邮件或会话回复。',
    sources: ['email/emailApp2.js:1', 'email/emailApp3.js:1'],
  },
  {
    id: 'email-time-api', priority: 'P1', platforms: ['email'], title: '按联系人时区预约，并评估 Gmail API', stage: '本次修复与后续规划',
    problem: '当前按国家配置固定时间，缺少联系人时区；初始周五逻辑可能落到周末，未知国家也缺少安全回退。Gmail 页面变化会影响自动化稳定性。',
    recommendation: '本次修复默认时间与下个工作日；后续保存 IANA 时区、联系人偏好和节假日规则。评估 OAuth + Gmail API 的发送、线程关联、错误分类与退避重试。',
    benefit: '预约时间可解释，降低页面变化与时差造成的失误。',
    acceptance: '周五至周日及未知国家测试通过；跨时区、夏令时结果可预览；API 接入经过授权验证且错误重试不会重复发送。',
    sources: ['email/timeConfig.js:1', 'email/emailApp.js:1'],
  },
  {
    id: 'checkpoint', priority: 'P1', platforms: ['facebook', 'instagram', 'tiktok', 'tools'], title: '增加逐条进度与安全断点恢复', stage: '规划能力',
    problem: '现有日志能追踪进程，但处理状态仍以文件标记为主。进程退出只代表流程结束，无法完整解释每位联系人成功、跳过或失败的原因。',
    recommendation: '记录待处理、进行中、已提交、已跳过、失败和待核对状态；保存当前联系人、错误分类和下次重试时间，恢复时先核对未决尝试。',
    benefit: '可以从中断位置继续，也可以定位具体失败原因。',
    acceptance: '任意位置终止后进度可恢复；已确认提交的联系人不重复执行；同一运行汇总与逐条结果能对账。',
    sources: ['utils/writeNameFile.js:1', 'facebook/chat.js:1', 'ig/chat.js:1', 'tt/chat.js:1'],
  },
  {
    id: 'conversion', priority: 'P2', platforms: ['facebook', 'instagram', 'tiktok', 'email'], title: '用有效线索与回复衡量开发质量', stage: '规划能力',
    problem: '关注数、已处理标记或脚本完成数无法回答谁是有效客户，也无法比较模板是否带来有效回复。',
    recommendation: '定义目标客户画像与可解释评分；记录合格线索、有效回复、预约沟通和成交阶段。小规模比较模板，保持受众可比并记录版本。',
    benefit: '把优化目标从动作次数推进到客户开发效果。',
    acceptance: '每个指标有明确口径和联系人证据；模板实验可复核受众、版本与结果；不把历史布尔标记算作有效客户或送达。',
    sources: ['facebook/chat.js:1', 'ig/chat.js:1', 'tt/chat.js:1', 'email/emailApp.js:1'],
  },
];

const PLATFORM_NAMES = { facebook: 'Facebook', instagram: 'Instagram', tiktok: 'TikTok', email: 'Gmail 邮件', tools: '共享基础' };
const OFFICIAL_BOUNDARIES = [
  { platforms: ['email'], title: 'Gmail：发送、线程和可重试错误是不同能力', text: 'API 发送不等于送达；沿原线程回复需正确设置 threadId、References、In-Reply-To 与主题。后续接入应按错误类别退避重试，并遵守发件人要求。当前任务仍操作 Gmail 网页预约，尚未接入这些 API。', links: [
    ['发送指南', 'https://developers.google.com/workspace/gmail/api/guides/sending'], ['会话线程', 'https://developers.google.com/workspace/gmail/api/guides/threads'], ['错误处理', 'https://developers.google.com/workspace/gmail/api/guides/handle-errors'], ['发件人要求', 'https://support.google.com/mail/answer/81126?hl=en'],
  ] },
  { platforms: ['tiktok'], title: 'TikTok：先确认所需数据是否在授权范围内', text: 'Display API 展示授权创作者的资料与视频，不提供任意客户关系网。Research API 面向获准的非商业研究，不能当作商业获客通道；后续方案需单独确认产品权限与授权。', links: [
    ['Display API', 'https://developers.tiktok.com/docs/en/display-api-overview'], ['Research API FAQ', 'https://developers.tiktok.com/docs/en/research-api-faq'],
  ] },
  { platforms: ['instagram', 'facebook'], title: 'Instagram：官方消息接口有会话发起边界', text: 'Meta 的 Instagram Send API 文档要求收件人先向专业账号发送消息。迁移官方接口不能直接等价替换当前对陌生账号的私信流程；需先设计用户主动发起与授权路径。', links: [
    ['Meta 官方 Instagram 文档', 'https://www.postman.com/meta/instagram/documentation/6yqw8pt/instagram-api?entity=request-23987686-fc851f39-7194-4522-a475-2cea8de46d16'],
  ] },
];

function RobotInsights({ platform = 'all', keyword = '' }) {
  const [priority, setPriority] = useState('all');
  const query = keyword.trim().toLocaleLowerCase();
  const findings = FINDINGS.filter(item => (platform === 'all' || item.platforms.includes(platform))
    && (priority === 'all' || item.priority === priority)
    && [item.title, item.problem, item.recommendation, item.acceptance, ...item.sources].join(' ').toLocaleLowerCase().includes(query));
  const boundaries = OFFICIAL_BOUNDARIES.filter(item => platform === 'all' || item.platforms.includes(platform));
  return <div className="robot-insights">
    <Alert className="robot-alert" type="info" showIcon message="审计基准：2026-10-25 · 源码与本地历史快照" description="以下统计是接入前名单快照及旧处理标记，不代表实时库存、有效客户、私信成功或邮件送达。本次接入修复项仍需真实平台小批量核验；标注“规划能力”的内容尚未实现。源码行号以初始审计版本为准。" />
    {(platform === 'all' || platform === 'instagram' || platform === 'tiktok') && <Row gutter={[16, 16]} className="robot-snapshots">
      {(platform === 'all' || platform === 'instagram') && <Col xs={24} lg={12}><Card className="robot-snapshot-card" bordered={false}><Text className="robot-eyebrow">INSTAGRAM · 历史种子快照</Text><div className="robot-snapshot-number">1,609 <span>个种子</span></div><p>旧“已使用”标记 1,609 · 旧逻辑可处理种子 0</p><Text type="secondary">说明种子状态已耗尽，不能推断客户质量或触达结果。</Text></Card></Col>}
      {(platform === 'all' || platform === 'tiktok') && <Col xs={24} lg={12}><Card className="robot-snapshot-card" bordered={false}><Text className="robot-eyebrow">TIKTOK WEB · 历史名单快照</Text><div className="robot-snapshot-number">3,204 <span>个唯一 ID</span></div><p>记录 3,256 · 重复 52 · 旧标记矛盾 39 条</p><Text type="secondary">这是来源名单记录，没有独立线索库或合格客户判定。</Text></Card></Col>}
    </Row>}
    <div className="robot-section-intro"><span>改进建议 <Text type="secondary">{findings.length} 项</Text></span><Space wrap aria-label="优先级筛选">{[['all', '全部优先级'], ['P0', 'P0 · 先保证结果可靠'], ['P1', 'P1 · 完善客户流程'], ['P2', 'P2 · 优化转化']].map(([value, label]) => <Button key={value} size="small" type={priority === value ? 'primary' : 'default'} aria-pressed={priority === value} onClick={() => setPriority(value)}>{label}</Button>)}</Space></div>
    {!findings.length ? <Card className="robot-empty" bordered={false}><Empty description="没有匹配的分析，请调整平台、优先级或关键词。" /></Card> : <div className="robot-findings">{findings.map(item => <Card key={item.id} className="robot-finding" bordered={false}>
      <div className="robot-card-top"><Space wrap><Tag color={item.priority === 'P0' ? 'red' : item.priority === 'P1' ? 'orange' : 'blue'}>{item.priority}</Tag>{item.platforms.map(value => <Tag key={value}>{PLATFORM_NAMES[value]}</Tag>)}</Space><Tag>{item.stage}</Tag></div>
      <h3>{item.title}</h3><p><strong>问题</strong>{item.problem}</p><p><strong>建议</strong>{item.recommendation}</p><p><strong>收益</strong>{item.benefit}</p><div className="robot-acceptance"><strong>验收方式</strong><span>{item.acceptance}</span></div><div className="robot-source">项目依据（my-robot）：{item.sources.map(source => <code key={source}>{source}</code>)}</div>
    </Card>)}</div>}
    {boundaries.length > 0 && <Card className="robot-boundaries" bordered={false}><Text className="robot-eyebrow">OFFICIAL CAPABILITY BOUNDARIES</Text><h3>后续接入的官方能力边界</h3><Text type="secondary">文档核对日期：2026-10-25。以下用于方案评估，当前控制台没有新增这些集成。</Text>{boundaries.map(item => <div key={item.title} className="robot-boundary"><h4>{item.title}</h4><p>{item.text}</p><Space wrap>{item.links.map(([label, href]) => <a key={href} href={href} target="_blank" rel="noopener noreferrer">{label} ↗</a>)}</Space></div>)}</Card>}
  </div>;
}

export default RobotInsights;

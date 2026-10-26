const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_ROOT = path.resolve(__dirname, '../../../bot/my-robot');
const COMMON = {
  group: '客户开发', params: [], supported: true,
  prerequisites: ['服务端已安装 my-robot 的依赖及兼容的 Chrome、ChromeDriver。', '操作者已登录对应平台，浏览器调试端口 9222 可用。', '运行前核对名单、黑白名单及消息模板，并确认有权执行这些外部动作。'],
  limitations: ['页面选择器依赖当前平台界面，页面变化或登录失效会导致失败。', '完成只表示脚本流程结束，不能证明关注成功、消息被阅读或邮件送达。', '终止不能撤回已经发生的关注、私信或邮件预约；结果不明确时请人工核对。', '强制结束进程可能留下磁盘锁，需要管理员核实没有任务运行后清理，服务不会自动抢锁。'],
};
const SOCIAL = {
  facebook: { label: 'Facebook', list: 'facebook/FBFriendLists.js', expand: 'facebook/FBApp.js', cap: 30 },
  instagram: { label: 'Instagram', list: 'ig/IGFriendLists.js', expand: 'ig/IGApp.js', cap: 25 },
  tiktok: { label: 'TikTok', list: 'tt/FollowingListWebAlls.js', expand: 'tt/TTWebApp.js', cap: 25 },
};

const TASKS = [{
  ...COMMON, id: 'robot.inspect', platform: 'tools', readOnly: true,
  name: '客户名单诊断｜只读检查四个平台的候选数量、重复账号与历史标记矛盾',
  description: '离线读取四个平台的固定名单，汇总记录数、候选数、历史标记、重复及冲突；不打开浏览器，不返回客户明细。旧标记仅代表脚本历史状态。',
  sourceScript: '', batchLimit: null,
  inputs: ['Facebook、Instagram、TikTok 和邮件的四个固定名单文件，仅接受 exports.names = JSON 数组格式。'],
  outputs: ['运行日志中的平台汇总、候选计数、重复与冲突计数；不输出姓名、账号、链接或邮箱。'],
  steps: ['校验文件仍位于服务端 my-robot 根目录内。', '使用 JSON.parse 解析严格的名单格式，不执行 JavaScript。', '按平台身份键去重，并分别计算原始条目和唯一身份的候选数量。'],
  effects: ['只读取本地文件，不修改名单，不连接外部平台。'],
  prerequisites: ['服务端 my-robot 目录存在，名单是严格 JSON 数组赋值文件。'],
  limitations: ['候选计数仅按已有字段作静态筛选，未运行黑白名单代码、页面阈值或平台检查。', '首轮、二轮、三轮邮件分别只检查各自旧标记，不代表已经完成上一轮。', '重复身份采用去除首尾空白及小写后的键；历史标记不代表实际触达或送达。', '缺失或格式不合法的名单按平台报告，不执行其中的任何代码。'],
}];

for (const [platform, config] of Object.entries(SOCIAL)) {
  const identity = platform === 'facebook' ? '主页链接' : platform === 'tiktok' ? 'uniqueId' : '账号名称';
  const filters = platform === 'tiktok'
    ? '选择有 uniqueId、未标记 hasUsed 且未标记 notFoundName 的种子，按脚本中的关注数/粉丝数阈值及黑白名单筛选。'
    : platform === 'instagram'
      ? '选择有名称且未标记 hasUsed 的种子，按脚本中的人数阈值及黑白名单筛选关联账号。'
      : '选择有主页链接且未标记 hasUsed 的种子，用脚本黑白名单筛选关联账号。';
  TASKS.push({
    ...COMMON, id: `robot.${platform}.expand`, platform, readOnly: false,
    name: `${config.label}｜遍历种子${platform === 'facebook' ? '好友、粉丝及关注' : '关注与粉丝'}列表并${platform === 'facebook' ? '添加好友或关注' : '关注'}行业匹配账号`,
    description: `读取本地种子账号，遍历其${platform === 'facebook' ? '好友、粉丝及关注' : '关注与粉丝'}列表，按行业关键词、黑名单及脚本人数规则筛选后，尝试${platform === 'facebook' ? '添加好友或关注' : '关注'}关联账号；写回种子处理状态和适用的黑名单。关联账号尚未保存为独立客户线索，脚本没有整批数量上限。`,
    sourceScript: config.expand, batchLimit: null,
    inputs: [`${config.list} 中的种子名单及历史处理标记。`, 'utils/nameFilter.js 与平台黑名单中的固定筛选规则。'],
    outputs: [`更新 ${config.list} 的种子历史处理状态。`, '按原脚本保存平台黑名单；未输出独立的潜客明细库，脱敏日志只报告流程状态。'],
    steps: [filters, `按${identity}打开种子主页并遍历关联列表。`, `对符合条件的关联账号尝试${platform === 'facebook' ? '添加好友或关注' : '关注'}，将种子处理标记和黑名单写回固定文件。`],
    effects: [`会在已登录的平台账号下执行${platform === 'facebook' ? '添加好友或关注' : '关注'}。`, '会覆盖保存本地种子名单的处理标记及平台黑名单。'],
    limitations: [...COMMON.limitations, '没有整批数量上限，会遍历全部符合条件的种子；页面未提供虚构的可调数量。', '发现的关联账号未保存为独立潜客库，不能作为完整的线索采集任务使用。', '名称关键词与人数阈值不能证明账号是有效客户，旧 hasUsed 标记不能证明关注成功。'],
  }, {
    ...COMMON, id: `robot.${platform}.chat`, platform, readOnly: false,
    name: `${config.label}｜向尚未联系且未标记失效的名单账号提交首轮产品介绍私信`,
    description: `读取本地名单，向尚无私信历史标记且通过脚本筛选的账号尝试提交固定开发消息；单次按脚本处理上限 ${config.cap} 条，更新本地处理标记。`,
    sourceScript: `${path.posix.dirname(config.expand)}/chat.js`, batchLimit: config.cap,
    inputs: [`${config.list} 中有名称、未标记 hasChated、未标记 notFoundName 的条目${platform === 'tiktok' ? '，并排除 sendFailTip 条目' : ''}。`, 'utils/chatMessage.js 中的固定首轮私信模板与脚本黑名单。'],
    outputs: [`更新 ${config.list} 的历史私信/异常标记及可用的会话标识。`, '脱敏运行日志；不保存收件人、消息正文或页面原始对象。'],
    steps: ['读取名单并排除脚本已有处理、异常及黑名单条件。', '进入主页或既有会话，检查页面历史消息后尝试提交固定开发消息。', `达到脚本固定上限 ${config.cap} 条后结束；只有明确提交成功才更新处理标记。`],
    effects: ['会向真实平台账号提交私信。', '会写回本地名单的处理或异常标记。'],
    limitations: [...COMMON.limitations, '历史 hasChated 可能来自旧版本脚本，不能据此判定消息实际已发送或已读。', '页面历史关键词检查不等同于完整的去重、退订或停止跟进机制。'],
  });
}

for (const [index, round, cap] of [[1, 'first', 20], [2, 'second', 50], [3, 'third', 20]]) {
  const flag = index === 1 ? 'hasUsed' : `hasUsed${index}`;
  TASKS.push({
    ...COMMON, id: `robot.email.${round}`, platform: 'email', readOnly: false,
    name: index === 1 ? 'Gmail｜为未处理客户编写公司专属开发信、附加产品目录并预约首轮发送'
      : index === 2 ? 'Gmail｜查找既有开发信会话并预约第二轮跟进内容'
        : 'Gmail｜向未处理第三轮客户新建产品推广邮件、附加目录并预约发送',
    description: `按本地名单顺序选择未标记 ${flag} 的联系人，${index === 2 ? '用邮箱和固定主题查找已有开发信会话，填写第二轮跟进内容，未找到会话时跳过' : index === 1 ? '新建包含公司名主题和首轮介绍正文的开发信，并通过现有云盘界面附加产品目录' : '重新新建第三轮产品推广邮件，填写固定主题与正文，并通过现有云盘界面附加目录'}。按国家时间和下个工作日预约，只有观察到预约确认才更新本轮标记；每批最多确认预约 ${cap} 封，跳过项不计入。预约完成不等于邮件送达。`,
    sourceScript: `email/emailApp${index === 1 ? '' : index}.js`, batchLimit: cap,
    inputs: [`email/emailLists.js 中未标记 ${flag} 的条目；脚本不会强制要求上一轮标记。`, 'utils/chatMessage.js 的本轮模板及 email/timeConfig.js 的国家预约时间配置。'],
    outputs: [`更新 email/emailLists.js 的 ${flag} 本轮历史处理标记。`, 'Gmail 中提交的预约记录；脱敏日志仅说明脚本流程状态。'],
    steps: [`按名单顺序选择未标记 ${flag} 的条目。`, index === 2 ? '在 Gmail 查找既有开发信，进入会话编辑跟进内容；具体回复或转发行为需核对当前界面。' : '在 Gmail 填写收件人及固定模板内容。', '根据国家时间配置选择预约时间，未知国家使用默认时间，预约日期避开周末。', `确认预约动作完成后写回本轮标记；达到 ${cap} 条处理上限结束。`],
    effects: ['会在当前 Gmail 登录账号中提交真实邮件预约；到预约时间可能由 Gmail 发送。', '会修改本地邮件名单的本轮处理状态。'],
    limitations: [...COMMON.limitations, '首轮、二轮、三轮独立筛选自己的历史标记，不自动验证前序触达、回复、退订或送达。', '预约时间沿用脚本国家配置，未实现收件人时区或 Gmail API 回执。', '历史 hasUsed、hasUsed2、hasUsed3 仅是处理标记，不能算作投递或有效客户数。'],
  });
}

TASKS.push({
  ...COMMON, id: 'robot.tools.android', platform: 'tools', readOnly: false, supported: false,
  name: 'Android / Appium 移动端任务（尚未接入）',
  description: '仓库包含 Android / Appium 设备脚本，依赖特定模拟器、包名和本地 Appium；当前控制台没有适配这些入口。',
  sourceScript: 'tt/index.js', batchLimit: null,
  inputs: ['特定 Android 设备、Appium 服务和移动端名单。'],
  outputs: ['当前控制台不产生移动端执行结果。'],
  steps: ['仅展示仓库能力缺口，尚未提供固定、可等待并可终止的移动端执行入口。'],
  effects: ['原始脚本可能操作真实移动端账号；此入口已禁用。'],
  prerequisites: ['需先完成设备配置、可等待入口及安全终止适配。'],
  limitations: ['未适配为控制台任务，不能从本页运行。'],
  disabledReason: 'Android / Appium 入口尚未适配，当前不可执行。',
}, {
  ...COMMON, id: 'robot.tools.list-reset', platform: 'tools', readOnly: false, supported: false,
  name: '名单清理与状态重置工具（未开放）',
  description: '仓库包含名字清理、名单合并和历史状态重置片段；其中部分逻辑被注释，覆盖状态可能造成重复触达，当前控制台不开放执行。',
  sourceScript: 'ig/resetAllfollow.js', batchLimit: null,
  inputs: ['平台本地名单与历史处理标记。'],
  outputs: ['当前控制台不改写或重置任何名单。'],
  steps: ['仅展示现有工具的接入缺口，需要先定义预览、备份和明确的变更范围。'],
  effects: ['原始工具可能覆盖名单字段或历史状态；此入口已禁用。'],
  prerequisites: ['需为每个工具设计独立的可审查变更及恢复方案。'],
  limitations: ['历史处理标记重置可能引发再次关注、私信或预约邮件。'],
  disabledReason: '名单工具尚未提供安全预览和恢复流程，当前不可执行。',
}, {
  ...COMMON, id: 'robot.tools.website', platform: 'tools', readOnly: true, supported: false,
  name: '客户官网检查｜验证网站可访问性并整理公开联系方式来源（尚未完成）',
  description: 'autoSearch 中的网站检查仍是实验片段，存在未定义请求地址、未返回异步结果和 URL 缺少协议等问题，尚不能产出可靠的客户官网检查报告。',
  sourceScript: 'autoSearch/index.js', batchLimit: null,
  inputs: ['待验证的公司官网列表，以及经确认的请求超时、并发和重试范围。'],
  outputs: ['规划输出为 HTTP 状态、最终跳转地址、检查时间和公开联系方式来源；当前不产生报告。'],
  steps: ['需要先完成 HTTPS URL 规范化、实际请求实现、Promise 返回与有限重试，再增加可审查的报告。'],
  effects: ['未来能力会访问指定客户官网；当前入口已禁用，不发送任何请求。'],
  prerequisites: ['补齐请求实现，定义输出格式，并验证网络错误与无效域名的处理。'],
  limitations: ['官网可访问和存在公开联系方式均不能直接证明客户有采购意向。'],
  disabledReason: '网站检查尚未完成可靠的请求与结果处理，当前不可执行。',
});

const DEFINITIONS = new Map(TASKS.map(task => [task.id, task]));

function resolveRobotRoot() {
  return path.resolve(process.env.MY_ROBOT_ROOT || DEFAULT_ROOT);
}

function getRobotIntegration() {
  const root = resolveRobotRoot();
  try {
    if (!fs.statSync(root).isDirectory()) throw new Error('not-directory');
    return { available: true, root, error: '' };
  } catch (_) {
    return { available: false, root, error: '服务端 my-robot 根目录不存在或不可读取，请配置 MY_ROBOT_ROOT。' };
  }
}

function fixedFile(root, relative) {
  const resolvedRoot = fs.realpathSync(root);
  const target = fs.realpathSync(path.join(resolvedRoot, relative));
  if (!target.startsWith(`${resolvedRoot}${path.sep}`) || !fs.statSync(target).isFile()) throw new Error('invalid-file');
  return target;
}

function getRobotTask(taskId) {
  return DEFINITIONS.get(taskId);
}

function taskAvailability(task, integration = getRobotIntegration()) {
  if (!task.supported) return { available: false, disabledReason: task.disabledReason || '此能力尚未适配。' };
  if (!integration.available) return { available: false, disabledReason: integration.error };
  if (task.readOnly) return { available: true, disabledReason: '' };
  try {
    const source = fs.readFileSync(fixedFile(integration.root, task.sourceScript), 'utf8');
    if (!/module\.exports\s*=\s*\{[^}]*\bstartApp\b[^}]*\}/.test(source) || !/require\.main\s*===\s*module/.test(source)) {
      return { available: false, disabledReason: '脚本尚未提供可等待的 startApp 导出及受保护的命令行入口。' };
    }
    return { available: true, disabledReason: '' };
  } catch (_) {
    return { available: false, disabledReason: `固定入口 ${task.sourceScript} 缺失、不可读取或超出根目录。` };
  }
}

function getRobotCatalog() {
  const robot = getRobotIntegration();
  return { robot, tasks: TASKS.map(task => ({ ...task, ...taskAvailability(task, robot) })) };
}

function validateRobotParams(taskId, value = {}) {
  const task = getRobotTask(taskId);
  if (!task) throw Object.assign(new Error('未知客户开发任务。'), { status: 404 });
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Object.assign(new Error('任务参数格式错误。'), { status: 400 });
  const keys = Object.keys(value);
  if (task.readOnly) {
    if (keys.length) throw Object.assign(new Error('只读名单检查仅接受空参数对象。'), { status: 400 });
    return {};
  }
  if (keys.length !== 1 || keys[0] !== 'acknowledged' || value.acknowledged !== true) {
    throw Object.assign(new Error('外部动作必须且只能提交 acknowledged: true，确认关注、私信或邮件预约及本地名单修改。'), { status: 400 });
  }
  return { acknowledged: true };
}

function assertRobotTaskAvailable(taskId) {
  const task = getRobotTask(taskId);
  if (!task) throw Object.assign(new Error('未知客户开发任务。'), { status: 404 });
  const integration = getRobotIntegration();
  const availability = taskAvailability(task, integration);
  if (!availability.available) throw Object.assign(new Error(availability.disabledReason), { status: 503 });
  return { task, root: integration.root };
}

module.exports = { getRobotCatalog, getRobotIntegration, getRobotTask, validateRobotParams, assertRobotTaskAvailable, fixedFile };

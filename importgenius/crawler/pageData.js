const cheerio = require('cheerio');
const vm = require('vm');

const PAGE_ERROR_CODES = Object.freeze({
  BLOCKED: 'IMPORTGENIUS_BROWSER_VERIFICATION_REQUIRED',
  ACCESS_DENIED: 'IMPORTGENIUS_ACCESS_DENIED',
  RATE_LIMITED: 'IMPORTGENIUS_RATE_LIMITED',
  MISSING: 'IMPORTGENIUS_PAGE_DATA_MISSING',
  INVALID: 'IMPORTGENIUS_PAGE_DATA_INVALID',
});

const PAGE_ACCESS_ERROR_CODES = new Set([
  PAGE_ERROR_CODES.BLOCKED,
  PAGE_ERROR_CODES.ACCESS_DENIED,
  PAGE_ERROR_CODES.RATE_LIMITED,
]);

const NUXT_ASSIGNMENT = /window\s*(?:\.\s*__NUXT__|\[\s*['"]__NUXT__['"]\s*\])\s*=/;
const BROWSER_VERIFICATION = /\bEO_Bot_Ssid\b|\/cdn-cgi\/challenge-platform\/|\bcf-chl-|<title[^>]*>\s*Just a moment\b/i;

function responseDiagnostics(html, $, response) {
  const details = [];
  if (response?.status) details.push(`HTTP ${response.status}`);
  const contentType = response?.headers?.['content-type'];
  if (contentType) details.push(`Content-Type ${contentType}`);
  details.push(`${Buffer.byteLength(html, 'utf8')} bytes`);
  const title = $('title').first().text().replace(/\s+/g, ' ').trim().slice(0, 100);
  if (title) details.push(`标题 ${title}`);
  const responseUrl = response?.request?.res?.responseUrl || response?.config?.url;
  if (responseUrl) {
    try {
      const url = new URL(responseUrl);
      details.push(`URL ${url.origin}${url.pathname}`);
    } catch (_) {
      // Only include a parsed public URL; never log headers, cookies or a raw query string.
    }
  }
  return details.join('；');
}

function isPageAccessError(error) {
  return PAGE_ACCESS_ERROR_CODES.has(error?.code);
}

function classifyPageRequestError(error, { label = '页面' } = {}) {
  const response = error?.response;
  const status = Number(response?.status);
  if (status !== 403 && status !== 429 && status !== 567) return error;

  const source = typeof response.data === 'string' ? response.data : '';
  const $ = cheerio.load(source);
  const verificationRequired = status === 403 && BROWSER_VERIFICATION.test(source);
  const rateLimited = status === 429 || status === 567;
  const code = rateLimited
    ? PAGE_ERROR_CODES.RATE_LIMITED
    : verificationRequired ? PAGE_ERROR_CODES.BLOCKED : PAGE_ERROR_CODES.ACCESS_DENIED;
  const reason = rateLimited
    ? status === 567
      ? '反复返回 HTTP 567 限流/访问限制响应，请等待站点允许访问后再续跑'
      : '返回了限流响应，请等待站点允许的重试时间后再续跑'
    : verificationRequired ? '返回了站点浏览器验证页' : '被站点拒绝访问';
  return Object.assign(new Error(
    `${label}${reason}；本次采集已停止，已完成的 checkpoint 保留。（${responseDiagnostics(source, $, response)}）`
  ), { code, httpStatus: status });
}

function parseNuxtPage(html, { label = '页面', response } = {}) {
  const source = typeof html === 'string' ? html : '';
  const $ = cheerio.load(source);
  const scripts = $('script').toArray()
    .map(element => $(element).html() || '')
    .filter(script => NUXT_ASSIGNMENT.test(script));
  const diagnostics = responseDiagnostics(source, $, response);

  if (!scripts.length) {
    if (BROWSER_VERIFICATION.test(source)) {
      throw Object.assign(new Error(
        `${label}返回了站点浏览器验证页，尚未取得 ImportGenius 数据。axios 不执行页面 JavaScript；已停止本次采集，请使用站点允许的访问方式取得数据后再续跑。（${diagnostics}）`
      ), { code: PAGE_ERROR_CODES.BLOCKED });
    }
    throw Object.assign(new Error(
      `${label}未找到 window.__NUXT__ 数据，可能发生登录跳转或页面结构变化。（${diagnostics}）`
    ), { code: PAGE_ERROR_CODES.MISSING });
  }

  let lastError;
  for (const script of scripts) {
    try {
      // Evaluate the complete data script: compressed IIFEs and object assignments
      // need no fragile terminator regex. The context exposes no Node/browser APIs.
      const json = vm.runInNewContext(
        `var window = Object.create(null);\n${script}\n;JSON.stringify(window.__NUXT__);`,
        Object.create(null),
        { timeout: 1000, contextCodeGeneration: { strings: false, wasm: false } }
      );
      const data = JSON.parse(json);
      if (!data || typeof data !== 'object' || Array.isArray(data)) {
        throw new Error('window.__NUXT__ 不是数据对象');
      }
      return data;
    } catch (error) {
      lastError = error;
    }
  }
  throw Object.assign(new Error(
    `${label}Nuxt 数据解析失败：${lastError.message}。（${diagnostics}）`
  ), { code: PAGE_ERROR_CODES.INVALID });
}

module.exports = { parseNuxtPage, PAGE_ERROR_CODES, classifyPageRequestError, isPageAccessError };

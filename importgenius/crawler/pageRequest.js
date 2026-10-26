const axios = require('axios');
const { withRetry, getRetryAfterMs } = require('./retry');
const { PAGE_ERROR_CODES, classifyPageRequestError } = require('./pageData');

const MAX_RATE_LIMIT_ERRORS = 2;
const RATE_LIMIT_STATUSES = new Set([429, 567]);

function publicUrl(value) {
  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname}`;
  } catch (_) {
    return '(unknown URL)';
  }
}

function createRequestSession({ log = message => console.error(message) } = {}) {
  const controller = new AbortController();
  let rateLimitCount = 0;
  let stoppedError = null;

  return {
    signal: controller.signal,
    get rateLimitCount() { return rateLimitCount; },
    assertActive() {
      if (stoppedError) throw stoppedError;
    },
    recordRateLimit(error, label, url, status = Number(error?.response?.status)) {
      if (stoppedError) throw stoppedError;
      rateLimitCount += 1;
      const waitSeconds = Math.ceil(getRetryAfterMs(error) / 1000);
      const context = `${label}；HTTP ${status}；本任务累计 ${rateLimitCount} 次；URL ${publicUrl(url)}${waitSeconds ? `；Retry-After ${waitSeconds} 秒` : ''}`;
      if (rateLimitCount > MAX_RATE_LIMIT_ERRORS) {
        stoppedError = Object.assign(new Error(
          `限流/访问限制响应累计 ${rateLimitCount} 次，超过允许的 ${MAX_RATE_LIMIT_ERRORS} 次；立即终止本任务，取消在途请求及重试等待，已完成的 checkpoint 保留。（${context}）`
        ), { code: PAGE_ERROR_CODES.RATE_LIMITED, httpStatus: status, rateLimitCount });
        log(`[ImportGenius][限流][终止] ${stoppedError.message}`);
        controller.abort(stoppedError);
        throw stoppedError;
      }
      log(`[ImportGenius][限流/访问限制] ${context}；第 ${MAX_RATE_LIMIT_ERRORS + 1} 次将立即终止本任务。`);
    },
  };
}

async function requestPage(url, { label = '页面', timeoutMs = 45000, retry, requestSession = createRequestSession() } = {}) {
  requestSession.assertActive();
  try {
    return await withRetry(label, async () => {
      requestSession.assertActive();
      try {
        return await axios.get(url, { timeout: timeoutMs, signal: requestSession.signal });
      } catch (error) {
        requestSession.assertActive();
        const status = Number(error?.response?.status);
        if (RATE_LIMIT_STATUSES.has(status)) requestSession.recordRateLimit(error, label, url, status);
        throw error;
      }
    }, { ...retry, signal: requestSession.signal });
  } catch (error) {
    requestSession.assertActive();
    throw classifyPageRequestError(error, { label });
  }
}

module.exports = { createRequestSession, requestPage };

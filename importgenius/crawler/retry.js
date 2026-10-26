const { getDataSourceOption } = require('../../config/environment');

const TRANSIENT_NETWORK_CODES = new Set([
  'ECONNABORTED', 'ECONNRESET', 'ECONNREFUSED', 'EHOSTUNREACH', 'ENETUNREACH',
  'EAI_AGAIN', 'ETIMEDOUT', 'ECONNERROR', 'ERR_NETWORK',
]);

const TRANSIENT_DATABASE_CODES = new Set([
  ...TRANSIENT_NETWORK_CODES,
  'PROTOCOL_CONNECTION_LOST', 'PROTOCOL_ENQUEUE_AFTER_FATAL_ERROR',
  'ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT', 'ER_CON_COUNT_ERROR',
]);

function abortReason(signal) {
  return signal.reason || Object.assign(new Error('采集已取消。'), { code: 'ABORT_ERR' });
}

function delay(ms, signal) {
  if (signal?.aborted) return Promise.reject(abortReason(signal));
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
      reject(abortReason(signal));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function waitForRetry(ms, wait, signal) {
  if (!wait) return delay(ms, signal);
  if (!signal) return wait(ms);
  if (signal.aborted) return Promise.reject(abortReason(signal));
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(abortReason(signal));
    signal.addEventListener('abort', onAbort, { once: true });
    Promise.resolve().then(() => {
      if (signal.aborted) throw abortReason(signal);
      return wait(ms);
    }).then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort));
  });
}

function isRetryableRequestError(error) {
  const status = Number(error?.response?.status);
  return TRANSIENT_NETWORK_CODES.has(error?.code) ||
    status === 408 || status === 425 || status === 429 || status >= 500;
}

function isRetryableDatabaseError(error) {
  return TRANSIENT_DATABASE_CODES.has(error?.code) ||
    error?.errno === 1205 || error?.errno === 1213 || error?.errno === 2006 || error?.errno === 2013;
}

function getRetryAfterMs(error) {
  const value = error?.response?.headers?.['retry-after'];
  if (value === undefined) return 0;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const dateMs = Date.parse(value);
  return Number.isFinite(dateMs) ? Math.max(0, dateMs - Date.now()) : 0;
}

async function withRetry(label, operation, options = {}) {
  const maxAttempts = Math.max(1, Number(options.maxAttempts || getDataSourceOption('importgenius', 'IMPORTGENIUS_RETRY_ATTEMPTS', 4)));
  const baseDelayMs = Math.max(0, Number(options.baseDelayMs ?? 1500));
  const maxDelayMs = Math.max(baseDelayMs, Number(options.maxDelayMs ?? 120000));
  const shouldRetry = options.shouldRetry || isRetryableRequestError;
  const signal = options.signal;
  const log = options.log || ((message) => console.warn(message));

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    if (signal?.aborted) throw abortReason(signal);
    try {
      return await operation(attempt);
    } catch (error) {
      if (signal?.aborted) throw abortReason(signal);
      if (attempt >= maxAttempts || !shouldRetry(error)) throw error;
      const exponential = Math.min(maxDelayMs, baseDelayMs * (2 ** (attempt - 1)));
      const jitter = Math.floor(exponential * (Math.random() * 0.2));
      const retryAfterMs = getRetryAfterMs(error);
      const maxRetryAfterMs = Math.max(0, Number(options.maxRetryAfterMs ?? 10 * 60 * 1000));
      if (retryAfterMs > maxRetryAfterMs) {
        error.message = `${error.message}；服务端要求等待 ${Math.ceil(retryAfterMs / 1000)} 秒，超过自动重试上限。`;
        throw error;
      }
      const delayMs = Math.max(exponential + jitter, retryAfterMs);
      const status = error?.response?.status ? ` HTTP ${error.response.status}` : '';
      const code = error?.code ? ` ${error.code}` : '';
      log(`[ImportGenius][重试] ${label} 第 ${attempt}/${maxAttempts} 次失败${status}${code}：${error.message}；${delayMs}ms 后重试`);
      await waitForRetry(delayMs, options.delay, signal);
    }
  }
  throw new Error(`Retry loop exited unexpectedly: ${label}`);
}

module.exports = {
  delay,
  withRetry,
  isRetryableRequestError,
  isRetryableDatabaseError,
  getRetryAfterMs,
};

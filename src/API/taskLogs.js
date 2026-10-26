const isLocal = ['localhost', '127.0.0.1'].includes(window.location.hostname);
const prefix = isLocal ? '' : '/api';

async function request(path, filters = {}, { signal } = {}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== null && value !== '') query.set(key, String(value));
  }
  const search = query.toString();
  const response = await fetch(`${prefix}${path}${search ? `?${search}` : ''}`, { signal, cache: 'no-store' });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || body.message || `请求失败（HTTP ${response.status}）`);
  return body;
}

export const getTaskLogs = (filters, options) => request('/task-logs', filters, options);
export const getTaskLog = (id, options) => request(`/task-logs/${encodeURIComponent(id)}`, {}, options);
export const getTaskLogOutput = (id, filters, options) => request(`/task-logs/${encodeURIComponent(id)}/output`, filters, options);

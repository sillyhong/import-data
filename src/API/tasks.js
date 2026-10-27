const isLocal = ['localhost', '127.0.0.1'].includes(window.location.hostname);
const prefix = isLocal ? '' : '/api';

async function request(path, options = {}) {
  const response = await fetch(`${prefix}${path}`, {
    ...options,
    headers: { ...(options.headers || {}), ...(options.body ? { 'Content-Type': 'application/json' } : {}) },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || body.message || `请求失败（HTTP ${response.status}）`);
  return body;
}

export const getTaskCatalog = () => request('/tasks');

export const getImportGeniusBatches = country => request(`/tasks/importgenius/batches?country=${encodeURIComponent(country)}`);

export const runTask = (taskId, params, control = {}) => request(`/tasks/${encodeURIComponent(taskId)}/run`, {
  method: 'POST',
  headers: {
    ...(control.token ? { 'X-Task-Control-Token': control.token } : {}),
    ...(control.confirmed ? { 'X-Task-Confirmed': 'true' } : {}),
  },
  body: JSON.stringify(params || {}),
});

export const getTaskRun = (taskId, runId) => request(`/tasks/${encodeURIComponent(taskId)}/runs/${encodeURIComponent(runId)}`);

export const stopTask = (taskId, runId, control = {}) => request(`/tasks/${encodeURIComponent(taskId)}/runs/${encodeURIComponent(runId)}/stop`, {
  method: 'POST',
  headers: {
    ...(control.token ? { 'X-Task-Control-Token': control.token } : {}),
    ...(control.confirmed ? { 'X-Task-Confirmed': 'true' } : {}),
  },
});

export const updateTaskScheduler = (action, control = {}, schedulerId) => request('/tasks/scheduler', {
  method: 'POST',
  headers: {
    ...(control.token ? { 'X-Task-Control-Token': control.token } : {}),
    ...(control.confirmed ? { 'X-Task-Confirmed': 'true' } : {}),
  },
  body: JSON.stringify({ action, ...(schedulerId ? { schedulerId } : {}) }),
});

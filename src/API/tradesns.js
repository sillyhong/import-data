const isLocalhost = ['localhost', '127.0.0.1'].includes(window.location.hostname);
const prefix = isLocalhost ? '' : '/api';

export async function getTradesnsRecords({ category, page, pageSize }) {
  const query = new URLSearchParams({ category, page: String(page), pageSize: String(pageSize) });
  const response = await fetch(`${prefix}/getTradesns?${query.toString()}`);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message || `请求失败（HTTP ${response.status}）`);
  return body;
}

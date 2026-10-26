const isLocalhost = ['localhost', '127.0.0.1'].includes(window.location.hostname);
const prefix = isLocalhost ? '' : '/api';

function queryString(params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') query.set(key, value);
  });
  return query.toString();
}

async function getJson(path, params) {
  const search = queryString(params);
  const response = await fetch(`${prefix}${path}${search ? `?${search}` : ''}`);
  let body;
  try {
    body = await response.json();
  } catch (_) {
    body = {};
  }
  if (!response.ok) throw new Error(body.message || `请求失败（HTTP ${response.status}）`);
  return body;
}

export const getImportYetiSummary = () => getJson('/getImportyeti/summary');
export const getImportYetiShipments = params => getJson('/getImportyeti/shipments', params);
export const getImportYetiEntities = params => getJson('/getImportyeti/entities', params);

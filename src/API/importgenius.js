
const isLocalhost = ['localhost', '127.0.0.1'].includes(window.location.hostname)
const prefix = isLocalhost ? '' : '/api'

export const getImportGenius = async params => {
    const query = new URLSearchParams();
    Object.entries(params || {}).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') query.set(key, value);
    });
    const response = await fetch(`${prefix}/getImportgenius?${query.toString()}`);
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.message || `请求失败（HTTP ${response.status}）`);
    return body;
}


export const updateTargetById = async (id, isTarget) => {
    return await fetch(`${prefix}/updateImportgenius`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ id: id, isTarget: isTarget })
    });
}


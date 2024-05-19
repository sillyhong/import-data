
const isLocalhost = !!(location.hostname === 'localhost')
const prefix = isLocalhost ? '' : '/api'


export const updateTargetById = async (id, isTarget) => {
    return await fetch(`${prefix}/updateImportgenius`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ id: id, isTarget: isTarget })
    });
}


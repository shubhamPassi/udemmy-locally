export async function fetchPublicImport(provider, id, type) {
    const params = new URLSearchParams({ provider, id, ...(type ? { type } : {}) })
    const response = await fetch(`/api/public-import?${params}`)
    const data = await response.json()
    if (!response.ok) throw new Error(data.error || 'Could not read the public link')
    return data
}

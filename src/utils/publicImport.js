export async function fetchPublicImport(provider, id, type, fresh = false) {
    const params = new URLSearchParams({ provider, id, ...(type ? { type } : {}), ...(fresh ? { fresh: '1' } : {}) })
    const response = await fetch(`/api/public-import?${params}`)
    const data = await response.json()
    if (!response.ok) throw new Error(data.error || 'Could not read the public link')
    return data
}

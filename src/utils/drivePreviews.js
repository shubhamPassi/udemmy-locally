import { driveSession } from './driveAuthorization.js'

const validId = value => /^[a-zA-Z0-9_-]{8,160}$/.test(value || '')
const maxBytes = 16 * 1024 * 1024
export function validatePreviewBundle(bundle, duration) {
    if (bundle?.version !== 1 || bundle.interval !== 10 || !Number.isFinite(bundle.duration) || !(duration > 0) || !Array.isArray(bundle.frames) || bundle.frames.length > 12000 || Math.abs(bundle.duration - duration) > 2) throw Error('Invalid preview bundle')
    const seen = new Set()
    return bundle.frames.map(([time, image]) => {
        if (!Number.isFinite(time) || time < 0 || time >= duration || time % 10 || seen.has(time) || typeof image !== 'string' || image.length > 50000 || !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/.test(image)) throw Error('Invalid preview frame')
        seen.add(time)
        return [time, image]
    })
}

async function readLimited(response) {
    if (!response.ok || Number(response.headers.get('content-length')) > maxBytes) { await response.body?.cancel(); throw Error('Preview unavailable') }
    const reader = response.body.getReader(), chunks = []; let size = 0
    try {
        while (true) { const {done,value} = await reader.read(); if (done) break; size += value.length; if (size > maxBytes) throw Error('Preview too large'); chunks.push(value) }
    } catch (error) { await reader.cancel(); throw error }
    const bytes = new Uint8Array(size); let offset = 0
    for (const chunk of chunks) { bytes.set(chunk,offset); offset += chunk.length }
    return JSON.parse(new TextDecoder().decode(bytes))
}

// Fetch only metadata and the small generated sidecar, never the source video.
export async function loadDrivePreviews(video, duration, apiKey, signal) {
    const id = video.driveFileId || video.url?.match(/(?:\/d\/|[?&]id=)([a-zA-Z0-9_-]+)/)?.[1]
    if (!validId(id)) return []
    const session = driveSession(), token = session?.expiresAt > Date.now() ? session.token : ''
    if (!token && !apiKey?.trim()) return []
    async function request(path, params) {
        const query = new URLSearchParams(params)
        if (!token) query.set('key',apiKey.trim())
        return fetch('https://www.googleapis.com/drive/v3/files'+path+'?'+query,{signal,credentials:'omit',priority:'low',headers:token?{Authorization:'Bearer '+token}:{}})
    }
    const metadataResponse = await request('/'+id,{fields:'id,name,parents'})
    if (!metadataResponse.ok) return []
    const metadata = await metadataResponse.json(), folder = metadata.parents?.[0] || video.driveFolderId
    if (!validId(folder) || !metadata.name) return []
    const name = metadata.name+'.tutin-previews.json'
    const escapedName = name.replace(/\\/g,'\\\\').replace(/'/g,"\\'")
    const listed = await request('',{q:`'${folder}' in parents and trashed = false and name = '${escapedName}'`,fields:'files(id,modifiedTime)',pageSize:'100',orderBy:'modifiedTime desc'})
    if (!listed.ok) return []
    const sidecar = (await listed.json()).files?.[0]
    if (!validId(sidecar?.id)) return []
    return validatePreviewBundle(await readLimited(await request('/'+sidecar.id,{alt:'media'})),duration)
}

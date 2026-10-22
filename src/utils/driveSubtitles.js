import { driveSession } from './driveAuthorization.js'
import { parseSubtitles } from './subtitles.js'

const stem = name => String(name || '').normalize('NFKC').replace(/\.[^.]+$/, '').trim().toLocaleLowerCase()
export function matchDriveSubtitles(video, files) {
    const base = stem(video.name)
    return files.filter(file => /\.(srt|vtt)$/i.test(file.name || '') && (stem(file.name) === base || stem(file.name).startsWith(base + '.') || stem(file.name).startsWith(base + ' - ')))
        .sort((a,b) => (stem(a.name) === base ? 0 : 1) - (stem(b.name) === base ? 0 : 1) || a.name.localeCompare(b.name))
        .map(file => ({ driveFileId: file.id, name: file.name }))
}

async function driveRequest(id, apiKey, { media = false, signal } = {}) {
    if (!/^[a-zA-Z0-9_-]{8,160}$/.test(id || '')) throw Error('Invalid Drive subtitle file.')
    const session = driveSession(), token = session?.expiresAt > Date.now() ? session.token : ''
    if (!token && !apiKey?.trim()) throw Error('Connect Google Drive or add a Google API key in Settings to load course subtitles.')
    const query = new URLSearchParams(media ? { alt: 'media' } : { fields: 'id,name,parents' })
    if (!token) query.set('key', apiKey.trim())
    const response = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?${query}`, { headers: token ? { Authorization: `Bearer ${token}` } : {}, signal, cache: 'no-store', credentials: 'omit' })
    if (!response.ok) throw Error(`Google refused subtitle access (${response.status}). Connect the account that can download the subtitle, then retry.`)
    return response
}

export async function discoverDriveSubtitles(video, apiKey, signal, listFolder) {
    if (video.subtitleSources?.some(source => source.driveFileId)) return video.subtitleSources.filter(source => source.driveFileId)
    const id = video.driveFileId || video.url?.match(/(?:\/d\/|[?&]id=)([a-zA-Z0-9_-]+)/)?.[1]
    if (!id) return []
    const metadata = await (await driveRequest(id, apiKey, { signal })).json()
    const folderId = video.driveFolderId || metadata.parents?.[0]
    if (!folderId) throw Error('Google did not expose this lesson’s parent folder. Re-scan its course folder or import the subtitle file manually.')
    const folder = await listFolder(folderId)
    if (signal?.aborted) throw Error('Cancelled')
    return matchDriveSubtitles({ name: metadata.name || video.originalTitle }, folder.files)
}

export async function loadDriveSubtitle(source, apiKey, signal) {
    const response = await driveRequest(source.driveFileId, apiKey, { media: true, signal })
    const maxBytes = 2 * 1024 * 1024
    if (Number(response.headers.get('content-length')) > maxBytes) { await response.body?.cancel(); throw Error('Subtitle file must be smaller than 2 MB.') }
    const reader = response.body.getReader(), chunks = []; let bytes = 0
    try {
        while (true) {
            const { value, done } = await reader.read()
            if (done) break
            bytes += value.byteLength
            if (bytes > maxBytes) throw Error('Subtitle file must be smaller than 2 MB.')
            chunks.push(value)
        }
    } catch (error) { await reader.cancel(); throw error }
    const data = new Uint8Array(bytes); let offset = 0
    for (const chunk of chunks) { data.set(chunk, offset); offset += chunk.byteLength }
    return parseSubtitles(new TextDecoder().decode(data))
}

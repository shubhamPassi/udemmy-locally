const idPattern = /^[a-zA-Z0-9_-]{8,160}$/
const text = value => value?.simpleText || value?.runs?.map(run => run.text).join('') || ''
const decodeHtml = value => value.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
async function page(url) {
    const response = await fetch(url, { signal: AbortSignal.timeout(15000), headers: { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'en-US,en;q=0.9' } })
    if (!response.ok) throw new Error(`Public source returned ${response.status}`)
    const html = await response.text()
    if (html.length > 8_000_000) throw new Error('Public page is too large to import')
    return html
}
export function parseDrivePage(html) {
    const match = html.match(/_DRIVE_ivd'\]\s*=\s*'((?:\\.|[^'])*)'/)
    if (!match) throw new Error('This folder is not publicly readable. Share it as Anyone with the link → Viewer.')
    const decoded = match[1].replace(/\\(x[0-9a-f]{2}|u[0-9a-f]{4}|.)/gi, (_, escape) => {
        if (escape[0] === 'x' || escape[0] === 'u') return String.fromCharCode(parseInt(escape.slice(1), 16))
        return ({ n: '\n', r: '\r', t: '\t' })[escape] || escape
    })
    const payload = JSON.parse(decoded)
    const files = (payload[0] || []).map(row => ({ id: row[0], name: row[2], mimeType: row[3] }))
    if (payload[1] && payload[1] !== 1) throw new Error('This public folder listing is incomplete. Use a smaller folder or configure a Google API key.')
    return { name: decodeHtml(html.match(/<title>(.*?)<\/title>/s)?.[1] || 'Google Drive Course').replace(/\s*[–-]\s*Google Drive$/, ''), files }
}
export function jsonAfter(html, marker) {
    const start = html.indexOf('{', html.indexOf(marker) + marker.length)
    if (start < 0 || !html.includes(marker)) throw new Error('Public YouTube metadata was unavailable')
    let depth = 0, inString = false, escaped = false
    for (let i = start; i < html.length; i++) {
        const char = html[i]
        if (inString) { if (escaped) escaped = false; else if (char === '\\') escaped = true; else if (char === '"') inString = false }
        else if (char === '"') inString = true
        else if (char === '{') depth++
        else if (char === '}' && --depth === 0) return JSON.parse(html.slice(start, i + 1))
    }
    throw new Error('Public YouTube metadata was incomplete')
}
function collect(object, key, output = []) {
    if (!object || typeof object !== 'object') return output
    if (object[key]) output.push(object[key])
    for (const value of Object.values(object)) if (value && typeof value === 'object') collect(value, key, output)
    return output
}
export async function importYouTube(id, type) {
    if (type === 'video') {
        const response = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}&format=json`, { signal: AbortSignal.timeout(15000) })
        if (!response.ok) throw new Error('YouTube video is unavailable or private')
        const data = await response.json()
        return { title: data.title, author: data.author_name, thumbnail: data.thumbnail_url, videos: [{ title: data.title, youtubeId: id, url: `https://www.youtube.com/watch?v=${id}`, duration: 0 }] }
    }
    const html = await page(`https://www.youtube.com/playlist?list=${id}&hl=en`)
    let data = jsonAfter(html, 'var ytInitialData =')
    const title = data.metadata?.playlistMetadataRenderer?.title || decodeHtml(html.match(/<title>(.*?)<\/title>/s)?.[1] || 'YouTube Playlist').replace(/ - YouTube$/, '')
    const author = text(collect(data, 'playlistSidebarPrimaryInfoRenderer')[0]?.ownerText) || ''
    const videos = [], seen = new Set()
    const key = html.match(/"INNERTUBE_API_KEY":"([^"]+)"/)?.[1]
    const version = html.match(/"INNERTUBE_CLIENT_VERSION":"([^"]+)"/)?.[1]
    for (let batch = 0; batch < 30; batch++) {
        for (const video of collect(data, 'lockupViewModel')) {
            if (video.contentType !== 'LOCKUP_CONTENT_TYPE_VIDEO' || !video.contentId || seen.has(video.contentId)) continue
            const endpoint = collect(video, 'watchEndpoint').find(e => e.playlistId === id)
            if (!endpoint) continue
            seen.add(video.contentId)
            const durationText = collect(video, 'thumbnailBadgeViewModel')[0]?.text || '0'
            videos.push({ title: video.metadata?.lockupMetadataViewModel?.title?.content || video.rendererContext?.accessibilityContext?.label || 'Video', youtubeId: video.contentId, url: `https://www.youtube.com/watch?v=${video.contentId}`, duration: durationText.split(':').reduce((sum, value) => sum * 60 + Number(value), 0) || 0 })
        }
        for (const video of collect(data, 'playlistVideoRenderer')) {
            if (!video.videoId || seen.has(video.videoId) || video.isPlayable === false) continue
            seen.add(video.videoId)
            videos.push({ title: text(video.title), youtubeId: video.videoId, url: `https://www.youtube.com/watch?v=${video.videoId}`, duration: Number(video.lengthSeconds || 0) })
        }
        const token = collect(data, 'continuationCommand')[0]?.token
        if (!token) break
        if (!key || !version || batch === 29) throw new Error('Playlist is too large to import completely. Import a smaller playlist.')
        const response = await fetch(`https://www.youtube.com/youtubei/v1/browse?key=${encodeURIComponent(key)}`, { method: 'POST', signal: AbortSignal.timeout(15000), headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ context: { client: { clientName: 'WEB', clientVersion: version, hl: 'en' } }, continuation: token }) })
        if (!response.ok) throw new Error('Could not load the remaining playlist videos')
        data = await response.json()
    }
    if (!videos.length) throw new Error('No public playable videos found in this playlist')
    return { title, author, thumbnail: `https://i.ytimg.com/vi/${videos[0].youtubeId}/hqdefault.jpg`, videos }
}
export default async function handler(req, res) {
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600')
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
    const { provider, id, type = 'playlist' } = req.query
    if (typeof id !== 'string' || !idPattern.test(id)) return res.status(400).json({ error: 'Invalid source ID' })
    try {
        if (provider === 'drive') return res.json(parseDrivePage(await page(`https://drive.google.com/drive/folders/${id}`)))
        if (provider === 'youtube' && ['video', 'playlist'].includes(type)) return res.json(await importYouTube(id, type))
        return res.status(400).json({ error: 'Unsupported public source' })
    } catch (error) {
        res.setHeader('Cache-Control', 'no-store')
        return res.status(422).json({ error: error.message })
    }
}

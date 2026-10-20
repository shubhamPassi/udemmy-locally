const idPattern = /^[a-zA-Z0-9_-]{8,160}$/

export function directDriveVideoUrl(id, apiKey = '') {
    if (!idPattern.test(id || '')) return ''
    const key = String(apiKey || '').trim()
    if (key) {
        const query = new URLSearchParams({ alt: 'media', key })
        return `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?${query}`
    }
    return `https://drive.usercontent.google.com/download?id=${encodeURIComponent(id)}&export=download&confirm=t`
}

export function directDriveFailureMessage(code, hasApiKey) {
    if (!hasApiKey) return 'Google did not provide a playable direct stream. Add a Google API key in Settings → AI & API Keys and enable Google Drive API for that key. The video must allow public download access. Your saved position and study history are preserved.'
    if (code === 3 || code === 4) return 'Google refused the media request or your browser cannot decode the original video. Check that Google Drive API is enabled, the API key permits this website, and the file allows public downloads. Preview-only or unsupported files cannot play in this custom player. Your saved position and study history are preserved.'
    return 'The direct Google stream was interrupted. Retry playback, or check the connection and Google API access. Your saved position and study history are preserved.'
}

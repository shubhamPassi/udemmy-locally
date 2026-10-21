const idPattern = /^[a-zA-Z0-9_-]{8,160}$/

export function directDriveVideoUrl(id, apiKey = '', account = false) {
    if (!idPattern.test(id || '')) return ''
    if (account) return `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?alt=media&tutin_account=1`
    const key = String(apiKey || '').trim()
    if (key) {
        const query = new URLSearchParams({ alt: 'media', key })
        return `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?${query}`
    }
    return `https://drive.usercontent.google.com/download?id=${encodeURIComponent(id)}&export=download&confirm=t`
}

export function directDriveFailureMessage(code, hasApiKey) {
    if (!hasApiKey) return 'Google did not provide a playable direct stream. Add a Google API key in Settings → AI & API Keys and enable Google Drive API for that key. The video must allow public download access. Your saved position and study history are preserved.'
    if (code === 3 || code === 4) return 'Google refused the media request or your browser cannot decode the original video. Google can temporarily block repeated video requests; wait before retrying. Also check Google Drive API access, website key restrictions, public download permission, and the original codec. Your saved position and study history are preserved.'
    return 'The direct Google stream was interrupted. Retry playback, or check the connection and Google API access. Your saved position and study history are preserved.'
}

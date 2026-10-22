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
    if (!hasApiKey) return 'Google did not provide a playable public direct stream. An API key is not required to try public playback. Public sharing does not guarantee that Google will allow this custom player to stream the original file. Check download permissions or connect Google Drive to try account-authorized playback. Your saved position and study history are preserved.'
    if (code === 3 || code === 4) return 'Google refused the media request or your browser cannot decode the original video. Google can temporarily block repeated video requests; wait before retrying. Also check Google Drive API access, website key restrictions, public download permission, and the original codec. Your saved position and study history are preserved.'
    return 'The direct Google stream was interrupted. Retry playback, or check the connection and Google API access. Your saved position and study history are preserved.'
}

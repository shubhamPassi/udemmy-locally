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
    if (!hasApiKey) return 'This video could not load. Connect your Google account to try again. No API key needed. Your progress is saved.'
    if (code === 3 || code === 4) return 'Google blocked playback or this video format is unsupported. Retry later. Your progress is saved.'
    return 'Playback was interrupted. Retry the video. Your progress is saved.'
}

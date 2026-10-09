export function driveFailureMessage(status) {
    if (status === 422 || status === 403) return 'Google Drive is not providing a downloadable video for this file. Check its public access and download permissions. Your saved position is preserved.'
    if (status === 503 || status === 429) return 'Google Drive is temporarily limiting this video. Try again shortly. Your saved position is preserved.'
    if (status === 206) return 'The file is reachable, but playback stopped. A network interruption or unsupported video format may be responsible. Your saved position is preserved.'
    return 'The Drive video could not be loaded. Check the connection or try Drive preview. Your saved position is preserved.'
}

const prefix = 'tutin_playback_'
const cachedBookmarks = new Map()
if (typeof window !== 'undefined') window.addEventListener('storage', event => {
    if (!event.key) cachedBookmarks.clear()
    else if (event.key.startsWith(prefix)) cachedBookmarks.delete(event.key.slice(prefix.length))
})
export function readPlaybackBookmark(id) {
    if (cachedBookmarks.has(id)) return cachedBookmarks.get(id)
    try {
        const saved = JSON.parse(localStorage.getItem(prefix + id))
        const result = saved && Number.isFinite(saved.position) && saved.position >= 0 ? saved : null
        cachedBookmarks.set(id, result)
        return result
    } catch { return null }
}
export function writePlaybackBookmark(id, position, duration) {
    if (!id || !Number.isFinite(position) || position < 0) return null
    const saved = { position, duration: Number.isFinite(duration) && duration > 0 ? duration : 0, updatedAt: new Date().toISOString() }
    cachedBookmarks.set(id, saved)
    try { localStorage.setItem(prefix + id, JSON.stringify(saved)) } catch { /* IndexedDB remains the primary store when localStorage is full. */ }
    return saved
}
export function withPlaybackBookmark(video) {
    const cached = readPlaybackBookmark(video.id)
    if (!cached || (video.lastWatchedAt && cached.updatedAt < video.lastWatchedAt)) return video
    const duration = cached.duration || video.duration || 0
    return { ...video, duration, lastWatchedPosition: cached.position, lastWatchedAt: cached.updatedAt,
        watchProgress: duration > 0 ? cached.position / duration : 0 }
}
export function resumeTime(video, enabled = true) {
    if (!enabled || video?.isCompleted) return 0
    const saved = withPlaybackBookmark(video)
    const position = Number(saved.lastWatchedPosition) || 0
    return saved.duration > 0 && position >= saved.duration - 2 ? 0 : position
}

const prefix = 'tutin_playback_'
const cachedBookmarks = new Map()
export function invalidatePlaybackBookmarks(){cachedBookmarks.clear()}
let resettingProgress = false
export const isProgressResetting = () => resettingProgress
export function beginProgressReset() { resettingProgress = true }
export function cancelProgressReset() { resettingProgress = false }
export function clearPlaybackBookmarks() {
    try {
        for (const id of cachedBookmarks.keys()) localStorage.removeItem(prefix + id)
        for (const key of Object.keys(localStorage)) if (key.startsWith(prefix)) localStorage.removeItem(key)
    } catch {}
    cachedBookmarks.clear()
}
export function writeCompletionBookmark(id, isCompleted) {
    if (resettingProgress) return
    const previous = readPlaybackBookmark(id) || { duration: 0 }
    const saved = { ...previous, isCompleted, updatedAt: new Date().toISOString() }
    cachedBookmarks.set(id, saved)
    try { localStorage.setItem(prefix + id, JSON.stringify(saved)) } catch {}
}
if (typeof window !== 'undefined') window.addEventListener('storage', event => {
    if (event.key === 'tutin_progress_reset') {
        resettingProgress = true
        cachedBookmarks.clear()
        document.querySelectorAll('video').forEach(video => video.pause())
        window.location.reload()
        return
    }
    if (!event.key) cachedBookmarks.clear()
    else if (event.key.startsWith(prefix)) cachedBookmarks.delete(event.key.slice(prefix.length))
})
export function readPlaybackBookmark(id) {
    if (cachedBookmarks.has(id)) return cachedBookmarks.get(id)
    try {
        const saved = JSON.parse(localStorage.getItem(prefix + id))
        const result = saved && ((Number.isFinite(saved.position) && saved.position >= 0) || (saved.position === undefined && typeof saved.isCompleted === 'boolean')) ? saved : null
        cachedBookmarks.set(id, result)
        return result
    } catch { return null }
}
export function writePlaybackBookmark(id, position, duration) {
    if (resettingProgress) return null
    if (!id || !Number.isFinite(position) || position < 0) return null
    const saved = { ...readPlaybackBookmark(id), position, duration: Number.isFinite(duration) && duration > 0 ? duration : 0, updatedAt: new Date().toISOString() }
    cachedBookmarks.set(id, saved)
    try { localStorage.setItem(prefix + id, JSON.stringify(saved)) } catch { /* IndexedDB remains the primary store when localStorage is full. */ }
    return saved
}
export function withPlaybackBookmark(video) {
    const cached = readPlaybackBookmark(video.id)
    if (!cached || (video.lastWatchedAt && cached.updatedAt < video.lastWatchedAt)) return video
    const duration = cached.duration || video.duration || 0
    const hasPosition = Number.isFinite(cached.position)
    return { ...video, isCompleted: cached.isCompleted ?? video.isCompleted, duration,
        lastWatchedPosition: hasPosition ? cached.position : video.lastWatchedPosition,
        lastWatchedAt: hasPosition ? cached.updatedAt : video.lastWatchedAt,
        watchProgress: hasPosition ? (duration > 0 ? cached.position / duration : 0) : video.watchProgress }
}
export function resumeTime(video, enabled = true) {
    if (!enabled || video?.isCompleted) return 0
    const saved = withPlaybackBookmark(video)
    const position = Number(saved.lastWatchedPosition) || 0
    return saved.duration > 0 && position >= saved.duration - 2 ? 0 : position
}

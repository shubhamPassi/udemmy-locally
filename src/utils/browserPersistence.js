import { withPlaybackBookmark } from './playbackBookmarks.js'
const backupKey = 'tutin_library_recovery_v1'
export async function requestPersistentStorage() {
    try {
        if (!navigator.storage?.persist) return false
        return await navigator.storage.persisted() || await navigator.storage.persist()
    } catch { return false }
}
export function saveLibraryRecovery(data) {
    try {
        const clean = row => {
            const { fileHandle, folderHandle, ...copy } = row
            if (copy.thumbnailData?.startsWith('data:')) copy.thumbnailData = null
            return copy
        }
        localStorage.setItem(backupKey, JSON.stringify({ version: 1, courses: data.courses.map(clean), modules: data.modules.map(clean), videos: data.videos.map(clean) }))
    } catch { /* Primary IndexedDB data remains usable if recovery storage is full. */ }
}
export async function restoreLibraryRecovery(db) {
    let backup
    try { backup = JSON.parse(localStorage.getItem(backupKey)) } catch { return }
    if (backup?.version !== 1 || !['courses','modules','videos'].every(name => Array.isArray(backup[name]))) return
    const count = await new Promise((resolve,reject) => {
        const request = db.transaction('courses').objectStore('courses').count()
        request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error)
    })
    if (count || !backup.courses.length) return
    await new Promise((resolve,reject) => {
        const tx = db.transaction(['courses','modules','videos'], 'readwrite')
        const videos = backup.videos.map(withPlaybackBookmark)
        for (const course of backup.courses) {
            const own = videos.filter(video => video.courseId === course.id)
            const completed = own.filter(video => video.isCompleted).length
            tx.objectStore('courses').put({ ...course, completedVideos: completed, completionPercentage: own.length ? completed / own.length * 100 : 0 })
        }
        for (const module of backup.modules) tx.objectStore('modules').put(module)
        for (const video of videos) tx.objectStore('videos').put(video)
        tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error)
    })
}

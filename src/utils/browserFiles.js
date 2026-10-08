const videoExtensions = /\.(mp4|webm|mov|ogg|avi|mkv|ts|m4v)$/i
import { localCourseTitle } from './localCourseTitles.js'
export async function pickBrowserFolder() {
    if (!window.showDirectoryPicker) throw new Error('Local folder import needs desktop Chrome or Edge. You can still import Google Drive or YouTube links here.')
    return window.showDirectoryPicker({ mode: 'read' })
}
export async function scanBrowserFolder(handle, rootPath = handle.name) {
    const entries = []
    for await (const entry of handle.values()) entries.push(entry)
    entries.sort((a,b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
    const modules = [], videos = []
    for (const entry of entries) {
        const filePath = `${rootPath}/${entry.name}`
        if (entry.kind === 'directory') {
            const child = await scanBrowserFolder(entry, filePath)
            if (child.totalVideos) modules.push({ title: entry.name, originalTitle: entry.name, folderPath: filePath, videos: [], subModules: child.modules, totalVideos: child.totalVideos, totalDuration: 0, order: modules.length })
        } else if (videoExtensions.test(entry.name)) {
            videos.push({ title: localCourseTitle(entry.name, true), originalTitle: entry.name, fileName: entry.name, filePath, fileHandle: entry, duration: 0, order: videos.length })
        }
    }
    if (videos.length) modules.unshift({ title: 'Videos', originalTitle: 'Videos', videos, totalVideos: videos.length, totalDuration: 0, order: 0 })
    modules.forEach((module, index) => { module.order = index })
    const totalVideos = modules.reduce((sum, mod) => sum + mod.totalVideos, 0)
    return { title: handle.name, folderPath: rootPath, folderHandle: handle, modules, totalVideos, totalDuration: 0 }
}
export async function browserVideoUrl(handle) {
    if (!handle) throw new Error('Please re-import or sync this course folder to reconnect its local files.')
    const options = { mode: 'read' }
    if (await handle.queryPermission(options) !== 'granted' && await handle.requestPermission(options) !== 'granted') throw new Error('Allow access to this course folder, then retry playback.')
    return URL.createObjectURL(await handle.getFile())
}

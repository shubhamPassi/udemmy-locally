import * as db from './db.js'
import { youtubeId } from './youtubeIdentity.js'
import { fetchPublicImport } from './publicImport.js'

export function parseRemoteSource(value) {
    let url
    try { url = new URL(value) } catch { throw Error('Enter the original Google Drive folder or YouTube playlist URL.') }
    if (url.protocol !== 'https:') throw Error('Use an HTTPS source URL.')
    if (url.hostname === 'drive.google.com') {
        const id = url.pathname.match(/\/folders\/([a-zA-Z0-9_-]+)/)?.[1]
        if (id) return { provider: 'drive', id, type: 'folder', url: url.href }
    }
    if (['youtube.com','www.youtube.com','m.youtube.com','youtu.be'].includes(url.hostname)) {
        const playlist = url.searchParams.get('list')
        const id = playlist || youtubeId({ url: url.href })
        if (id) return { provider: 'youtube', id, type: playlist ? 'playlist' : 'video', url: url.href }
    }
    throw Error('Use a Google Drive folder or YouTube video/playlist URL.')
}
export function remoteVideoKey(video) {
    const drive = video.driveFileId || video.url?.match(/drive\.google\.com\/(?:file\/d\/|.*[?&]id=)([a-zA-Z0-9_-]+)/)?.[1]
    return drive ? `drive:${drive}` : youtubeId(video) ? `youtube:${youtubeId(video)}` : null
}
export function planRemoteSync(content, incoming, source) {
    const existing = new Map((content.videos || []).map(video => [remoteVideoKey(video), video]).filter(([key]) => key))
    const seen = new Set(), additions = [], updates = [], modules = incoming.modules || []
    for (const [index, module] of modules.entries()) for (const video of module.videos || []) {
        const key = remoteVideoKey(video)
        if (!key || !key.startsWith(source.provider + ':')) throw Error('The scanned source contains an invalid video.')
        if (seen.has(key)) continue
        seen.add(key)
        const current = existing.get(key)
        if (current) updates.push({ id: current.id, incoming: video })
        else additions.push({ video, moduleIndex: index })
    }
    if (!seen.size) throw Error('No playable videos were found. Nothing has been changed.')
    if (existing.size && !updates.length) throw Error('This source does not match any existing lessons. Choose the original course source.')
    return { source, modules, additions, updates, missing: [...existing.keys()].filter(key => !seen.has(key)).length, subtitleFiles: updates.reduce((sum,item) => sum+(item.incoming.subtitleSources?.length || 0),0)+additions.reduce((sum,item) => sum+(item.video.subtitleSources?.length || 0),0) }
}
export async function scanRemoteSource(source) {
    if (source.provider === 'drive') {
        const { scanPublicDriveFolder } = await import('./googleDrive.js')
        return scanPublicDriveFolder(source.id, true)
    }
    const result = await fetchPublicImport('youtube', source.id, source.type, true)
    return { modules: [{ title: 'Videos', originalTitle: 'Videos', videos: result.videos }] }
}
const syncing = new Set()
export async function applyRemoteSync(courseId, preview, store = db) {
    if (syncing.has(courseId)) throw Error('This course is already syncing.')
    syncing.add(courseId)
    const addedVideos = [], addedModules = [], changed = []
    let previousCourse, contentCount=0
    try {
        const content = await store.getCourseContent(courseId)
        const plan = planRemoteSync(content, { modules: preview.modules }, preview.source)
        previousCourse = content.course
        contentCount = content.videos.length
        const revision = new Date().toISOString()
        const moduleIds = new Map()
        for (const addition of plan.additions) {
            const incoming = plan.modules[addition.moduleIndex]
            let module = content.modules.find(item => (item.originalTitle || item.title) === (incoming.originalTitle || incoming.title))
            if (plan.source.provider === 'youtube') module ||= content.modules.find(item => content.videos.some(video => video.moduleId === item.id && youtubeId(video)))
            if (!moduleIds.has(addition.moduleIndex)) {
                if (!module) { module = await store.addModule({ courseId, title: incoming.title, originalTitle: incoming.originalTitle || incoming.title, order: content.modules.length + addedModules.length }); addedModules.push(module.id) }
                moduleIds.set(addition.moduleIndex, module.id)
            }
            const video = addition.video, moduleId = moduleIds.get(addition.moduleIndex)
            const saved = await store.addVideo({ ...video, courseId, moduleId, order: Math.max(-1,...content.videos.filter(item => item.moduleId === moduleId).map(item => item.order || 0)) + 1 + addedVideos.length, subtitleRevision: revision,
                url: video.url || `https://drive.google.com/file/d/${video.driveFileId}/view` })
            addedVideos.push(saved.id)
        }
        for (const update of plan.updates) {
            const current = content.videos.find(video => video.id === update.id), video = update.incoming
            // Only source metadata is touched. IDs, notes, bookmarks, completion,
            // watch ranges and study history never get replaced by remote data.
            const patch = { originalTitle: video.originalTitle || video.title, transcriptRefreshAt: revision }
            const importedTitle = String(current.originalTitle || '').replace(/\.[^/.]+$/, '').replace(/^\d+[\s._-]+/, '')
            if (current.title === current.originalTitle || current.title === importedTitle) patch.title = video.title || current.title
            if (Number(video.duration) > 0) patch.duration = video.duration
            if (video.driveFileId) { patch.subtitleSources = video.subtitleSources || []; patch.driveFolderId = video.driveFolderId; patch.subtitleRevision = revision }
            const before = Object.fromEntries(Object.keys(patch).map(key => [key,current[key] ?? null]))
            changed.push({ id: current.id, before })
            await store.updateVideo(current.id, patch)
        }
        const refreshed = await store.getCourseContent(courseId)
        await store.updateCourse(courseId, { totalVideos: refreshed.videos.length, totalDuration: refreshed.videos.reduce((sum,video)=>sum+(Number(video.duration)||0),0), customMetadata: { ...content.course.customMetadata, remoteSource: plan.source, lastRemoteSyncAt: revision } })
        return { added: addedVideos.length, updated: plan.updates.length, kept: plan.missing, subtitleFiles: plan.subtitleFiles }
    } catch (error) {
        let incomplete = false
        for (const item of changed.reverse()) try { await store.updateVideo(item.id,item.before) } catch { incomplete = true }
        for (const id of addedVideos.reverse()) try { await store.deleteVideo(id) } catch { incomplete = true }
        for (const id of addedModules.reverse()) try { await store.deleteModule(id) } catch { incomplete = true }
        if (previousCourse) try { await store.updateCourse(courseId,{customMetadata:previousCourse.customMetadata || {}, totalVideos:previousCourse.totalVideos || contentCount, totalDuration:previousCourse.totalDuration || 0}) } catch { incomplete = true }
        if (incomplete) throw Error('Sync failed and cleanup was incomplete. Existing progress is preserved; refresh before retrying.')
        throw error
    } finally { syncing.delete(courseId) }
}

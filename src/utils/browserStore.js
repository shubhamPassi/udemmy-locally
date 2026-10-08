// Hosted app data stays in this browser. Structured cloning preserves folder/file handles.
import { saveLibraryRecovery, restoreLibraryRecovery } from './browserPersistence.js'
import { clearPlaybackBookmarks } from './playbackBookmarks.js'
const tables = ['courses', 'modules', 'videos', 'notes', 'instructors', 'roadmaps', 'transcripts', 'summaries']
let database
const dirtyCourses = new Set()
let aggregation = Promise.resolve(), aggregationTimer, recoveryTimer, recoveryEpoch = 0
async function saveRecovery() {
    const epoch = recoveryEpoch
    const [courses, modules, videos] = await Promise.all([all('courses'), all('modules'), all('videos')])
    if (epoch === recoveryEpoch) saveLibraryRecovery({ courses, modules, videos })
}
function scheduleRecovery() {
    clearTimeout(recoveryTimer)
    recoveryTimer = setTimeout(() => saveRecovery().catch(console.error), 1000)
}
function openDatabase() {
    if (!database) database = new Promise((resolve, reject) => {
        const opening = indexedDB.open('tutin-web', 1)
        opening.onupgradeneeded = () => {
            for (const name of [...tables, 'settings']) {
                const store = opening.result.objectStoreNames.contains(name)
                    ? opening.transaction.objectStore(name)
                    : opening.result.createObjectStore(name, { keyPath: 'id' })
                for (const field of ['courseId', 'moduleId', 'videoId']) if (!store.indexNames.contains(field)) store.createIndex(field, field)
            }
        }
        opening.onsuccess = () => {
            opening.result.onversionchange = () => { opening.result.close(); database = null }
            restoreLibraryRecovery(opening.result).then(() => { resolve(opening.result); scheduleRecovery() }, error => { database = null; reject(error) })
        }
        opening.onerror = () => { database = null; reject(opening.error) }
    })
    return database
}
async function operation(table, method, value) {
    const db = await openDatabase()
    return new Promise((resolve, reject) => {
        const tx = db.transaction(table, method === 'get' || method === 'getAll' ? 'readonly' : 'readwrite')
        const query = tx.objectStore(table)[method](value)
        tx.oncomplete = () => resolve(query.result)
        tx.onerror = () => reject(tx.error)
        tx.onabort = () => reject(tx.error || new Error('Browser storage write failed'))
    })
}
const all = name => operation(name, 'getAll')
const save = (name, row) => operation(name, 'put', row).then(() => row)
const sort = rows => rows.sort((a, b) => (a.order || 0) - (b.order || 0))
async function by(table, field, value) {
    const db = await openDatabase()
    // Existing v1 databases remain usable while other app tabs are open.
    if (!db.transaction(table).objectStore(table).indexNames.contains(field)) return (await all(table)).filter(row => row[field] === value)
    return new Promise((resolve, reject) => {
        const query = db.transaction(table).objectStore(table).index(field).getAll(value)
        query.onsuccess = () => resolve(query.result)
        query.onerror = () => reject(query.error)
    })
}
function invalidateCourse(courseId) {
    dirtyCourses.add(courseId)
    clearTimeout(aggregationTimer)
    aggregationTimer = setTimeout(() => flushProgress().catch(console.error), 100)
}
function flushProgress() {
    const ids = [...dirtyCourses]
    dirtyCourses.clear()
    aggregation = aggregation.catch(() => {}).then(async () => { for (const id of ids) await updateProgress(id) })
    return aggregation
}
async function updateProgress(courseId) {
    const [videos, modules] = await Promise.all([by('videos', 'courseId', courseId), by('modules', 'courseId', courseId)])
    const completed = videos.filter(v => v.isCompleted).length
    const totals = { totalVideos: videos.length, completedVideos: completed,
        totalDuration: videos.reduce((sum, v) => sum + (v.duration || 0), 0),
        completionPercentage: videos.length ? completed / videos.length * 100 : 0 }
    const db = await openDatabase()
    await new Promise((resolve, reject) => {
      const tx = db.transaction(['courses', 'modules'], 'readwrite')
      function merge(table, id, updates) {
        const store = tx.objectStore(table), current = store.get(id)
        current.onsuccess = () => { if (current.result) store.put({ ...current.result, ...updates }) }
      }
      merge('courses', courseId, totals)
      for (const mod of modules) {
        const own = videos.filter(v => v.moduleId === mod.id)
        merge('modules', mod.id, { totalDuration: own.reduce((sum, v) => sum + (v.duration || 0), 0), completedVideos: own.filter(v => v.isCompleted).length })
      }
      tx.oncomplete = resolve
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    })
}
async function removeRelated(courseId, moduleId) {
    for (const table of ['videos', 'modules', 'notes', 'transcripts', 'summaries']) {
        for (const row of await all(table)) {
            if (moduleId ? row.moduleId === moduleId : row.courseId === courseId) await operation(table, 'delete', row.id)
        }
    }
}
export async function request(method, path, body = {}) {
    const url = new URL(path, 'https://tutin.invalid')
    const [, table, id, action] = url.pathname.split('/').filter(Boolean)
    const now = new Date().toISOString()
    if (table === 'settings') {
        if (method === 'GET') return (await operation('settings', 'get', 'settings'))?.value || {}
        await save('settings', { id: 'settings', value: body }); return body
    }
    if (table === 'data') {
        if (id === 'reset-progress') {
            recoveryEpoch++
            clearTimeout(recoveryTimer)
            await flushProgress()
            const db = await openDatabase()
            await new Promise((resolve,reject) => {
                const tx = db.transaction(['courses','modules','videos'], 'readwrite')
                for (const name of ['courses','modules','videos']) {
                    const store = tx.objectStore(name), cursor = store.openCursor()
                    cursor.onsuccess = () => {
                        const current = cursor.result
                        if (!current) return
                        const row = { ...current.value, completedVideos: 0, completionPercentage: 0 }
                        if (name === 'videos') Object.assign(row,{isCompleted:false,watchProgress:0,lastWatchedPosition:0,lastWatchedAt:null,isFavorite:current.value.isFavorite})
                        if (name === 'courses') { row.lastAccessedClickTime = null; row.lastAccessed = null }
                        current.update(row); current.continue()
                    }
                }
                tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error)
            })
            clearPlaybackBookmarks()
            await saveRecovery()
            try { localStorage.setItem('tutin_progress_reset', String(Date.now())) } catch {}
            return { success:true }
        }
        if (id === 'course-thumbnail') return { thumbnailData: null }
        if (id === 'download-image') throw new Error('Use the image URL or upload a thumbnail in browser mode.')
        if (id === 'detect-durations') return { updated: 0, failed: 0 }
        if (id === 'export') {
            const data = { version: 4, exportedAt: now }
            for (const name of tables) data[name] = (await all(name)).map(({fileHandle, folderHandle, ...row}) => row)
            return data
        }
        if (id === 'reset') {
            recoveryEpoch++; clearTimeout(recoveryTimer)
            for (const name of [...tables, 'settings']) await operation(name, 'clear')
            clearPlaybackBookmarks()
            saveLibraryRecovery({courses:[],modules:[],videos:[]})
            return { success: true }
        }
        if (id === 'import') { for (const name of tables) for (const row of body[name] || []) await save(name, row); await saveRecovery(); return { success: true } }
    }
    if (table === 'analytics' && id === 'history') {
        const courses = await all('courses'), modules = await all('modules')
        return (await all('videos')).filter(v => v.lastWatchedAt).sort((a,b) => b.lastWatchedAt.localeCompare(a.lastWatchedAt)).slice(0, Number(url.searchParams.get('limit') || 10))
            .map(video => ({ video, course: courses.find(c => c.id === video.courseId), module: modules.find(m => m.id === video.moduleId) })).filter(item => item.course)
    }
    if (!tables.includes(table)) throw new Error('This feature requires the desktop companion server.')
    if (table === 'courses' && id === 'reorder') {
        for (const update of body.updates || []) {
            const row = await operation(table, 'get', update.id)
            if (row) await save(table, { ...row, order: update.order })
        }
        return { success: true }
    }
    if (table === 'courses' && id === 'recalculate-progress') {
        for (const course of await all(table)) await updateProgress(course.id)
        return { success: true }
    }
    if (id?.startsWith('by-')) {
        const key = { 'by-course': 'courseId', 'by-module': 'moduleId', 'by-video': 'videoId' }[id]
        const rows = sort(await by(table, key, action))
        if (method === 'DELETE') { for (const row of rows) await operation(table, 'delete', row.id); return { success: true } }
        return rows
    }
    if (table === 'courses' && action === 'content') {
        await flushProgress()
        const course = await operation(table, 'get', id)
        if (!course) throw new Error('Course not found')
        const [modules, videos] = await Promise.all([by('modules', 'courseId', id), by('videos', 'courseId', id)])
        return { course, modules: sort(modules), videos: sort(videos) }
    }
    if (method === 'GET') {
        if (table === 'courses' || table === 'modules') await flushProgress()
        if (id) return operation(table, 'get', id)
        let rows = sort(await all(table))
        if (url.searchParams.has('instructor')) rows = rows.filter(r => r.instructor?.toLowerCase() === url.searchParams.get('instructor').toLowerCase())
        return rows
    }
    if (method === 'DELETE') {
        recoveryEpoch++
        const existing = await operation(table, 'get', id)
        await operation(table, 'delete', id)
        if (table === 'courses') await removeRelated(id)
        if (table === 'modules') await removeRelated(existing?.courseId, id)
        if (existing?.courseId) invalidateCourse(existing.courseId)
        if (['courses','modules','videos'].includes(table)) await saveRecovery()
        return { success: true }
    }
    const existing = id ? await operation(table, 'get', id) : null
    const row = { createdAt: now, addedAt: now, completedVideos: 0, completionPercentage: 0,
        isCompleted: false, watchProgress: 0, lastWatchedPosition: 0, ...existing, ...body,
        id: id || body.id || `${table}_${crypto.randomUUID()}`, updatedAt: now }
    if (table === 'videos' && action === 'progress') row.lastWatchedAt = now
    if (table === 'courses') delete row.modules
    const result = await save(table, row)
    const affectsTotals = table === 'modules' || (table === 'videos' && (!existing || ['duration','isCompleted','moduleId','courseId'].some(key => key in body)))
    if (row.courseId && affectsTotals) invalidateCourse(row.courseId)
    if (['courses','modules','videos'].includes(table) && action !== 'progress') scheduleRecovery()
    return result
}

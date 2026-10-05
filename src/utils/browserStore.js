// Hosted app data stays in this browser. Structured cloning preserves folder/file handles.
const tables = ['courses', 'modules', 'videos', 'notes', 'instructors', 'roadmaps', 'transcripts', 'summaries']
let database
function openDatabase() {
    if (!database) database = new Promise((resolve, reject) => {
        const opening = indexedDB.open('tutin-web', 1)
        opening.onupgradeneeded = () => {
            for (const name of [...tables, 'settings']) opening.result.createObjectStore(name, { keyPath: 'id' })
        }
        opening.onsuccess = () => resolve(opening.result)
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
async function updateProgress(courseId) {
    const course = await operation('courses', 'get', courseId)
    if (!course) return
    const videos = (await all('videos')).filter(v => v.courseId === courseId)
    const completed = videos.filter(v => v.isCompleted).length
    await save('courses', { ...course, totalVideos: videos.length, completedVideos: completed,
        totalDuration: videos.reduce((sum, v) => sum + (v.duration || 0), 0),
        completionPercentage: videos.length ? completed / videos.length * 100 : 0 })
    for (const mod of (await all('modules')).filter(m => m.courseId === courseId)) {
        const own = videos.filter(v => v.moduleId === mod.id)
        await save('modules', { ...mod, totalDuration: own.reduce((sum, v) => sum + (v.duration || 0), 0), completedVideos: own.filter(v => v.isCompleted).length })
    }
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
        if (id === 'course-thumbnail') return { thumbnailData: null }
        if (id === 'download-image') throw new Error('Use the image URL or upload a thumbnail in browser mode.')
        if (id === 'detect-durations') return { updated: 0, failed: 0 }
        if (id === 'export') {
            const data = { version: 4, exportedAt: now }
            for (const name of tables) data[name] = (await all(name)).map(({fileHandle, folderHandle, ...row}) => row)
            return data
        }
        if (id === 'reset') { for (const name of [...tables, 'settings']) await operation(name, 'clear'); return { success: true } }
        if (id === 'import') { for (const name of tables) for (const row of body[name] || []) await save(name, row); return { success: true } }
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
        const rows = sort((await all(table)).filter(row => row[key] === action))
        if (method === 'DELETE') { for (const row of rows) await operation(table, 'delete', row.id); return { success: true } }
        return rows
    }
    if (table === 'courses' && action === 'content') {
        const course = await operation(table, 'get', id)
        if (!course) throw new Error('Course not found')
        return { course, modules: sort((await all('modules')).filter(m => m.courseId === id)), videos: sort((await all('videos')).filter(v => v.courseId === id)) }
    }
    if (method === 'GET') {
        if (id) return operation(table, 'get', id)
        let rows = sort(await all(table))
        if (url.searchParams.has('instructor')) rows = rows.filter(r => r.instructor?.toLowerCase() === url.searchParams.get('instructor').toLowerCase())
        return rows
    }
    if (method === 'DELETE') {
        const existing = await operation(table, 'get', id)
        await operation(table, 'delete', id)
        if (table === 'courses') await removeRelated(id)
        if (table === 'modules') await removeRelated(existing?.courseId, id)
        if (existing?.courseId) await updateProgress(existing.courseId)
        return { success: true }
    }
    const existing = id ? await operation(table, 'get', id) : null
    const row = { createdAt: now, addedAt: now, completedVideos: 0, completionPercentage: 0,
        isCompleted: false, watchProgress: 0, lastWatchedPosition: 0, ...existing, ...body,
        id: id || body.id || `${table}_${crypto.randomUUID()}`, updatedAt: now }
    if (table === 'videos' && action === 'progress') row.lastWatchedAt = now
    const result = await save(table, row)
    if (row.courseId && ['videos', 'modules'].includes(table)) await updateProgress(row.courseId)
    return result
}

export const libraryTables = ['courses', 'modules', 'videos', 'notes', 'instructors', 'roadmaps', 'transcripts', 'summaries']
let database
export function openLibraryDatabase() {
    if (!database) database = new Promise((resolve, reject) => {
        const request = indexedDB.open('tutin-web', 1)
        request.onupgradeneeded = () => {
            for (const name of [...libraryTables, 'settings']) {
                const store = request.result.objectStoreNames.contains(name) ? request.transaction.objectStore(name) : request.result.createObjectStore(name, { keyPath: 'id' })
                for (const field of ['courseId', 'moduleId', 'videoId']) if (!store.indexNames.contains(field)) store.createIndex(field, field)
            }
        }
        request.onsuccess = () => {
            request.result.onversionchange = () => { request.result.close(); database = null }
            resolve(request.result)
        }
        request.onerror = () => { database = null; reject(request.error) }
        request.onblocked = () => { database = null; reject(new Error('Close older app tabs to unlock browser storage.')) }
    })
    return database
}

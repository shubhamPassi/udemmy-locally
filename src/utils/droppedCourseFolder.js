export function hasDroppedFiles(transfer) {
    return Array.from(transfer?.types || []).includes('Files')
}

// Call during the drop event: browsers stop exposing drag data after it returns.
// Keep real, persistable directory/file handles for the existing local importer.
export function droppedCourseFolder(transfer) {
    const items = Array.from(transfer?.items || []).filter(item => item.kind === 'file')
    if (items.length !== 1) return Promise.reject(Error('Drop one course folder at a time.'))
    const item = items[0]
    if (typeof item.getAsFileSystemHandle !== 'function') return Promise.reject(Error('Folder drag and drop needs desktop Chrome or Edge. Use Add Course to choose a folder instead.'))
    let pending
    try { pending = item.getAsFileSystemHandle() } catch { return Promise.reject(Error('Could not read this folder. Use Add Course to choose it again.')) }
    return Promise.resolve(pending).then(handle => {
        if (handle?.kind !== 'directory') throw Error('Drop a course folder, rather than individual files.')
        return handle
    })
}
